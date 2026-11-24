// Draw the hand-validation sample for the support rule (eval/metrics.ts): N random UNSUPPORTED and N random
// SUPPORTED sentences from the baseline outputs, seeded. Judgments are filled in by hand afterwards.
//   pnpm tsx eval/support-sample.ts --results eval/results/final.json --seed 2026 --n 20 --out eval/results/support-validation.json
// A check on the short-card baselines only goes under its own key instead of a new round:
//   pnpm tsx eval/support-sample.ts --systems baseline_same_short,baseline_claude_short --key shortCard --seed 2028 --n 15 --out ...
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { childNameFor } from './childName';
import { MAX_IGNORED_WORDS, SUPPORT_THRESHOLD, contentKeys, outputClaims, sameLanguage, sentenceSupport } from './metrics';
import { readResults, type ResultsFile } from './results';

export type SupportSample = {
  system: string;
  storyId: string;
  sentence: string;
  flagged: 'unsupported' | 'supported';
  keys: number;
  inStory: number;
  /** Hand judgment: does the story state (or translate to) everything this sentence claims? */
  grounded: boolean | null;
  note: string;
};

export type SupportValidation = { rule: string; seed: number; round: number; systems?: string[]; samples: SupportSample[] };
/** `rounds`: checks on the plain (one-page) baselines; `shortCard`: the check on the short-card baselines alone. */
export type SupportValidationFile = { about?: string; rounds: SupportValidation[]; shortCard?: SupportValidation };

export const SUPPORT_RULE = `supported if >= ${(SUPPORT_THRESHOLD * 100).toFixed(0)}% of content words (4+ letters, not stopwords, 5-char prefix) occur in the story; sentences of <= ${MAX_IGNORED_WORDS} words ignored; title and heading lines ignored; outputs in another language than the story not scored`;

/** Every scored claim sentence of the given systems' outputs, flagged by the rule (titles, short lines and cross-language outputs left out). */
export function samplePool(res: ResultsFile, systems: (s: string) => boolean, readStory: (id: string) => string): { pool: SupportSample[]; skipped: number } {
  const pool: SupportSample[] = [];
  let skipped = 0;
  for (const r of res.rows.filter((x) => systems(x.system))) {
    const story = readStory(r.storyId);
    if (!sameLanguage(r.text ?? '', story)) {
      skipped++;
      continue;
    }
    const keys = new Set(contentKeys(story));
    for (const c of outputClaims(r.text ?? '', childNameFor(story))) {
      const sup = c.title ? null : sentenceSupport(c.sentence, keys);
      if (sup) pool.push({ system: r.system, storyId: r.storyId, sentence: c.sentence, flagged: sup.supported ? 'supported' : 'unsupported', keys: sup.keys, inStory: sup.inStory, grounded: null, note: '' });
    }
  }
  return { pool, skipped };
}

/** mulberry32 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sample<T>(xs: T[], n: number, rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function main() {
  const arg = (k: string) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const res = readResults(arg('results') ?? join(process.cwd(), 'eval', 'results', 'final.json'));
  const seed = Number(arg('seed') ?? 2026);
  const n = Number(arg('n') ?? 20);
  const out = arg('out');
  const key = arg('key');
  if (key !== undefined && key !== 'shortCard') throw new Error('--key must be shortCard');
  const only = arg('systems')?.split(',');
  const readStory = (id: string) => (JSON.parse(readFileSync(join(process.cwd(), 'eval', 'stories', `${id}.json`), 'utf8')) as { text: string }).text;
  const { pool, skipped } = samplePool(res, (s) => (only ? only.includes(s) : s.startsWith('baseline')), readStory);
  const rand = rng(seed);
  const v: SupportValidation = {
    rule: SUPPORT_RULE,
    seed,
    round: Number(arg('round') ?? 1),
    ...(only ? { systems: only } : {}),
    samples: [...sample(pool.filter((p) => p.flagged === 'unsupported'), n, rand), ...sample(pool.filter((p) => p.flagged === 'supported'), n, rand)],
  };
  console.log(`pool: ${pool.length} baseline sentences (${pool.filter((p) => p.flagged === 'unsupported').length} unsupported); ${skipped} cross-language outputs skipped`);
  if (out) {
    const file: SupportValidationFile = existsSync(out) ? (JSON.parse(readFileSync(out, 'utf8')) as SupportValidationFile) : { rounds: [] };
    if (key) {
      if (file[key]) throw new Error(`${key} already in ${out}; judgments would be lost`);
      file[key] = v;
    } else {
      if (file.rounds.some((x) => x.round === v.round)) throw new Error(`round ${v.round} already in ${out}; judgments would be lost`);
      file.rounds.push(v);
    }
    writeFileSync(out, `${JSON.stringify(file, null, 1)}\n`);
  }
  for (const [i, s] of v.samples.entries()) console.log(`${i}\t${s.flagged}\t${s.system}\t${s.storyId}\t${s.inStory}/${s.keys}\t${s.sentence}`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('eval/support-sample.ts')) main();

export type CheckCounts = { flagged: { n: number; of: number }; passed: { n: number; of: number } };

/** A hand check's two numbers: flagged sentences that really add something, passed ones that really are grounded. `skip` leaves samples out. */
export function checkCounts(v: SupportValidation, skip: (s: SupportSample) => boolean = () => false): CheckCounts {
  const judged = v.samples.filter((s) => s.grounded !== null && !skip(s));
  const flagged = judged.filter((s) => s.flagged === 'unsupported');
  const passed = judged.filter((s) => s.flagged === 'supported');
  return {
    flagged: { n: flagged.filter((s) => s.grounded === false).length, of: flagged.length },
    passed: { n: passed.filter((s) => s.grounded === true).length, of: passed.length },
  };
}

/** True when the current rule reads a sampled sentence as part of a title or heading line, so it is no longer scored. */
export function isTitleNow(s: SupportSample, res: ResultsFile, storyText: (id: string) => string): boolean {
  const row = res.rows.find((r) => r.system === s.system && r.storyId === s.storyId);
  if (!row?.text) return false;
  return outputClaims(row.text, childNameFor(storyText(s.storyId))).some((c) => c.title && c.sentence === s.sentence);
}
