// Render eval/results/final.json (+ sweep.json, scorer-agreement.json, support-validation.json, adjudication.json)
// into eval/results/summary.md.
//   pnpm eval:render
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_IGNORED_WORDS, SUPPORT_THRESHOLD } from './metrics';
import type { AgreementFile } from './agreement';
import {
  SYSTEM_LABEL,
  frac,
  headlineTable,
  num,
  pct,
  plural,
  provenanceTable,
  readAdjudication,
  readResults,
  sec,
  table,
  usd,
  type Adjudication,
  type ResultsFile,
} from './results';
import type { Aggregate, Row } from './score';
import { rng, sample, type SupportValidationFile } from './support-sample';
import type { EvalStory } from './types';

const DIR = join(process.cwd(), 'eval', 'results');
const label = (s: string) => SYSTEM_LABEL[s] ?? s;
const readJson = <T>(name: string): T | null => (existsSync(join(DIR, name)) ? (JSON.parse(readFileSync(join(DIR, name), 'utf8')) as T) : null);

function loadStories(): Map<string, EvalStory> {
  const dir = join(process.cwd(), 'eval', 'stories');
  return new Map(
    readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as EvalStory)
      .map((s) => [s.id, s]),
  );
}

function flagLines(rows: Row[], stories: Map<string, EvalStory>, adj: Adjudication): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const s = stories.get(r.storyId)!;
    const review = (id: string) => {
      const a = adj.items[`${r.system}/${r.storyId}/${id}`];
      return a ? ` — **${a.verdict === 'real' ? 'real' : 'scorer artifact'}**: ${a.note}` : ' — not reviewed';
    };
    if (r.error) out.push(`- **${r.storyId}** · no card (\`${r.error}\`)`);
    for (const id of r.score.missing) {
      const f = s.facts.find((x) => x.id === id)!;
      out.push(`- **${r.storyId}** · missed \`${id}\` (${f.kind}${f.limiter ? ', limiter' : ''})${review(id)}`);
    }
    for (const id of r.score.trapHits) {
      const t = s.traps.find((x) => x.id === id)!;
      out.push(`- **${r.storyId}** · trap \`${id}\` (${t.why})${review(id)}`);
    }
  }
  return out;
}

const missCount = (rows: Row[]) => {
  const facts = rows.reduce((a, r) => a + r.score.missing.length, 0);
  const stories = rows.filter((r) => r.score.missing.length > 0).length;
  return facts === 0 ? 'no missed fact' : `${plural(facts, 'missed fact', 'missed facts')} in ${plural(stories, 'story', 'stories')}`;
};

function render(final: ResultsFile, sweep: ResultsFile | null, adj: Adjudication, agree: AgreementFile | null, sv: SupportValidationFile | null): string {
  const stories = loadStories();
  const A = final.aggregates;
  const agg = (system: string): Aggregate | undefined => A.find((a) => a.system === system)?.agg;
  const rowsOf = (system: string) => final.rows.filter((r) => r.system === system);
  const notes = adj.notes ?? {};
  const md: string[] = [];

  md.push('# Halfdoor eval results', '');
  md.push(
    `Generated ${final.meta.createdAt.slice(0, 10)} from \`final.json\`: ${final.meta.stories} synthetic parent stories (35 EN, 25 ES) with a hidden answer key, ` +
      `enclave model \`${final.meta.models.join(', ')}\`, comparison model \`${final.meta.claudeModel}\`, max ${final.meta.maxTokens} output tokens. ` +
      'Every system sees only the story text. Key and rules: [stories/README.md](../stories/README.md).',
    '',
    "- **Halfdoor card**: the product pipeline. The child's name is redacted, an E2EE enclave model drafts a card with quotes, and a deterministic verifier keeps every safety item as the parent's own sentence.",
    '- **+ safety net accepted**: the same card after accepting every safety-net prompt (story sentences with safety words that the model left off the card).',
    '- **Plain summary**: "Write a one-page summary of this child for the volunteer who will look after them on Sunday." plus the story, sent to the same enclave model, and to Claude through Venice\'s standard (non-E2EE) API, which is allowed only because the stories are synthetic.',
    '',
  );

  // ---- bottom line
  const hd = agg('halfdoor');
  const net = agg('halfdoor_net');
  const bs = agg('baseline_same');
  const bc = agg('baseline_claude');
  if (hd && bs && bc) {
    const residual = agree?.after.disagree.length ?? 0;
    md.push('## Bottom line', '');
    md.push(
      `- **Safety facts: a plain summary is as good as Halfdoor.** Halfdoor card ${frac(hd.present, hd.total)}${net ? `, with the safety net accepted ${frac(net.present, net.total)}` : ''}; plain summaries ${frac(bs.present, bs.total)} (same model) and ${frac(bc.present, bc.total)} (Claude).`,
      `- **Wrong claims:** Halfdoor ${hd.trapHits} trap hits; plain summaries ${bs.trapHits} and ${bc.trapHits}.` +
        (residual ? ` The baseline trap hits are the ${plural(residual, 'known scorer artifact', 'known scorer artifacts')} listed in appendix A (the summaries say the right thing); no system made a wrong safety claim that survived review.` : ''),
    );
    if (hd.provenance && bs.provenance && bc.provenance) {
      md.push(
        `- **What the output adds (the product's actual claim):** Halfdoor cards carry ${num(hd.provenance.unsupportedMean, 2)} sentences per card that are not grounded in the story; plain summaries carry ${num(bs.provenance.unsupportedMean, 1)} and ${num(bc.provenance.unsupportedMean, 1)} per summary (advice, boilerplate and elaboration the parent never wrote). ` +
          `A card is ${Math.round(hd.provenance.wordsMean)} words (${sec(hd.provenance.readSecMean * 1000)} to read) against ${Math.round(bs.provenance.wordsMean)} and ${Math.round(bc.provenance.wordsMean)} words (${sec(bs.provenance.readSecMean * 1000)} and ${sec(bc.provenance.readSecMean * 1000)}).`,
      );
    }
    md.push('');
  }

  // ---- 1. safety facts
  md.push('## Safety facts and wrong claims (automatic scoring)', '', headlineTable(final), '');
  md.push(
    'Outputs are read through a markdown-aware normalizer before the key is applied (`eval/normalize.ts`): headings, table rows, list items and "Only these people:" leads become units the sentence-scoped patterns can read; a trap counts only if it fires both with and without that structure. ' +
      (agree
        ? `Against a hand review of every flag in the first run, the scorer agrees on ${agree.after.agree}/${agree.reviewed} items (the README rules read raw agreed on ${agree.before.agree}/${agree.reviewed}); details in appendix A.`
        : ''),
    '',
  );

  // ---- 2. provenance
  md.push('## Provenance: what each output adds', '', provenanceTable(final), '');
  const r2 = sv?.rounds.at(-1);
  const prec = (r: NonNullable<typeof r2>) => {
    const u = r.samples.filter((s) => s.flagged === 'unsupported');
    const s = r.samples.filter((x) => x.flagged === 'supported');
    return { p: u.filter((x) => x.grounded === false).length, pn: u.length, c: s.filter((x) => x.grounded === true).length, cn: s.length };
  };
  md.push(
    `- **Not grounded**: a sentence counts as grounded when at least ${Math.round(SUPPORT_THRESHOLD * 100)}% of its content words (4+ letters, not stopwords, compared by 5-letter prefix) also occur in the story. Lines of ${MAX_IGNORED_WORDS} words or fewer are ignored, and outputs in another language than the story are not scored, because word overlap cannot see a translation (the same-model summary answered most Spanish stories in English).` +
      (r2
        ? ` Hand check on a fresh random sample (appendix B): ${prec(r2).p}/${prec(r2).pn} flagged sentences really add something the parent did not write, and ${prec(r2).c}/${prec(r2).cn} passed sentences really are grounded, so the counts are approximate and lean low.`
        : ''),
    '- **Unsaid labels**: diagnosis words (autism, ADHD, Down syndrome…) the story does not contain. "Exact word" is the check the product verifier applies; "label family" also accepts another form of the same diagnosis (autistic for autism, autismo for autism, the parent\'s lowercase "adhd", "CP").',
    '',
  );
  const hdUnsupported = rowsOf('halfdoor').flatMap((r) => (r.prov?.unsupported ?? []).map((s) => `- ${r.storyId}: "${s}"`));
  if (hdUnsupported.length) md.push('Every Halfdoor sentence flagged as not grounded:', '', ...hdUnsupported, '');
  for (const system of ['baseline_same', 'baseline_claude']) {
    const pool = rowsOf(system).flatMap((r) => (r.prov?.unsupported ?? []).map((s) => ({ id: r.storyId, s })));
    const picked: { id: string; s: string }[] = [];
    for (const x of sample(pool, pool.length, rng(7))) {
      if (picked.length < 3 && !picked.some((p) => p.id === x.id) && x.s.split(/\s+/).length >= 6) picked.push(x);
    }
    if (picked.length) md.push(`Three random flagged sentences from "${label(system)}":`, '', ...picked.map((x) => `- ${x.id}: "${x.s}"`), '');
  }

  // ---- 3. what went wrong
  md.push('## What went wrong', '');
  if (hd && bs && bc) {
    md.push(
      `- **On safety-fact recall a plain summary is as good as Halfdoor.** Both plain summaries keep ${bs.present === bs.total && bc.present === bc.total ? 'every' : 'nearly every'} safety fact with the right polarity on these stories; the Halfdoor card has ${missCount(rowsOf('halfdoor'))}${net ? ` (${missCount(rowsOf('halfdoor_net'))} once the safety net is accepted)` : ''}. Halfdoor's case rests on provenance, length and privacy, not on recall.`,
    );
  }
  for (const system of ['halfdoor', 'halfdoor_net']) {
    const lines = flagLines(rowsOf(system), stories, adj);
    if (lines.length) md.push(`- ${label(system)}:`, ...lines.map((l) => `  ${l}`));
  }
  if (hd?.noSafety.safetyItems !== null && hd) {
    md.push(
      `- **Noise on the ${hd.noSafety.stories} stories with no safety facts:** the card put ${plural(hd.noSafety.safetyItems ?? 0, 'item', 'items')} in its safety section and the safety net raised ${plural(hd.noSafety.safetyPrompts ?? 0, 'prompt', 'prompts')}, on ${hd.noSafety.storiesWithAny} of ${hd.noSafety.stories} stories.${notes.burden ? ` ${notes.burden}` : ''}`,
    );
  }
  if (notes.pipeline) md.push(`- **Pipeline faults this eval found (fixed):** ${notes.pipeline}`);
  md.push(
    '- **Latency** for Halfdoor covers the model calls only (attestation, the enclave call, and the JSON retry when a draft does not parse), not local verification or rendering, which take milliseconds. It excludes time the harness spent waiting on Venice\'s per-model attestation rate limit.',
    '- **One sample per story and system.** Model output varies between runs; a single re-run can move a story in or out of the miss list.',
    '',
  );

  // ---- details
  md.push('## Details', '');
  md.push('### Limiter facts and false-positive burden', '');
  md.push(
    table(
      ['System', 'Limiter facts kept', 'Safety items on no-safety stories', 'Safety-net prompts on no-safety stories'],
      A.map(({ system, agg: a }) => [
        label(system),
        frac(a.limiterPresent, a.limiterTotal),
        a.noSafety.safetyItems === null ? 'n/a' : a.noSafety.safetyItems,
        a.noSafety.safetyPrompts === null ? 'n/a' : a.noSafety.safetyPrompts,
      ]),
    ),
    '',
  );
  md.push('### Latency and cost', '');
  md.push(
    table(
      ['System', 'p50', 'p95', `Cost, ${final.meta.stories} stories`, 'Cost per story'],
      A.map(({ system, agg: a }) => [label(system), sec(a.p50Ms), sec(a.p95Ms), usd(a.costUsd), usd(a.costUsd / Math.max(1, a.stories))]),
    ),
    '',
    'Cost from the usage each response reports, at Venice list prices (`src/lib/venice/prices.ts`). The two Halfdoor rows share one model call per story.',
    '',
  );

  if (sweep) {
    md.push('### Model sweep (Halfdoor card, all stories)', '');
    md.push(
      'Rule: 0 polarity flips and 0 trap hits first, then the highest share of facts kept, then p50 under 8 s; the latency clause is applied as a requirement (as a tie-break on present rate it would almost never fire).' +
        (sweep.choice
          ? ` Chosen: \`${sweep.choice.model}\`${sweep.choice.clean ? '' : ' (no model reached 0 flips / 0 trap hits; least-bad pick)'}${sweep.choice.fast ? '' : ' (no clean model has p50 under 8 s)'}.`
          : ''),
      '',
    );
    const netBy = new Map(sweep.aggregates.filter((a) => a.system === 'halfdoor_net').map((a) => [a.model, a.agg]));
    md.push(
      table(
        ['Model', 'Facts kept', '+ net', 'Limiter kept', 'Trap hits (flips / numbers / sibling)', 'p50', 'p95', 'Cost', 'No card'],
        sweep.aggregates
          .filter((a) => a.system === 'halfdoor')
          .map(({ model, agg: a }) => [
            sweep.choice?.model === model ? `**\`${model}\`**` : `\`${model}\``,
            frac(a.present, a.total),
            netBy.has(model) ? pct(netBy.get(model)!.present, netBy.get(model)!.total) : 'n/a',
            frac(a.limiterPresent, a.limiterTotal),
            `${a.trapHits} (${a.trapClasses.flips} / ${a.trapClasses.number} / ${a.trapClasses.sibling})`,
            sec(a.p50Ms),
            sec(a.p95Ms),
            usd(a.costUsd),
            a.errors,
          ]),
      ),
      '',
    );
    if (notes.sweep) md.push(notes.sweep, '');
  }

  // ---- appendix A
  if (agree) {
    md.push('## Appendix A: scorer validation', '');
    md.push(
      `Every miss and trap hit the automatic scorer raised in the first run (\`${agree.source}\`, before the round-1 fixes) was read in context and marked real or scorer artifact (\`adjudication.json\`). ` +
        `Agreement with that review: **${agree.before.agree}/${agree.reviewed}** with the README rules read raw, **${agree.after.agree}/${agree.reviewed}** with the markdown-aware scorer, which raised no new flag on those outputs.`,
      '',
    );
    if (agree.after.disagree.length) {
      md.push('Remaining disagreements (both make a plain summary look worse than it is):', '');
      for (const k of agree.after.disagree) md.push(`- \`${k}\`: ${adj.items[k]?.note ?? ''}`);
      md.push('');
      if (notes.residual) md.push(notes.residual, '');
    }
    md.push('<details><summary>All reviewed items</summary>', '');
    for (const [k, v] of Object.entries(adj.items)) md.push(`- \`${k}\` — **${v.verdict}**: ${v.note}`);
    md.push('', '</details>', '');
  }

  // ---- appendix B
  if (sv?.rounds.length) {
    md.push('## Appendix B: grounding-rule validation', '');
    md.push('20 random sentences the rule flags as not grounded and 20 it passes, from the plain summaries, judged by hand against the story (grounded = the story states, or translates to, everything the sentence claims; boilerplate, headers and added advice are not grounded).', '');
    md.push(
      table(
        ['Round', 'Rule', 'Seed', 'Flagged that really add something', 'Passed that really are grounded'],
        sv.rounds.map((r) => {
          const x = prec(r);
          return [r.round, r.rule, r.seed, `${x.p}/${x.pn} (${pct(x.p, x.pn)})`, `${x.c}/${x.cn} (${pct(x.c, x.cn)})`];
        }),
      ),
      '',
      'Round 1 missed the 80% target: its false flags were translations, close paraphrases and short label lines. The rule was revised once (language check, one-third threshold, short lines ignored) and checked again on a fresh sample (round 2).',
      '',
    );
    for (const r of sv.rounds) {
      md.push(`<details><summary>Round ${r.round} judgments</summary>`, '');
      for (const s of r.samples) md.push(`- ${s.flagged}, ${s.grounded ? 'grounded' : 'not grounded'} · ${s.storyId} · "${s.sentence}" — ${s.note}`);
      md.push('', '</details>', '');
    }
  }
  return md.join('\n');
}

function main() {
  const finalPath = join(DIR, 'final.json');
  if (!existsSync(finalPath)) throw new Error('eval/results/final.json missing; run pnpm eval first');
  const sweepPath = join(DIR, 'sweep.json');
  const out = render(
    readResults(finalPath),
    existsSync(sweepPath) ? readResults(sweepPath) : null,
    readAdjudication(join(DIR, 'adjudication.json')),
    readJson<AgreementFile>('scorer-agreement.json'),
    readJson<SupportValidationFile>('support-validation.json'),
  );
  writeFileSync(join(DIR, 'summary.md'), out);
  console.log('wrote eval/results/summary.md');
}

main();
