// Fill `<!-- eval:NAME -->…<!-- /eval:NAME -->` blocks in README.md / CLAIMS.md from eval/results/final.json.
//   pnpm tsx scripts/render-readme-numbers.ts      (no-op for files or blocks that are absent)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { adjudicate, frac, headlineTable, num, provenanceTable, readAdjudication, readResults, sec, usd, type Adjudication, type ResultsFile } from '../eval/results';

const BLOCK = /<!-- eval:([\w-]+) -->([\s\S]*?)<!-- \/eval:\1 -->/g;

export function replaceEvalBlocks(doc: string, values: Record<string, string>): { text: string; replaced: string[]; unknown: string[] } {
  const replaced: string[] = [];
  const unknown: string[] = [];
  const text = doc.replace(BLOCK, (whole, name: string) => {
    const v = values[name];
    if (v === undefined) {
      unknown.push(name);
      return whole;
    }
    replaced.push(name);
    const body = v.includes('\n') ? `\n${v}\n` : v;
    return `<!-- eval:${name} -->${body}<!-- /eval:${name} -->`;
  });
  return { text, replaced, unknown };
}

/**
 * Every name a README/CLAIMS block may use. Per system: `<system>-present|limiter|traps|flips|number|sibling|
 * stories-with-trap|p50|p95|cost` (automatic scoring), `<system>-reviewed-present|reviewed-traps` (after hand review),
 * `<system>-ungrounded|words|read|unsaid-labels` (provenance); also `headline` and `provenance` tables.
 */
export function evalValues(f: ResultsFile, adj: Adjudication = { items: {} }): Record<string, string> {
  const reviewed = adjudicate(f, adj);
  const v: Record<string, string> = {
    headline: headlineTable(f),
    model: f.meta.models.join(', '),
    'claude-model': f.meta.claudeModel,
    stories: String(f.meta.stories),
  };
  for (const { system, agg } of f.aggregates) {
    v[`${system}-present`] = frac(agg.present, agg.total);
    v[`${system}-limiter`] = frac(agg.limiterPresent, agg.limiterTotal);
    v[`${system}-traps`] = String(agg.trapHits);
    v[`${system}-flips`] = String(agg.trapClasses.flips);
    v[`${system}-number`] = String(agg.trapClasses.number);
    v[`${system}-sibling`] = String(agg.trapClasses.sibling);
    v[`${system}-stories-with-trap`] = `${agg.storiesWithTrap}/${agg.stories}`;
    v[`${system}-p50`] = sec(agg.p50Ms);
    v[`${system}-p95`] = sec(agg.p95Ms);
    v[`${system}-cost`] = usd(agg.costUsd);
    const r = reviewed.get(system)!;
    v[`${system}-reviewed-present`] = frac(r.present, r.total);
    v[`${system}-reviewed-traps`] = String(r.trapHits);
    if (agg.noSafety.safetyItems !== null) v[`${system}-noise`] = `${agg.noSafety.safetyItems} items, ${agg.noSafety.safetyPrompts} prompts on ${agg.noSafety.stories} no-safety stories`;
    const p = agg.provenance;
    if (p) {
      v[`${system}-ungrounded`] = num(p.unsupportedMean, 2);
      v[`${system}-words`] = String(Math.round(p.wordsMean));
      v[`${system}-read`] = sec(p.readSecMean * 1000);
      v[`${system}-unsaid-labels`] = String(p.outputsWithUnsaidFamily);
    }
  }
  v.provenance = provenanceTable(f);
  if (f.aggregates[0]) v['facts-total'] = String(f.aggregates[0].agg.total);
  return v;
}

function main() {
  const resultsPath = join(process.cwd(), 'eval', 'results', 'final.json');
  if (!existsSync(resultsPath)) {
    console.log('no eval/results/final.json yet; nothing to render');
    return;
  }
  const values = evalValues(readResults(resultsPath), readAdjudication(join(process.cwd(), 'eval', 'results', 'adjudication.json')));
  for (const name of ['README.md', 'CLAIMS.md']) {
    const path = join(process.cwd(), name);
    if (!existsSync(path)) continue;
    const before = readFileSync(path, 'utf8');
    const r = replaceEvalBlocks(before, values);
    if (r.text !== before) writeFileSync(path, r.text);
    console.log(`${name}: ${r.replaced.length} block(s) filled${r.unknown.length ? `, unknown: ${r.unknown.join(', ')}` : ''}`);
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/render-readme-numbers.ts')) main();
