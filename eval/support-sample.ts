// Draw the hand-validation sample for the support rule (eval/metrics.ts): N random UNSUPPORTED and N random
// SUPPORTED sentences from the baseline outputs, seeded. Judgments are filled in by hand afterwards.
//   pnpm tsx eval/support-sample.ts --results eval/results/final.json --seed 2026 --n 20 --out eval/results/support-validation.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_IGNORED_WORDS, SUPPORT_THRESHOLD, contentKeys, outputSentences, sameLanguage, sentenceSupport } from './metrics';
import { readResults } from './results';

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

export type SupportValidation = { rule: string; seed: number; round: number; samples: SupportSample[] };
export type SupportValidationFile = { about?: string; rounds: SupportValidation[] };

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
  const pool: SupportSample[] = [];
  let skipped = 0;
  for (const r of res.rows.filter((x) => x.system.startsWith('baseline'))) {
    const story = JSON.parse(readFileSync(join(process.cwd(), 'eval', 'stories', `${r.storyId}.json`), 'utf8')) as { text: string };
    if (!sameLanguage(r.text ?? '', story.text)) {
      skipped++;
      continue;
    }
    const keys = new Set(contentKeys(story.text));
    for (const s of outputSentences(r.text ?? '')) {
      const sup = sentenceSupport(s, keys);
      if (sup) pool.push({ system: r.system, storyId: r.storyId, sentence: s, flagged: sup.supported ? 'supported' : 'unsupported', keys: sup.keys, inStory: sup.inStory, grounded: null, note: '' });
    }
  }
  const rand = rng(seed);
  const v: SupportValidation = {
    rule: `supported if >= ${(SUPPORT_THRESHOLD * 100).toFixed(0)}% of content words (4+ letters, not stopwords, 5-char prefix) occur in the story; sentences of <= ${MAX_IGNORED_WORDS} words ignored; outputs in another language than the story not scored`,
    seed,
    round: Number(arg('round') ?? 1),
    samples: [...sample(pool.filter((p) => p.flagged === 'unsupported'), n, rand), ...sample(pool.filter((p) => p.flagged === 'supported'), n, rand)],
  };
  console.log(`pool: ${pool.length} baseline sentences (${pool.filter((p) => p.flagged === 'unsupported').length} unsupported); ${skipped} cross-language outputs skipped`);
  if (out) {
    const file: SupportValidationFile = existsSync(out) ? (JSON.parse(readFileSync(out, 'utf8')) as SupportValidationFile) : { rounds: [] };
    if (file.rounds.some((x) => x.round === v.round)) throw new Error(`round ${v.round} already in ${out}; judgments would be lost`);
    file.rounds.push(v);
    writeFileSync(out, `${JSON.stringify(file, null, 1)}\n`);
  }
  for (const [i, s] of v.samples.entries()) console.log(`${i}\t${s.flagged}\t${s.system}\t${s.storyId}\t${s.inStory}/${s.keys}\t${s.sentence}`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('eval/support-sample.ts')) main();
