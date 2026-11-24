// Results file shape + small formatting helpers shared by run.ts, render.ts and the README number script.
import { existsSync, readFileSync } from 'node:fs';
import type { Aggregate, ModelCandidate, Row } from './score';

/** One re-score of a results file from the cache (eval/rescore.ts): when, why, and the numbers it replaced. */
export type RescoreRecord = {
  at: string;
  note: string;
  /** Keyed `system@model`. */
  before: Record<string, { storiesWithUnsupported: number; supportScored: number; unsupportedMean: number; present: number; trapHits: number }>;
};

export type ResultsFile = {
  meta: {
    createdAt: string;
    stories: number;
    systems: string[];
    models: string[];
    claudeModel: string;
    maxTokens: number;
    concurrency: number;
    balanceBeforeUsd: number | null;
    balanceAfterUsd: number | null;
    liveSpendUsd: number;
    /** Re-scores of these same outputs from the cache after a scoring-rule change (eval/rescore.ts), oldest first. */
    rescored?: RescoreRecord[];
  };
  aggregates: { system: string; model: string; agg: Aggregate }[];
  /** Sweep only: model choice over the `halfdoor` aggregates. */
  choice?: { model: string; clean: boolean; fast: boolean; ranked: ModelCandidate[] };
  rows: Row[];
};

export const readResults = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as ResultsFile;

/** Hand review of automatic misses / trap hits, keyed `system/storyId/factOrTrapId`. */
export type Adjudication = {
  about?: string;
  notes?: Record<string, string>;
  items: Record<string, { verdict: 'real' | 'scorer'; note: string }>;
};

export const readAdjudication = (path: string): Adjudication =>
  existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Adjudication) : { items: {} };

export type Adjudicated = { present: number; total: number; trapHits: number; scorerMisses: number; scorerTraps: number; unreviewed: number };

/** Automatic counts corrected by the review: a "scorer" miss counts as kept, a "scorer" trap hit is dropped. */
export function adjudicate(f: ResultsFile, adj: Adjudication): Map<string, Adjudicated> {
  const out = new Map<string, Adjudicated>();
  for (const { system, agg } of f.aggregates) {
    const a: Adjudicated = { present: agg.present, total: agg.total, trapHits: agg.trapHits, scorerMisses: 0, scorerTraps: 0, unreviewed: 0 };
    for (const r of f.rows.filter((x) => x.system === system)) {
      for (const [ids, isTrap] of [[r.score.missing, false], [r.score.trapHits, true]] as const) {
        for (const id of ids) {
          const v = adj.items[`${system}/${r.storyId}/${id}`]?.verdict;
          if (!v) a.unreviewed++;
          else if (v === 'scorer' && isTrap) {
            a.scorerTraps++;
            a.trapHits--;
          } else if (v === 'scorer') {
            a.scorerMisses++;
            a.present++;
          }
        }
      }
    }
    out.set(system, a);
  }
  return out;
}

export const pct = (a: number, b: number) => (b === 0 ? 'n/a' : `${((100 * a) / b).toFixed(1)}%`);
export const frac = (a: number, b: number) => `${pct(a, b)} (${a}/${b})`;
export const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
/** Dollars: 4 decimals below $0.10 (per-story costs are fractions of a cent), 2 from $0.10 up. */
export const usd = (x: number) => `$${Math.abs(x) < 0.1 ? x.toFixed(4) : x.toFixed(2)}`;
export const num = (x: number, d = 1) => x.toFixed(d);
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const SYSTEM_LABEL: Record<string, string> = {
  halfdoor: 'Halfdoor card',
  halfdoor_net: 'Halfdoor card + safety net accepted',
  baseline_same: 'Plain summary, same enclave model',
  baseline_claude: 'Plain summary, Claude Sonnet 5.5',
  baseline_same_short: 'Short card prompt, same enclave model',
  baseline_claude_short: 'Short card prompt, Claude Sonnet 5.5',
};

export function table(head: string[], rows: (string | number)[][]): string {
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

export function headlineTable(f: ResultsFile): string {
  return table(
    ['System', 'Model', 'Safety facts kept', 'Limiter facts kept', 'Trap hits (flips / numbers / sibling)', 'Stories with a trap hit'],
    f.aggregates.map(({ system, model, agg }) => [
      SYSTEM_LABEL[system] ?? system,
      `\`${model}\``,
      frac(agg.present, agg.total),
      frac(agg.limiterPresent, agg.limiterTotal),
      `${agg.trapHits} (${agg.trapClasses.flips} / ${agg.trapClasses.number} / ${agg.trapClasses.sibling})`,
      `${agg.storiesWithTrap}/${agg.stories}`,
    ]),
  );
}

export function provenanceTable(f: ResultsFile): string {
  return table(
    [
      'System',
      'Sentences not grounded in the story, per output',
      'Outputs with any',
      'Unsaid diagnosis labels: exact word / label family',
      'Words, mean / median',
      'Reading time at 200 wpm, mean / median',
    ],
    f.aggregates.flatMap(({ system, agg }) => {
      const p = agg.provenance;
      if (!p) return [];
      const other = agg.stories - p.supportScored;
      return [
        [
          SYSTEM_LABEL[system] ?? system,
          `${num(p.unsupportedMean, 2)} (of ${num(p.sentencesMean)} sentences)`,
          `${p.storiesWithUnsupported}/${p.supportScored}${other > 0 ? ` (${other} not scored)` : ''}`,
          `${p.outputsWithUnsaidLabel} / ${p.outputsWithUnsaidFamily} outputs`,
          `${Math.round(p.wordsMean)} / ${p.wordsP50}`,
          `${sec(p.readSecMean * 1000)} / ${sec(p.readSecP50 * 1000)}`,
        ],
      ];
    }),
  );
}
