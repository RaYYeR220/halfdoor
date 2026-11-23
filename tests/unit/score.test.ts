import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { aggregate, chooseModel, percentile, scoreOutput, trapClass, type Row } from '../../eval/score';
import type { EvalStory } from '../../eval/types';

// Sentence-scoped helpers in the style of eval/stories/README.md.
const S = '[^.!?\\n;•|]';
const NEG = "n['’]t|\\bnot\\b|\\bno\\b|never|cannot|no longer";
const DAD = '\\bdad\\b|father';

const FIXTURE: EvalStory = {
  id: 'fx-01',
  lang: 'en',
  text: 'Leo is 6. He used to be allergic to eggs but he outgrew it. He IS allergic to peanuts. His dad is NOT allowed to pick him up.',
  facts: [
    { id: 'peanut', kind: 'allergy', must: [['peanut|man[ií]'], ['allerg|al[eé]rg']], limiter: false },
    {
      id: 'pickup-dad',
      kind: 'pickup',
      must: [[`(?:${DAD})${S}{0,80}(?:${NEG})|(?:${NEG})${S}{0,80}(?:${DAD})`], ['pick']],
      limiter: true,
    },
  ],
  traps: [
    {
      id: 'negated_pickup.dad',
      pattern: `(?<=^|[.!?\\n;•|])(?!${S}*(?:${NEG}))${S}*?(?:${DAD})${S}{0,40}(?:can|may|allowed)${S}{0,25}pick`,
      why: 'Dad may not pick up.',
    },
    {
      id: 'outgrown.egg',
      pattern: `(?<=^|[.!?\\n;•|])(?!${S}*(?:outgr|used to|${NEG}))${S}*?\\beggs?\\b${S}{0,30}allerg|(?<=^|[.!?\\n;•|])(?!${S}*(?:outgr|used to|${NEG}))${S}*?allerg${S}{0,30}\\beggs?\\b`,
      why: 'Egg allergy was outgrown.',
    },
    { id: 'number.age', pattern: `\\b(?:7|8) years? old`, why: 'He is 6, not 7 or 8.' },
    { id: 'sibling.asthma', pattern: 'asthma', why: 'Asthma is his sister, not him.' },
  ],
  tags: [],
};

const GOOD = 'SAFETY:\n- He IS allergic to peanuts.\n- His dad is NOT allowed to pick him up.';

describe('scoreOutput', () => {
  test('a correct summary keeps every fact and fires no trap', () => {
    const s = scoreOutput(FIXTURE, GOOD);
    expect(s).toMatchObject({ present: 2, total: 2, flips: [], missing: [], trapHits: [] });
    expect(s.limiterPresent).toBe(1);
    expect(s.limiterTotal).toBe(1);
    expect(s.trapClasses).toEqual({ flips: [], number: [], sibling: [] });
  });

  test('"Dad may pick him up" is a flip and loses the limiter fact', () => {
    const s = scoreOutput(FIXTURE, 'Allergic to peanuts. Dad may pick him up after church.');
    expect(s.flips).toEqual(['negated_pickup.dad']);
    expect(s.trapHits).toEqual(['negated_pickup.dad']);
    expect(s.missing).toEqual(['pickup-dad']);
    expect(s.present).toBe(1);
    expect(s.limiterPresent).toBe(0);
  });

  test('a limiter sentence elsewhere does not rescue a flipped one ("Dad can pick up. Grandma cannot.")', () => {
    const s = scoreOutput(FIXTURE, 'Dad can pick him up. Grandma cannot come. Peanut allergy.');
    expect(s.missing).toContain('pickup-dad');
    expect(s.trapHits).toContain('negated_pickup.dad');
  });

  test('"allergic to eggs" without the outgrew qualifier is a trap hit', () => {
    const s = scoreOutput(FIXTURE, `${GOOD}\n- Allergic to eggs, keep snacks egg-free.`);
    expect(s.trapHits).toEqual(['outgrown.egg']);
    expect(s.trapClasses.flips).toEqual(['outgrown.egg']);
    expect(s.present).toBe(2);
  });

  test('the outgrown qualifier in the same sentence keeps the trap quiet', () => {
    const s = scoreOutput(FIXTURE, `${GOOD}\n- He used to be allergic to eggs but outgrew it.`);
    expect(s.trapHits).toEqual([]);
  });

  test('number and sibling traps land in their own classes', () => {
    const s = scoreOutput(FIXTURE, `${GOOD} He is 8 years old and has asthma.`);
    expect(s.trapClasses).toEqual({ flips: [], number: ['number.age'], sibling: ['sibling.asthma'] });
    expect(s.flips).toEqual([]);
  });

  test('matches are case-insensitive and NFC-normalised (Spanish output of a decomposed accent)', () => {
    const nfd = 'Es alérgico al maní. Su papá NO puede recogerlo (pick-up restringido).';
    const s = scoreOutput(FIXTURE, nfd);
    expect(s.missing).not.toContain('peanut');
  });

  test('empty output misses everything', () => {
    const s = scoreOutput(FIXTURE, '');
    expect(s).toMatchObject({ present: 0, total: 2, missing: ['peanut', 'pickup-dad'], trapHits: [] });
  });
});

describe('scoreOutput on the real answer key (en-01, es-01)', () => {
  const load = (id: string) => JSON.parse(readFileSync(join(process.cwd(), 'eval/stories', `${id}.json`), 'utf8')) as EvalStory;

  test('en-01: careful summary hits every fact, no trap', () => {
    const s = scoreOutput(
      load('en-01'),
      "Leo (6). His dad is NOT allowed to pick him up (court order). Only Sara or grandma Ruth may pick him up. He bolts for the nearest door when overwhelmed. He used to be allergic to eggs but outgrew it.",
    );
    expect(s).toMatchObject({ present: 3, total: 3, trapHits: [] });
  });

  test('en-01: flipped summary fires the pickup and egg traps', () => {
    const s = scoreOutput(load('en-01'), 'Leo is allergic to eggs. Pick-up: Dad, Sara or grandma Ruth.');
    expect(s.trapHits.sort()).toEqual(['negated_pickup.dad', 'outgrown.egg']);
    expect(s.missing).toContain('dad_no_pickup');
  });

  test('es-01: an English summary of a Spanish story still scores', () => {
    const s = scoreOutput(
      load('es-01'),
      "Mateo (5): peanut allergy, EpiPen in the blue backpack. His dad cannot pick him up (judge's order). Only his mom Daniela or grandma Carmen.",
    );
    expect(s).toMatchObject({ present: 4, total: 4, trapHits: [] });
  });
});

describe('trapClass', () => {
  test.each([
    ['outgrown.egg', 'flips'],
    ['negated_pickup.dad', 'flips'],
    ['only_may.mom', 'flips'],
    ['doesnt_need.help', 'flips'],
    ['double_negation.run', 'flips'],
    ['cancelled_med.depakote', 'flips'],
    ['number.puffs', 'number'],
    ['sibling.egg', 'sibling'],
  ])('%s -> %s', (id, cls) => {
    expect(trapClass(id)).toBe(cls);
  });
  test('unknown trap type throws', () => {
    expect(() => trapClass('weird.x')).toThrow();
  });
});

describe('percentile', () => {
  test('nearest rank', () => {
    const xs = [5, 1, 4, 2, 3, 6, 7, 8, 9, 10];
    expect(percentile(xs, 50)).toBe(5);
    expect(percentile(xs, 95)).toBe(10);
    expect(percentile([], 50)).toBe(0);
  });
});

const row = (over: Partial<Row>): Row => ({
  system: 'halfdoor',
  model: 'm',
  storyId: 'x',
  noSafety: false,
  score: { present: 2, total: 2, limiterPresent: 1, limiterTotal: 1, flips: [], missing: [], trapHits: [], trapClasses: { flips: [], number: [], sibling: [] } },
  latencyMs: 1000,
  costUsd: 0.001,
  cached: false,
  ...over,
});

describe('aggregate', () => {
  test('sums facts, traps, burden, latency and cost', () => {
    const a = aggregate([
      row({ storyId: 'a', latencyMs: 1000 }),
      row({
        storyId: 'b',
        latencyMs: 3000,
        score: { present: 1, total: 2, limiterPresent: 0, limiterTotal: 1, flips: ['outgrown.x'], missing: ['f'], trapHits: ['outgrown.x', 'number.y'], trapClasses: { flips: ['outgrown.x'], number: ['number.y'], sibling: [] } },
      }),
      row({ storyId: 'c', noSafety: true, score: { present: 0, total: 0, limiterPresent: 0, limiterTotal: 0, flips: [], missing: [], trapHits: [], trapClasses: { flips: [], number: [], sibling: [] } }, safetyItems: 1, safetyPrompts: 2 }),
    ]);
    expect(a).toMatchObject({
      stories: 3,
      present: 3,
      total: 4,
      limiterPresent: 1,
      limiterTotal: 2,
      trapHits: 2,
      trapClasses: { flips: 1, number: 1, sibling: 0 },
      storiesWithTrap: 1,
      noSafety: { stories: 1, safetyItems: 1, safetyPrompts: 2, storiesWithAny: 1 },
      errors: 0,
    });
    expect(a.costUsd).toBeCloseTo(0.003, 9);
    expect(a.p50Ms).toBe(1000);
    expect(a.p95Ms).toBe(3000);
  });
  test('baselines carry no burden numbers', () => {
    const a = aggregate([row({ system: 'baseline_same', noSafety: true })]);
    expect(a.noSafety).toEqual({ stories: 1, safetyItems: null, safetyPrompts: null, storiesWithAny: null });
  });
});

describe('chooseModel', () => {
  const agg = (model: string, o: { flips?: number; traps?: number; present: number; p50: number }) => ({
    model,
    flips: o.flips ?? 0,
    trapHits: o.traps ?? 0,
    presentRate: o.present,
    p50Ms: o.p50,
  });
  test('0 flips and 0 traps first, then present rate, then p50 < 8 s', () => {
    const c = chooseModel([
      agg('a', { traps: 1, present: 0.99, p50: 3000 }),
      agg('b', { present: 0.9, p50: 9000 }),
      agg('c', { present: 0.95, p50: 7000 }),
      agg('d', { present: 0.95, p50: 5000 }),
    ]);
    expect(c.model).toBe('d');
    expect(c.clean).toBe(true);
  });
  test('p50 under 8 s beats a slower model with the same present rate', () => {
    expect(chooseModel([agg('slow', { present: 0.9, p50: 9000 }), agg('fast', { present: 0.9, p50: 7900 })]).model).toBe('fast');
  });
  test('the p50 limit is a requirement: a slow model with a higher present rate loses', () => {
    const c = chooseModel([agg('slow', { present: 1, p50: 31_000 }), agg('ok', { present: 0.97, p50: 7200 }), agg('quick', { present: 0.92, p50: 2500 })]);
    expect(c.model).toBe('ok');
    expect(c.fast).toBe(true);
  });
  test('no model under the limit: highest present rate, flagged slow', () => {
    const c = chooseModel([agg('a', { present: 0.9, p50: 9000 }), agg('b', { present: 0.95, p50: 12_000 })]);
    expect(c).toMatchObject({ model: 'b', clean: true, fast: false });
  });
  test('no clean model: fewest flips, then fewest traps, flagged', () => {
    const c = chooseModel([agg('a', { flips: 2, traps: 2, present: 0.99, p50: 1 }), agg('b', { flips: 1, traps: 3, present: 0.8, p50: 1 })]);
    expect(c.model).toBe('b');
    expect(c.clean).toBe(false);
  });
});
