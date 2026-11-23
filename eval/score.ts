// Scoring per eval/stories/README.md: facts are AND-of-OR regex groups over the whole output,
// limiter facts carry their negation inside the pattern, traps fire when their pattern matches.
import type { EvalStory } from './types';

const FLAGS = 'iu';
const compiled = new Map<string, RegExp>();
function re(src: string): RegExp {
  let r = compiled.get(src);
  if (!r) {
    r = new RegExp(src, FLAGS);
    compiled.set(src, r);
  }
  return r;
}

/** Trap types that flip a fact's polarity (says the opposite of the parent). */
export const FLIP_TYPES = ['outgrown', 'negated_pickup', 'only_may', 'doesnt_need', 'double_negation', 'cancelled_med'] as const;
export const TRAP_CLASSES = ['flips', 'number', 'sibling'] as const;
export type TrapClass = (typeof TRAP_CLASSES)[number];

export function trapClass(trapId: string): TrapClass {
  const type = trapId.split('.')[0];
  if (type === 'number') return 'number';
  if (type === 'sibling') return 'sibling';
  if ((FLIP_TYPES as readonly string[]).includes(type)) return 'flips';
  throw new Error(`unknown trap type: ${trapId}`);
}

export type Score = {
  present: number;
  total: number;
  limiterPresent: number;
  limiterTotal: number;
  /** Trap hits of a polarity-flip type (same ids as `trapClasses.flips`). */
  flips: string[];
  missing: string[];
  trapHits: string[];
  trapClasses: Record<TrapClass, string[]>;
};

export function scoreOutput(story: EvalStory, text: string): Score {
  const out = text.normalize('NFC');
  const missing: string[] = [];
  let present = 0;
  let limiterPresent = 0;
  let limiterTotal = 0;
  for (const f of story.facts) {
    const ok = f.must.every((group) => group.some((src) => re(src).test(out)));
    if (f.limiter) limiterTotal++;
    if (ok) {
      present++;
      if (f.limiter) limiterPresent++;
    } else missing.push(f.id);
  }
  const trapHits = story.traps.filter((t) => re(t.pattern).test(out)).map((t) => t.id);
  const trapClasses: Record<TrapClass, string[]> = { flips: [], number: [], sibling: [] };
  for (const id of trapHits) trapClasses[trapClass(id)].push(id);
  return { present, total: story.facts.length, limiterPresent, limiterTotal, flips: [...trapClasses.flips], missing, trapHits, trapClasses };
}

export type Row = {
  system: string;
  model: string;
  storyId: string;
  noSafety: boolean;
  score: Score;
  latencyMs: number;
  costUsd: number;
  cached: boolean;
  /** Halfdoor only: `safety` items on the card (after acceptance for halfdoor_net). */
  safetyItems?: number;
  /** Halfdoor only: safety-net prompts the card raised (before acceptance). */
  safetyPrompts?: number;
  error?: string;
  text?: string;
};

/** Nearest-rank percentile; 0 for an empty list. */
export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length, Math.max(1, Math.ceil((p / 100) * s.length))) - 1];
}

export type Aggregate = {
  stories: number;
  present: number;
  total: number;
  limiterPresent: number;
  limiterTotal: number;
  trapHits: number;
  trapClasses: Record<TrapClass, number>;
  storiesWithTrap: number;
  noSafety: { stories: number; safetyItems: number | null; safetyPrompts: number | null; storiesWithAny: number | null };
  p50Ms: number;
  p95Ms: number;
  costUsd: number;
  errors: number;
};

export function aggregate(rows: Row[]): Aggregate {
  const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
  const ns = rows.filter((r) => r.noSafety);
  const burden = ns.some((r) => r.safetyItems !== undefined);
  // A request that failed before any model call has no latency to report.
  const lat = rows.map((r) => r.latencyMs).filter((ms) => ms > 0);
  return {
    stories: rows.length,
    present: sum((r) => r.score.present),
    total: sum((r) => r.score.total),
    limiterPresent: sum((r) => r.score.limiterPresent),
    limiterTotal: sum((r) => r.score.limiterTotal),
    trapHits: sum((r) => r.score.trapHits.length),
    trapClasses: {
      flips: sum((r) => r.score.trapClasses.flips.length),
      number: sum((r) => r.score.trapClasses.number.length),
      sibling: sum((r) => r.score.trapClasses.sibling.length),
    },
    storiesWithTrap: rows.filter((r) => r.score.trapHits.length > 0).length,
    noSafety: {
      stories: ns.length,
      safetyItems: burden ? ns.reduce((a, r) => a + (r.safetyItems ?? 0), 0) : null,
      safetyPrompts: burden ? ns.reduce((a, r) => a + (r.safetyPrompts ?? 0), 0) : null,
      storiesWithAny: burden ? ns.filter((r) => (r.safetyItems ?? 0) + (r.safetyPrompts ?? 0) > 0).length : null,
    },
    p50Ms: percentile(lat, 50),
    p95Ms: percentile(lat, 95),
    costUsd: sum((r) => r.costUsd),
    errors: rows.filter((r) => r.error).length,
  };
}

export type ModelCandidate = { model: string; flips: number; trapHits: number; presentRate: number; p50Ms: number };

export const P50_LIMIT_MS = 8000;

/**
 * Task 9 rule: 0 flips and 0 trap hits, then highest present-rate, then p50 < 8 s. The latency clause is
 * read as a requirement, not a tie-break (as a tie-break it would almost never apply): safety first
 * (fewest flips, then fewest traps), then models under the p50 limit, then present-rate, then faster.
 * `clean` = the winner has 0 flips and 0 traps; `fast` = its p50 is under the limit.
 */
export function chooseModel(cands: ModelCandidate[]): { model: string; clean: boolean; fast: boolean; ranked: ModelCandidate[] } {
  const slow = (c: ModelCandidate) => (c.p50Ms < P50_LIMIT_MS ? 0 : 1);
  const ranked = [...cands].sort(
    (a, b) =>
      a.flips - b.flips ||
      a.trapHits - b.trapHits ||
      slow(a) - slow(b) ||
      b.presentRate - a.presentRate ||
      a.p50Ms - b.p50Ms,
  );
  if (ranked.length === 0) throw new Error('no models to choose from');
  const w = ranked[0];
  return { model: w.model, clean: w.flips + w.trapHits === 0, fast: w.p50Ms < P50_LIMIT_MS, ranked };
}
