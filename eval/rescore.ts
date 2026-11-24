// Re-score a results file from the cached model outputs, with no model call and no network: every row's output is
// rebuilt from eval/.cache (the Halfdoor card through the current pipeline), checked against the text stored in the
// row, then scored again with the current rules (answer key and provenance). Used when a scoring rule changes.
//   pnpm tsx eval/rescore.ts --results eval/results/final.json --note "why the rule changed"
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { provenance } from './metrics';
import type { RescoreRecord, ResultsFile } from './results';
import { aggregate, scoreOutput, type Row } from './score';
import { BudgetStop, SYSTEM_IDS, runSystem, type RunCtx, type SystemId } from './systems';
import type { EvalStory } from './types';

/** A run context that can only read the cache: a cache miss stops (spend guard at $0) and fetch always throws. */
export function cacheOnlyCtx(cacheDir?: string): RunCtx {
  return {
    apiKey: 'cache-only',
    cacheDir,
    budget: { spent: 0, max: 0 },
    fetchImpl: async () => {
      throw new Error('rescore makes no network calls');
    },
  };
}

/** Rebuild each row's output from the cache, check it is the stored text, and score it again. */
export async function rescore(
  f: ResultsFile,
  stories: Map<string, EvalStory>,
  opts: { cacheDir?: string; note: string; at?: string },
): Promise<{ file: ResultsFile; mismatches: string[] }> {
  const ctx = cacheOnlyCtx(opts.cacheDir);
  const e2ee = f.meta.models[0];
  const mismatches: string[] = [];
  const rows: Row[] = [];
  for (const row of f.rows) {
    const story = stories.get(row.storyId);
    if (!story) throw new Error(`no story ${row.storyId}`);
    if (!SYSTEM_IDS.includes(row.system as SystemId)) throw new Error(`unknown system ${row.system}`);
    const model = row.model.startsWith('e2ee-') ? row.model : e2ee;
    let text: string;
    try {
      const r = await runSystem(row.system as SystemId, story, model, ctx);
      if (r.error) throw new Error(r.error);
      text = r.text;
    } catch (e) {
      if (e instanceof BudgetStop) throw new Error(`no cached output for ${row.system}@${model} ${row.storyId}`);
      throw e;
    }
    if (row.text !== undefined && text !== row.text) mismatches.push(`${row.system}@${row.model} ${row.storyId}`);
    // A row stored without its text (a --no-text run) stays without it.
    rows.push({ ...row, ...(row.text !== undefined ? { text } : {}), score: scoreOutput(story, text), prov: provenance(text, story.text) });
  }
  const before: RescoreRecord['before'] = {};
  for (const { system, model, agg } of f.aggregates) {
    const p = agg.provenance;
    before[`${system}@${model}`] = {
      storiesWithUnsupported: p?.storiesWithUnsupported ?? 0,
      supportScored: p?.supportScored ?? 0,
      unsupportedMean: p?.unsupportedMean ?? 0,
      present: agg.present,
      trapHits: agg.trapHits,
    };
  }
  const aggregates = f.aggregates.map(({ system, model }) => ({
    system,
    model,
    agg: aggregate(rows.filter((r) => r.system === system && r.model === model)),
  }));
  const record: RescoreRecord = { at: opts.at ?? new Date().toISOString(), note: opts.note, before };
  return { file: { ...f, meta: { ...f.meta, rescored: [...(f.meta.rescored ?? []), record] }, aggregates, rows }, mismatches };
}

async function main() {
  const arg = (k: string) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const path = arg('results') ?? join(process.cwd(), 'eval', 'results', 'final.json');
  const note = arg('note');
  if (!note) throw new Error('--note is required: say which rule changed');
  const dir = join(process.cwd(), 'eval', 'stories');
  const stories = new Map(
    readdirSync(dir)
      .filter((n) => n.endsWith('.json'))
      .map((n) => JSON.parse(readFileSync(join(dir, n), 'utf8')) as EvalStory)
      .map((s) => [s.id, s]),
  );
  const f = JSON.parse(readFileSync(path, 'utf8')) as ResultsFile;
  const { file, mismatches } = await rescore(f, stories, { note });
  if (mismatches.length) throw new Error(`cached output differs from the stored text for ${mismatches.length} rows: ${mismatches.slice(0, 5).join(', ')}`);
  for (const { system, model, agg } of file.aggregates) {
    const b = file.meta.rescored!.at(-1)!.before[`${system}@${model}`];
    const p = agg.provenance;
    console.log(
      `${system}@${model}: facts ${b.present} -> ${agg.present}, traps ${b.trapHits} -> ${agg.trapHits}, ` +
        `outputs with an unsupported sentence ${b.storiesWithUnsupported}/${b.supportScored} -> ${p?.storiesWithUnsupported}/${p?.supportScored}, ` +
        `per output ${b.unsupportedMean.toFixed(2)} -> ${p?.unsupportedMean.toFixed(2)}`,
    );
  }
  writeFileSync(path, `${JSON.stringify(file, null, 1)}\n`);
  console.log(`wrote ${path} (${file.rows.length} rows, all from the cache)`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('eval/rescore.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : 'failed');
    process.exit(1);
  });
}
