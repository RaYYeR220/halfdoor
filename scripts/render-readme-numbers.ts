// Fill `<!-- eval:NAME -->…<!-- /eval:NAME -->` blocks in the public docs from eval/results/final.json
// (+ adjudication.json for the hand review and support-validation.json for the grounding rule's hand check).
//   pnpm tsx scripts/render-readme-numbers.ts      (no-op for files or blocks that are absent)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SYSTEM_LABEL, adjudicate, frac, headlineTable, num, pct, plural, provenanceTable, readAdjudication, readResults, sec, table, usd,
  type Adjudicated, type Adjudication, type ResultsFile,
} from '../eval/results';
import { checkCounts, type CheckCounts, type SupportValidationFile } from '../eval/support-sample';

/** The docs the script fills, at the repo root. */
export const DOCS = ['README.md', 'JUDGES.md', 'CLAIMS.md'] as const;

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

/** A row that re-scores another system's output (the safety-net row reuses the Halfdoor card's model call). */
export const reusesCall = (system: string) => system.endsWith('_net');
const isBaseline = (system: string) => system.startsWith('baseline');

const ofText = (n: number, of: number) => `${n} of ${of}`;
const pctOf = (n: number, of: number) => `${pct(n, of).replace(/\.0%$/, '%')} (${ofText(n, of)})`;

/**
 * The hand check the docs cite for the grounding rule: the short-card check when there is one (the public numbers
 * compare short cards), else the latest round. Flagged sentences that really add something, passed ones that really
 * are grounded; unjudged samples are skipped.
 */
export function groundingCheck(sv: SupportValidationFile | null): CheckCounts | null {
  const check = sv?.shortCard ?? (sv?.rounds.length ? [...sv.rounds].sort((a, b) => b.round - a.round)[0] : null);
  if (!check) return null;
  const k = checkCounts(check);
  return k.flagged.of && k.passed.of ? k : null;
}

/**
 * One plain table for judges: safety facts and wrong claims after the hand review, how many outputs added a sentence
 * the story does not support (of those scored for it), and length. Unreviewed automatic flags are called out.
 */
export function summaryTable(f: ResultsFile, reviewed: Map<string, Adjudicated>): string {
  return table(
    ['System', 'Model', 'Safety facts kept', 'Wrong safety claims', 'Outputs with a sentence the parent never said', 'Words, mean'],
    f.aggregates.map(({ system, model, agg }) => {
      const r = reviewed.get(system)!;
      const p = agg.provenance;
      return [
        SYSTEM_LABEL[system] ?? system,
        `\`${model}\``,
        frac(r.present, r.total) + (r.unreviewed ? ` (${plural(r.unreviewed, 'flag', 'flags')} not reviewed)` : ''),
        String(r.trapHits),
        p ? ofText(p.storiesWithUnsupported, p.supportScored) : 'n/a',
        p ? String(Math.round(p.wordsMean)) : 'n/a',
      ];
    }),
  );
}

/**
 * Every name a doc block may use. Per system: `<system>-present|limiter|traps|flips|number|sibling|
 * stories-with-trap|p50|p95|cost|cost-per-story` (automatic scoring), `<system>-reviewed-present|reviewed-traps`
 * (after hand review), `<system>-ungrounded|words|read|unsaid-labels|added` (provenance), `<system>-added-before`
 * (the same count before the latest re-score, when there is one). Whole run: `headline`,
 * `provenance` and `summary` tables, `model`, `claude-model`, `stories`, `stories-en`, `stories-es`, `facts-total`,
 * `eval-cost`, `baselines-trap-review`; with support-validation.json: `grounding-precision`, `grounding-passed`.
 */
export function evalValues(f: ResultsFile, adj: Adjudication = { items: {} }, sv: SupportValidationFile | null = null): Record<string, string> {
  const reviewed = adjudicate(f, adj);
  const v: Record<string, string> = {
    headline: headlineTable(f),
    summary: summaryTable(f, reviewed),
    model: f.meta.models.join(', '),
    'claude-model': f.meta.claudeModel,
    stories: String(f.meta.stories),
  };
  for (const { system, model, agg } of f.aggregates) {
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
    if (agg.stories > 0) v[`${system}-cost-per-story`] = usd(agg.costUsd / agg.stories);
    const r = reviewed.get(system)!;
    v[`${system}-reviewed-present`] = frac(r.present, r.total);
    v[`${system}-reviewed-traps`] = String(r.trapHits);
    if (agg.noSafety.safetyItems !== null) v[`${system}-noise`] = `${agg.noSafety.safetyItems} items, ${agg.noSafety.safetyPrompts} prompts on ${agg.noSafety.stories} no-safety stories`;
    const p = agg.provenance;
    if (p) {
      v[`${system}-ungrounded`] = num(p.unsupportedMean, 2);
      v[`${system}-words`] = String(Math.round(p.wordsMean));
      v[`${system}-read`] = sec(p.readSecMean * 1000);
      v[`${system}-unsaid-labels`] = String(p.outputsWithUnsaidLabel);
      v[`${system}-added`] = ofText(p.storiesWithUnsupported, p.supportScored);
    }
    // The same count under the rule before the latest re-score (eval/rescore.ts), so the docs can show what changed.
    const before = f.meta.rescored?.at(-1)?.before[`${system}@${model}`];
    if (before) v[`${system}-added-before`] = ofText(before.storiesWithUnsupported, before.supportScored);
  }
  v.provenance = provenanceTable(f);
  if (f.aggregates[0]) {
    v['facts-total'] = String(f.aggregates[0].agg.total);
    const ids = f.rows.filter((r) => r.system === f.aggregates[0].system).map((r) => r.storyId);
    v['stories-en'] = String(ids.filter((id) => id.startsWith('en-')).length);
    v['stories-es'] = String(ids.filter((id) => id.startsWith('es-')).length);
  }
  // Each model call is paid once: the safety-net row re-scores the Halfdoor card.
  v['eval-cost'] = usd(f.aggregates.filter((a) => !reusesCall(a.system)).reduce((s, a) => s + a.agg.costUsd, 0));
  const baselines = f.aggregates.filter((a) => isBaseline(a.system));
  if (baselines.length) {
    const auto = baselines.reduce((s, a) => s + a.agg.trapHits, 0);
    const confirmed = baselines.reduce((s, a) => s + reviewed.get(a.system)!.trapHits, 0);
    v['baselines-trap-review'] = `${auto} flagged automatically, ${confirmed} confirmed by hand review`;
  }
  const g = groundingCheck(sv);
  if (g) {
    v['grounding-precision'] = pctOf(g.flagged.n, g.flagged.of);
    v['grounding-passed'] = pctOf(g.passed.n, g.passed.of);
  }
  return v;
}

function main() {
  const dir = join(process.cwd(), 'eval', 'results');
  const resultsPath = join(dir, 'final.json');
  if (!existsSync(resultsPath)) {
    console.log('no eval/results/final.json yet; nothing to render');
    return;
  }
  const svPath = join(dir, 'support-validation.json');
  const sv = existsSync(svPath) ? (JSON.parse(readFileSync(svPath, 'utf8')) as SupportValidationFile) : null;
  const values = evalValues(readResults(resultsPath), readAdjudication(join(dir, 'adjudication.json')), sv);
  for (const name of DOCS) {
    const path = join(process.cwd(), name);
    if (!existsSync(path)) continue;
    const before = readFileSync(path, 'utf8');
    const r = replaceEvalBlocks(before, values);
    if (r.text !== before) writeFileSync(path, r.text);
    console.log(`${name}: ${r.replaced.length} block(s) filled${r.unknown.length ? `, unknown: ${r.unknown.join(', ')}` : ''}`);
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/render-readme-numbers.ts')) main();
