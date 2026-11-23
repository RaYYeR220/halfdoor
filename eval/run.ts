// Eval runner.
//   pnpm eval --systems halfdoor,baseline_same --model e2ee-deepseek-v4-flash --limit 2 --out eval/results/pilot.json
//   pnpm eval --systems halfdoor,halfdoor_net --models m1,m2,m3 --out eval/results/sweep.json   (adds a model choice)
// Flags: --ids en-01,es-01  --max-usd 5 (live-spend guard)  --concurrency 4  --no-text (omit output text from rows)
// Every model call is cached in eval/.cache/<system>/<model>/<story>.<prompt hash>.json, so re-runs are free.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { E2EE_MODEL } from '../src/lib/venice/prices';
import { pct, sec, usd, type ResultsFile } from './results';
import { provenance } from './metrics';
import { aggregate, chooseModel, scoreOutput, type Row } from './score';
import { BudgetStop, CLAUDE_MODEL, MAX_TOKENS, SYSTEM_IDS, getBalanceUsd, modelFor, runSystem, type RunCtx, type SystemId } from './systems';
import type { EvalStory } from './types';

const MAX_CONCURRENCY = 4;

export function loadStories(dir = join(process.cwd(), 'eval', 'stories')): EvalStory[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as EvalStory);
}

type Args = { systems: SystemId[]; models: string[]; limit?: number; ids?: string[]; out?: string; maxUsd: number; concurrency: number; text: boolean };

function parseArgs(argv: string[]): Args {
  const get = (k: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const list = (k: string) => get(k)?.split(',').map((s) => s.trim()).filter(Boolean);
  const systems = (list('systems') ?? [...SYSTEM_IDS]) as SystemId[];
  for (const s of systems) if (!SYSTEM_IDS.includes(s)) throw new Error(`unknown system ${s}`);
  const models = list('models') ?? [get('model') ?? E2EE_MODEL];
  for (const m of models) if (!m.startsWith('e2ee-')) throw new Error(`--model must be an e2ee-* model (got ${m})`);
  return {
    systems,
    models,
    limit: get('limit') ? Number(get('limit')) : undefined,
    ids: list('ids'),
    out: get('out'),
    maxUsd: Number(get('max-usd') ?? 5),
    concurrency: Math.min(MAX_CONCURRENCY, Math.max(1, Number(get('concurrency') ?? MAX_CONCURRENCY))),
    text: !argv.includes('--no-text'),
  };
}

async function pool<T>(n: number, jobs: (() => Promise<T>)[]): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  let stop: unknown = null;
  const worker = async () => {
    while (next < jobs.length && !stop) {
      const i = next++;
      try {
        out[i] = await jobs[i]();
      } catch (e) {
        stop = e;
      }
    }
  };
  await Promise.all(Array.from({ length: n }, worker));
  if (stop) throw stop;
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) throw new Error('VENICE_API_KEY missing (run with --env-file=.env.local)');

  let stories = loadStories();
  if (args.ids) stories = stories.filter((s) => args.ids!.includes(s.id));
  if (args.limit) stories = stories.slice(0, args.limit);

  const before = await getBalanceUsd(apiKey);
  console.log(`balance before: ${before === null ? 'unknown' : usd(before)}`);
  console.log(`${stories.length} stories x ${args.systems.join(',')} x ${args.models.join(',')}; live-spend guard ${usd(args.maxUsd)}`);

  const ctx: RunCtx = { apiKey, budget: { spent: 0, max: args.maxUsd } };
  // halfdoor_net replays halfdoor's cached draft, so it is queued last instead of holding a slot.
  const jobs: (() => Promise<Row>)[] = [];
  const netJobs: (() => Promise<Row>)[] = [];
  let done = 0;
  const total = args.models.length * stories.length * args.systems.length;
  // Story-major so the requests in flight spread over models (attestation is rate-limited per model).
  for (const story of stories) {
    for (const model of args.models) {
      for (const system of args.systems) {
        (system === 'halfdoor_net' ? netJobs : jobs).push(async () => {
          const r = await runSystem(system, story, model, ctx);
          const row: Row = {
            system,
            model: modelFor(system, model),
            storyId: story.id,
            noSafety: story.facts.length === 0,
            score: scoreOutput(story, r.text),
            latencyMs: r.latencyMs,
            costUsd: r.costUsd,
            cached: r.cached,
            ...(r.safetyItems !== undefined ? { safetyItems: r.safetyItems, safetyPrompts: r.safetyPrompts } : {}),
            ...(r.error ? { error: r.error } : {}),
            ...(args.text ? { text: r.text } : {}),
            prov: provenance(r.text, story.text),
          };
          done++;
          if (!r.cached || r.error) {
            const s = row.score;
            console.log(
              `[${done}/${total}] ${system}@${row.model} ${story.id} facts ${s.present}/${s.total} traps ${s.trapHits.join(',') || '-'} ${sec(r.latencyMs)} ${usd(r.costUsd)}${r.cached ? ' (cached)' : ''}${r.error ? ` ERROR ${r.error}` : ''}`,
            );
          }
          return row;
        });
      }
    }
  }

  let rows: Row[];
  try {
    rows = await pool(args.concurrency, [...jobs, ...netJobs]);
  } catch (e) {
    if (e instanceof BudgetStop) {
      console.error(`STOPPED: live spend reached the ${usd(args.maxUsd)} guard (${usd(ctx.budget!.spent)} spent). Cached calls are kept; re-run to resume.`);
      process.exit(2);
    }
    throw e;
  }

  const aggregates: ResultsFile['aggregates'] = [];
  for (const model of args.models) {
    for (const system of args.systems) {
      const m = modelFor(system, model);
      if (aggregates.some((a) => a.system === system && a.model === m)) continue;
      aggregates.push({ system, model: m, agg: aggregate(rows.filter((r) => r.system === system && r.model === m)) });
    }
  }

  console.log('\nsystem@model | facts | limiter | traps (flip/num/sib) | stories w/ trap | p50 | p95 | cost | per story | x60 | errors');
  for (const { system, model, agg: a } of aggregates) {
    const per = a.costUsd / Math.max(1, a.stories);
    console.log(
      `${system}@${model} | ${a.present}/${a.total} ${pct(a.present, a.total)} | ${a.limiterPresent}/${a.limiterTotal} | ${a.trapHits} (${a.trapClasses.flips}/${a.trapClasses.number}/${a.trapClasses.sibling}) | ${a.storiesWithTrap} | ${sec(a.p50Ms)} | ${sec(a.p95Ms)} | ${usd(a.costUsd)} | ${usd(per)} | ${usd(per * 60)} | ${a.errors}`,
    );
  }

  let choice: ResultsFile['choice'];
  if (args.models.length > 1 && args.systems.includes('halfdoor')) {
    choice = chooseModel(
      aggregates
        .filter((a) => a.system === 'halfdoor')
        .map(({ model, agg }) => ({ model, flips: agg.trapClasses.flips, trapHits: agg.trapHits, presentRate: agg.total ? agg.present / agg.total : 0, p50Ms: agg.p50Ms })),
    );
    console.log(`\nchoice: ${choice.model}${choice.clean ? '' : ' (NO model reached 0 flips / 0 trap hits; least-bad pick)'}${choice.fast ? '' : ' (p50 over 8 s)'}`);
  }

  const after = await getBalanceUsd(apiKey);
  console.log(`\nlive spend this run (from usage): ${usd(ctx.budget!.spent)}`);
  console.log(`balance after: ${after === null ? 'unknown' : usd(after)}${before !== null && after !== null ? ` (delta ${usd(before - after)})` : ''}`);

  if (args.out) {
    const file: ResultsFile = {
      meta: {
        createdAt: new Date().toISOString(),
        stories: stories.length,
        systems: args.systems,
        models: args.models,
        claudeModel: CLAUDE_MODEL,
        maxTokens: MAX_TOKENS,
        concurrency: args.concurrency,
        balanceBeforeUsd: before,
        balanceAfterUsd: after,
        liveSpendUsd: ctx.budget!.spent,
      },
      aggregates,
      ...(choice ? { choice } : {}),
      rows,
    };
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, `${JSON.stringify(file, null, 1)}\n`);
    console.log(`wrote ${args.out}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : 'failed');
  process.exit(1);
});
