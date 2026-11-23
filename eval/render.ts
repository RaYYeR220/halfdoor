// Render eval/results/final.json (+ sweep.json, + adjudication.json hand review) into eval/results/summary.md.
//   pnpm eval:render
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SYSTEM_LABEL, adjudicate, frac, headlineTable, pct, readAdjudication, readResults, sec, table, usd, type Adjudication, type ResultsFile } from './results';
import type { Row } from './score';
import type { EvalStory } from './types';

const DIR = join(process.cwd(), 'eval', 'results');
const label = (s: string) => SYSTEM_LABEL[s] ?? s;

function loadStories(): Map<string, EvalStory> {
  const dir = join(process.cwd(), 'eval', 'stories');
  return new Map(
    readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as EvalStory)
      .map((s) => [s.id, s]),
  );
}

function misses(rows: Row[], stories: Map<string, EvalStory>, adj: Adjudication): string[] {
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

function render(final: ResultsFile, sweep: ResultsFile | null, adj: Adjudication): string {
  const stories = loadStories();
  const notes = adj.notes ?? {};
  const adjusted = adjudicate(final, adj);
  const A = final.aggregates;
  const md: string[] = [];
  md.push('# Halfdoor eval results', '');
  md.push(
    `Generated ${final.meta.createdAt.slice(0, 10)} from \`final.json\`: ${final.meta.stories} synthetic parent stories (35 EN, 25 ES), ` +
      `enclave model \`${final.meta.models.join(', ')}\`, comparison model \`${final.meta.claudeModel}\`, max ${final.meta.maxTokens} output tokens, ` +
      `${final.meta.concurrency} requests in flight. Scoring rules: [stories/README.md](../stories/README.md). The answer key is never shown to any system.`,
    '',
  );
  md.push(
    '- **Halfdoor card**: the product pipeline (name redacted, E2EE enclave model drafts a card with quotes, deterministic verifier keeps safety items as the parent\'s own sentences).',
    '- **+ safety net accepted**: the same card after accepting every safety-net prompt (sentences with safety words the model left off the card).',
    '- **Plain summary**: "Write a one-page summary of this child for the volunteer who will look after them on Sunday." with the story; same enclave model, and Claude via Venice\'s standard (non-E2EE) API, which is allowed only because the stories are synthetic.',
    '',
  );

  md.push('## Headline (automatic scoring)', '', headlineTable(final), '');
  if (notes.final) md.push(notes.final, '');

  md.push('## Headline after hand review', '');
  md.push(
    'Every automatic miss and trap hit was read in context (`adjudication.json`). A miss the output does state, or a trap hit on a correct statement, is a scorer artifact and is reversed here.',
    '',
  );
  md.push(
    table(
      ['System', 'Safety facts kept', 'Trap hits', 'Scorer misses reversed', 'Scorer trap hits reversed', 'Not reviewed'],
      A.map(({ system }) => {
        const a = adjusted.get(system)!;
        return [label(system), frac(a.present, a.total), a.trapHits, a.scorerMisses, a.scorerTraps, a.unreviewed];
      }),
    ),
    '',
  );

  md.push('## Trap hits by class', '');
  md.push('Polarity flips = outgrown allergy or stopped medicine stated as current, a barred person listed as allowed pickup, a lost "only" or "doesn\'t need", a double negative read backwards.', '');
  md.push(
    table(
      ['System', 'Polarity flips', 'Wrong numbers', "Sibling's condition", 'Total', 'Stories with a hit'],
      A.map(({ system, agg }) => [label(system), agg.trapClasses.flips, agg.trapClasses.number, agg.trapClasses.sibling, agg.trapHits, `${agg.storiesWithTrap}/${agg.stories}`]),
    ),
    '',
  );

  md.push('## Limiter facts', '');
  md.push('Facts that only hold with their negation or limiter ("NOT allowed", "only", "no longer", "doesn\'t need"), scored inside one sentence.', '');
  md.push(table(['System', 'Kept', 'Missed'], A.map(({ system, agg }) => [label(system), frac(agg.limiterPresent, agg.limiterTotal), agg.limiterTotal - agg.limiterPresent])), '');

  md.push('## False-positive burden (8 no-safety stories)', '');
  md.push('Stories with no safety facts at all. Anything Halfdoor puts in the safety section, or raises as a safety-net prompt, is noise a volunteer has to read.', '');
  md.push(
    table(
      ['System', 'Safety items on cards', 'Safety-net prompts raised', 'Stories with any'],
      A.map(({ system, agg }) =>
        agg.noSafety.safetyItems === null
          ? [label(system), 'n/a', 'n/a', 'n/a']
          : [label(system), agg.noSafety.safetyItems, agg.noSafety.safetyPrompts ?? 0, `${agg.noSafety.storiesWithAny}/${agg.noSafety.stories}`],
      ),
    ),
    '',
  );

  if (notes.burden) md.push(notes.burden, '');

  md.push('## Latency', '');
  md.push(
    "Wall time per story, including the enclave attestation round trip for E2EE calls and the JSON retry when a draft does not parse. " +
      "Time the harness spent waiting on Venice's per-model attestation rate limit (spacing and 429 backoff) is excluded. Halfdoor's two rows share one model call.",
    '',
  );
  md.push(table(['System', 'p50', 'p95'], A.map(({ system, agg }) => [label(system), sec(agg.p50Ms), sec(agg.p95Ms)])), '');

  md.push('## Cost', '');
  md.push('From the usage each response reports, at Venice list prices (`src/lib/venice/prices.ts`).', '');
  md.push(
    table(
      ['System', `Total (${final.meta.stories} stories)`, 'Per story'],
      A.map(({ system, agg }) => [label(system), usd(agg.costUsd), usd(agg.costUsd / Math.max(1, agg.stories))]),
    ),
    '',
  );

  if (sweep) {
    md.push('## Model sweep (Halfdoor card, all stories)', '');
    md.push(
      'Rule: 0 polarity flips and 0 trap hits first, then the highest share of facts kept, then p50 under 8 s. ' +
        'The latency clause is applied as a requirement (a tie-break on present rate would almost never fire), so a slower model with more facts kept can lose.' +
        (sweep.choice
          ? ` Chosen: \`${sweep.choice.model}\`${sweep.choice.clean ? '' : ' (no model reached 0 flips / 0 trap hits; this is the least-bad one)'}${sweep.choice.fast ? '' : ' (no clean model has p50 under 8 s)'}.`
          : ''),
      '',
    );
    const net = new Map(sweep.aggregates.filter((a) => a.system === 'halfdoor_net').map((a) => [a.model, a.agg]));
    md.push(
      table(
        ['Model', 'Facts kept', '+ net', 'Limiter kept', 'Flips', 'Numbers', 'Sibling', 'Stories with a trap hit', 'p50', 'p95', 'Cost', 'No card'],
        sweep.aggregates
          .filter((a) => a.system === 'halfdoor')
          .map(({ model, agg }) => [
            sweep.choice?.model === model ? `**\`${model}\`**` : `\`${model}\``,
            frac(agg.present, agg.total),
            net.has(model) ? pct(net.get(model)!.present, net.get(model)!.total) : 'n/a',
            frac(agg.limiterPresent, agg.limiterTotal),
            agg.trapClasses.flips,
            agg.trapClasses.number,
            agg.trapClasses.sibling,
            `${agg.storiesWithTrap}/${agg.stories}`,
            sec(agg.p50Ms),
            sec(agg.p95Ms),
            usd(agg.costUsd),
            agg.errors,
          ]),
      ),
      '',
    );
  }

  if (notes.sweep) md.push(notes.sweep, '');

  md.push('## What went wrong', '');
  md.push('Every Halfdoor miss and trap hit in the final run, with its review.', '');
  for (const system of ['halfdoor', 'halfdoor_net']) {
    const rows = final.rows.filter((r) => r.system === system);
    if (rows.length === 0) continue;
    const list = misses(rows, stories, adj);
    md.push(`### ${label(system)}`, '', ...(list.length ? list : ['- none']), '');
  }
  const baseRows = final.rows.filter((r) => r.system.startsWith('baseline'));
  if (baseRows.length) {
    md.push('### Baselines (for comparison)', '');
    for (const system of [...new Set(baseRows.map((r) => r.system))]) {
      const list = misses(baseRows.filter((r) => r.system === system), stories, adj);
      md.push(`<details><summary>${label(system)}: ${list.length} misses and trap hits</summary>`, '', ...(list.length ? list : ['- none']), '', '</details>', '');
    }
  }
  return md.join('\n');
}

function main() {
  const finalPath = join(DIR, 'final.json');
  if (!existsSync(finalPath)) throw new Error('eval/results/final.json missing; run pnpm eval first');
  const sweepPath = join(DIR, 'sweep.json');
  const out = render(readResults(finalPath), existsSync(sweepPath) ? readResults(sweepPath) : null, readAdjudication(join(DIR, 'adjudication.json')));
  writeFileSync(join(DIR, 'summary.md'), out);
  console.log('wrote eval/results/summary.md');
}

main();
