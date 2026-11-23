// Scorer validation: automatic flags (misses + trap hits) vs the hand review in adjudication.json,
// scored raw (README rules as written) and with the markdown-aware normalizer.
//   git show b277f60:eval/results/final.json > r0.json      (the outputs the review was done on)
//   pnpm tsx eval/agreement.ts --results r0.json --out eval/results/scorer-agreement.json
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAdjudication, readResults } from './results';
import { scoreOutput } from './score';
import type { EvalStory } from './types';

export type AgreementItem = { key: string; verdict: 'real' | 'scorer' | null; before: boolean; after: boolean };
export type AgreementFile = {
  source: string;
  reviewed: number;
  before: { agree: number; disagree: string[] };
  after: { agree: number; disagree: string[] };
  /** Flags that appear only after normalization and have no review yet. */
  unreviewedNewFlags: string[];
  items: AgreementItem[];
};

/** A flag agrees with the review when it is raised for a real problem and not raised for a scorer artifact. */
export function agreement(rows: { system: string; storyId: string; text?: string }[], stories: Map<string, EvalStory>, adj: ReturnType<typeof readAdjudication>, source: string): AgreementFile {
  const flags = (raw: boolean) => {
    const out = new Set<string>();
    for (const r of rows) {
      const s = scoreOutput(stories.get(r.storyId)!, r.text ?? '', { normalize: !raw });
      for (const id of [...s.missing, ...s.trapHits]) out.add(`${r.system}/${r.storyId}/${id}`);
    }
    return out;
  };
  const before = flags(true);
  const after = flags(false);
  const keys = [...new Set([...Object.keys(adj.items), ...before, ...after])].sort();
  const items: AgreementItem[] = keys.map((key) => ({ key, verdict: adj.items[key]?.verdict ?? null, before: before.has(key), after: after.has(key) }));
  const agrees = (flagged: boolean, v: AgreementItem['verdict']) => (v === 'real' ? flagged : !flagged);
  const reviewed = items.filter((i) => i.verdict !== null);
  return {
    source,
    reviewed: reviewed.length,
    before: { agree: reviewed.filter((i) => agrees(i.before, i.verdict)).length, disagree: reviewed.filter((i) => !agrees(i.before, i.verdict)).map((i) => i.key) },
    after: { agree: reviewed.filter((i) => agrees(i.after, i.verdict)).length, disagree: reviewed.filter((i) => !agrees(i.after, i.verdict)).map((i) => i.key) },
    unreviewedNewFlags: items.filter((i) => i.verdict === null && i.after).map((i) => i.key),
    items,
  };
}

function main() {
  const arg = (k: string) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const resultsPath = arg('results');
  if (!resultsPath) throw new Error('--results <final.json of the reviewed run> is required');
  const dir = join(process.cwd(), 'eval', 'stories');
  const stories = new Map(
    readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as EvalStory)
      .map((s) => [s.id, s]),
  );
  const res = readResults(resultsPath);
  const adj = readAdjudication(join(process.cwd(), 'eval', 'results', 'adjudication.json'));
  const a = agreement(res.rows, stories, adj, arg('source') ?? resultsPath);
  console.log(`reviewed items: ${a.reviewed}`);
  console.log(`agreement raw (README rules): ${a.before.agree}/${a.reviewed}; disagree: ${a.before.disagree.join(', ') || '-'}`);
  console.log(`agreement normalized:         ${a.after.agree}/${a.reviewed}; disagree: ${a.after.disagree.join(', ') || '-'}`);
  console.log(`new flags with no review: ${a.unreviewedNewFlags.join(', ') || '-'}`);
  const out = arg('out');
  if (out) {
    writeFileSync(out, `${JSON.stringify(a, null, 1)}\n`);
    console.log(`wrote ${out}`);
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('eval/agreement.ts')) main();
