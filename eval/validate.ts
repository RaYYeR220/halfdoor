// Validates the Halfdoor eval story set.
//   pnpm eval:validate            -> "60 stories OK" or the list of failures
//   pnpm eval:validate --stats    -> same, plus counts by trap type / kind
// Regexes are compiled with the `iu` flags (they must also compile with `i`).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { KeyFact, Trap } from './types';

const DIR = join(process.cwd(), 'eval', 'stories');
const TAGS = new Set(['noise_sensitive', 'crowds_hard', 'transitions_hard', 'needs_breaks', 'needs_visual_schedule', 'nonverbal_or_aac', 'touch_sensitive', 'sensory_seeking', 'mobility_aid', 'bathroom_help', 'food_allergy', 'medical_plan', 'pickup_restriction', 'elopement_risk', 'spanish_home']);
const KINDS = new Set(['allergy', 'medical', 'medication', 'pickup', 'wandering', 'other_safety']);
// Trap ids are "<type>.<slug>"; the type is one of the brief's trap types.
const TRAP_TYPES = ['outgrown', 'negated_pickup', 'only_may', 'number', 'doesnt_need', 'double_negation', 'sibling', 'cancelled_med'];
const FLAGS = 'iu';

type Loose = { id?: unknown; lang?: unknown; text?: unknown; facts?: unknown; traps?: unknown; tags?: unknown };

const errors: string[] = [];
const err = (id: string, msg: string) => errors.push(`${id}: ${msg}`);
const compile = (id: string, src: string, where: string): RegExp | null => {
  try {
    new RegExp(src, 'i');
    return new RegExp(src, FLAGS);
  } catch (e) {
    err(id, `${where}: bad regex ${JSON.stringify(src)} (${(e as Error).message})`);
    return null;
  }
};

const expected = [
  ...Array.from({ length: 35 }, (_, i) => `en-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 25 }, (_, i) => `es-${String(i + 1).padStart(2, '0')}`),
];
const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const found = new Set(files.map((f) => f.replace(/\.json$/, '')));
for (const id of expected) if (!found.has(id)) err(id, 'missing file');
for (const id of found) if (!expected.includes(id)) err(id, 'unexpected file');

const stats = {
  stories: 0,
  en: 0,
  es: 0,
  noSafety: 0,
  withTraps: 0,
  facts: 0,
  limiter: 0,
  traps: 0,
  byTrap: Object.fromEntries(TRAP_TYPES.map((t) => [t, 0])) as Record<string, number>,
  byKind: {} as Record<string, number>,
};

for (const f of files) {
  const id = f.replace(/\.json$/, '');
  let s: Loose;
  try {
    s = JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Loose;
  } catch (e) {
    err(id, `invalid JSON (${(e as Error).message})`);
    continue;
  }
  stats.stories++;
  const keys = Object.keys(s).sort().join(',');
  if (keys !== 'facts,id,lang,tags,text,traps') err(id, `keys must be exactly id,lang,text,facts,traps,tags (got ${keys})`);
  if (s.id !== id) err(id, `id "${String(s.id)}" does not match filename`);
  if (s.lang !== id.slice(0, 2)) err(id, `lang "${String(s.lang)}" does not match prefix`);
  else stats[s.lang as 'en' | 'es']++;
  if (typeof s.text !== 'string' || s.text.length < 60 || s.text.length > 900) err(id, `text length ${typeof s.text === 'string' ? s.text.length : 'n/a'} outside 60..900`);
  if (!Array.isArray(s.tags) || s.tags.some((t) => !TAGS.has(t))) err(id, `bad tags ${JSON.stringify(s.tags)}`);
  else if (new Set(s.tags).size !== s.tags.length) err(id, 'duplicate tags');
  if (!Array.isArray(s.facts) || !Array.isArray(s.traps)) {
    err(id, 'facts/traps must be arrays');
    continue;
  }
  const facts = s.facts as KeyFact[];
  const traps = s.traps as Trap[];
  const text = typeof s.text === 'string' ? s.text : '';
  const ids = new Set<string>();

  if (facts.length === 0) {
    stats.noSafety++;
    if (traps.length) err(id, 'no-safety story must have no traps');
  } else if (facts.length < 2 || facts.length > 5) err(id, `${facts.length} facts (need 2..5, or 0 for a no-safety story)`);

  for (const k of facts) {
    const kid = `${id}/${k.id}`;
    const fk = Object.keys(k).sort().join(',');
    if (fk !== 'id,kind,limiter,must') err(kid, `fact keys must be id,kind,must,limiter (got ${fk})`);
    if (typeof k.id !== 'string' || !k.id) err(kid, 'fact id missing');
    if (ids.has(k.id)) err(kid, 'duplicate id');
    ids.add(k.id);
    if (!KINDS.has(k.kind)) err(kid, `bad kind ${k.kind}`);
    if (typeof k.limiter !== 'boolean') err(kid, 'limiter must be boolean');
    if (!Array.isArray(k.must) || k.must.length === 0) {
      err(kid, 'must must be a non-empty array of OR-groups');
      continue;
    }
    stats.facts++;
    if (k.limiter) stats.limiter++;
    stats.byKind[k.kind] = (stats.byKind[k.kind] ?? 0) + 1;
    k.must.forEach((group, gi) => {
      if (!Array.isArray(group) || group.length === 0 || group.some((x) => typeof x !== 'string' || !x)) {
        err(kid, `must[${gi}] must be a non-empty array of non-empty strings`);
        return;
      }
      const res = group.map((src, ai) => compile(kid, src, `must[${gi}][${ai}]`)).filter((r): r is RegExp => r !== null);
      if (res.length === group.length && !res.some((r) => r.test(text))) err(kid, `must[${gi}] matches nothing in the story text: ${JSON.stringify(group)}`);
    });
  }

  if (traps.length) stats.withTraps++;
  for (const t of traps) {
    const tid = `${id}/${t.id}`;
    const tk = Object.keys(t).sort().join(',');
    if (tk !== 'id,pattern,why') err(tid, `trap keys must be id,pattern,why (got ${tk})`);
    if (ids.has(t.id)) err(tid, 'duplicate id');
    ids.add(t.id);
    const type = String(t.id).split('.')[0];
    if (!TRAP_TYPES.includes(type)) err(tid, `trap id must start with one of ${TRAP_TYPES.join('|')} + "."`);
    else stats.byTrap[type]++;
    if (typeof t.why !== 'string' || t.why.length < 10) err(tid, 'why missing/too short');
    stats.traps++;
    const re = compile(tid, t.pattern, 'pattern');
    const hit = re ? text.match(re) : null;
    if (hit) err(tid, `trap fires on the story's own text (at "${hit[0].slice(0, 80)}")`);
  }
}

if (stats.noSafety !== 8) errors.push(`set: ${stats.noSafety} no-safety stories (need 8)`);
if (stats.withTraps < 40) errors.push(`set: only ${stats.withTraps} stories have a trap (need >= 40)`);
for (const t of TRAP_TYPES) if (!stats.byTrap[t]) errors.push(`set: no trap of type ${t}`);

if (errors.length) {
  console.log(`${errors.length} failure(s):`);
  for (const e of errors) console.log(`  ${e}`);
  process.exitCode = 1;
} else {
  console.log(`${stats.stories} stories OK`);
}
if (process.argv.includes('--stats')) console.log(JSON.stringify(stats, null, 2));
