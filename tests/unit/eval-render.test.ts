import { describe, expect, test } from 'vitest';
import { adjudicate, plural, provenanceTable, usd, type Adjudication, type ResultsFile } from '../../eval/results';
import type { Aggregate } from '../../eval/score';
import { aggregate } from '../../eval/score';
import { evalValues, groundingCheck, replaceEvalBlocks, reusesCall, summaryTable } from '../../scripts/render-readme-numbers';
import type { SupportValidationFile } from '../../eval/support-sample';

describe('replaceEvalBlocks', () => {
  test('replaces known inline blocks and keeps the markers', () => {
    const doc = 'Recall: <!-- eval:halfdoor-present -->??<!-- /eval:halfdoor-present --> of facts.';
    const r = replaceEvalBlocks(doc, { 'halfdoor-present': '95% (149/157)' });
    expect(r.text).toBe('Recall: <!-- eval:halfdoor-present -->95% (149/157)<!-- /eval:halfdoor-present --> of facts.');
    expect(r.replaced).toEqual(['halfdoor-present']);
    expect(r.unknown).toEqual([]);
  });

  test('multi-line values go on their own lines; re-running is idempotent', () => {
    const doc = 'A\n<!-- eval:headline -->\nold\ntable\n<!-- /eval:headline -->\nB';
    const once = replaceEvalBlocks(doc, { headline: '| a | b |\n|---|---|' }).text;
    expect(once).toBe('A\n<!-- eval:headline -->\n| a | b |\n|---|---|\n<!-- /eval:headline -->\nB');
    expect(replaceEvalBlocks(once, { headline: '| a | b |\n|---|---|' }).text).toBe(once);
  });

  test('unknown names are left untouched and reported', () => {
    const doc = 'x <!-- eval:nope -->keep<!-- /eval:nope --> y <!-- eval:model -->m<!-- /eval:model -->';
    const r = replaceEvalBlocks(doc, { model: 'e2ee-x' });
    expect(r.text).toBe('x <!-- eval:nope -->keep<!-- /eval:nope --> y <!-- eval:model -->e2ee-x<!-- /eval:model -->');
    expect(r.unknown).toEqual(['nope']);
  });

  test('no blocks: no-op', () => {
    const r = replaceEvalBlocks('# Halfdoor\nnothing here', { model: 'x' });
    expect(r).toEqual({ text: '# Halfdoor\nnothing here', replaced: [], unknown: [] });
  });

  test('mismatched close tag is not touched', () => {
    const doc = '<!-- eval:a -->x<!-- /eval:b -->';
    expect(replaceEvalBlocks(doc, { a: '1', b: '2' }).text).toBe(doc);
  });

  test('a $ in the value is inserted literally', () => {
    const doc = '<!-- eval:cost -->?<!-- /eval:cost -->';
    expect(replaceEvalBlocks(doc, { cost: '$0.42 ($& $1)' }).text).toBe('<!-- eval:cost -->$0.42 ($& $1)<!-- /eval:cost -->');
  });
});

describe('adjudicate', () => {
  const score = (missing: string[], trapHits: string[]) => ({
    present: 2 - missing.length, total: 2, limiterPresent: 0, limiterTotal: 0, flips: [], missing, trapHits, trapClasses: { flips: [], number: [], sibling: [] },
  });
  const row = (system: string, storyId: string, missing: string[], trapHits: string[]) => ({
    system, model: 'm', storyId, noSafety: false, score: score(missing, trapHits), latencyMs: 1, costUsd: 0, cached: true,
  });
  const file = (rows: ReturnType<typeof row>[]): ResultsFile => ({
    meta: { createdAt: 'x', stories: 2, systems: ['a', 'b'], models: ['m'], claudeModel: 'c', maxTokens: 1, concurrency: 1, balanceBeforeUsd: null, balanceAfterUsd: null, liveSpendUsd: 0 },
    aggregates: ['a', 'b'].map((system) => ({ system, model: 'm', agg: aggregate(rows.filter((r) => r.system === system)) })),
    rows,
  });

  test('scorer verdicts reverse misses and trap hits; real ones stay; unknown ones are counted', () => {
    const f = file([row('a', 's1', ['f1'], ['t1']), row('a', 's2', ['f2'], []), row('b', 's1', [], ['t9'])]);
    const adj: Adjudication = {
      items: {
        'a/s1/f1': { verdict: 'scorer', note: 'in a bullet list' },
        'a/s1/t1': { verdict: 'scorer', note: 'heading' },
        'a/s2/f2': { verdict: 'real', note: 'left off' },
      },
    };
    const m = adjudicate(f, adj);
    expect(m.get('a')).toEqual({ present: 3, total: 4, trapHits: 0, scorerMisses: 1, scorerTraps: 1, unreviewed: 0 });
    expect(m.get('b')).toEqual({ present: 2, total: 2, trapHits: 1, scorerMisses: 0, scorerTraps: 0, unreviewed: 1 });
  });
});

describe('formatting', () => {
  test('usd: 4 decimals below $1, 2 above, the same rule for every row', () => {
    expect(usd(0.0114)).toBe('$0.0114');
    expect(usd(0.43)).toBe('$0.4300');
    expect(usd(12.345)).toBe('$12.35');
  });
  test('plural counts facts and stories exactly', () => {
    expect(plural(1, 'missed fact', 'missed facts')).toBe('1 missed fact');
    expect(plural(4, 'story', 'stories')).toBe('4 stories');
  });
  test('provenanceTable lists only systems with metrics and reports unscored rows', () => {
    const prov = { supportScored: 1, unsupportedMean: 2, storiesWithUnsupported: 1, sentencesMean: 5, outputsWithUnsaidLabel: 1, outputsWithUnsaidFamily: 0, wordsMean: 200, wordsP50: 200, readSecMean: 60, readSecP50: 60 };
    const f = {
      meta: {} as ResultsFile['meta'],
      rows: [],
      aggregates: [
        { system: 'baseline_same', model: 'm', agg: { stories: 2, provenance: prov } as unknown as Aggregate },
        { system: 'x', model: 'm', agg: { stories: 2, provenance: null } as unknown as Aggregate },
      ],
    } as ResultsFile;
    const t = provenanceTable(f).split('\n');
    expect(t).toHaveLength(3);
    expect(t[2]).toBe('| Plain summary, same enclave model | 2.00 (of 5.0 sentences) | 1/1 (1 not scored) | 1 / 0 outputs | 200 / 200 | 60.0 s / 60.0 s |');
  });
});

describe('doc values from a small run', () => {
  const prov = (unsupported: number, words: number, scored = true) => ({
    supportScored: scored, lang: { output: 'en' as const, story: 'en' as const }, sentences: 4, unsupported: Array.from({ length: unsupported }, (_, i) => `s${i}`),
    unsaidLabels: [], unsaidFamilies: [], words, readSec: words * 0.3,
  });
  const score = (missing: string[], trapHits: string[]) => ({
    present: 2 - missing.length, total: 2, limiterPresent: 1, limiterTotal: 1, flips: [], missing, trapHits, trapClasses: { flips: [], number: [], sibling: trapHits },
  });
  type R = Parameters<typeof aggregate>[0][number];
  const row = (system: string, storyId: string, missing: string[], trapHits: string[], costUsd: number, p: ReturnType<typeof prov>): R => ({
    system, model: system.startsWith('baseline_claude') ? 'claude-x' : 'e2ee-x', storyId, noSafety: false, score: score(missing, trapHits), latencyMs: 1000, costUsd, cached: true, prov: p,
  });
  const rows: R[] = [
    row('halfdoor', 'en-01', ['f1'], [], 0.01, prov(0, 80)),
    row('halfdoor', 'es-01', [], [], 0.01, prov(1, 90)),
    row('halfdoor_net', 'en-01', [], [], 0.01, prov(0, 82)),
    row('halfdoor_net', 'es-01', [], [], 0.01, prov(1, 92)),
    row('baseline_claude', 'en-01', [], ['sibling.x'], 0.2, prov(3, 300)),
    row('baseline_claude', 'es-01', [], [], 0.2, prov(0, 280, false)),
  ];
  const systems = ['halfdoor', 'halfdoor_net', 'baseline_claude'];
  const f: ResultsFile = {
    meta: { createdAt: 'x', stories: 2, systems, models: ['e2ee-x'], claudeModel: 'claude-x', maxTokens: 1, concurrency: 1, balanceBeforeUsd: null, balanceAfterUsd: null, liveSpendUsd: 0 },
    aggregates: systems.map((system) => ({ system, model: system === 'baseline_claude' ? 'claude-x' : 'e2ee-x', agg: aggregate(rows.filter((r) => r.system === system)) })),
    rows,
  };
  const adj: Adjudication = { items: { 'halfdoor/en-01/f1': { verdict: 'real', note: 'left off' }, 'baseline_claude/en-01/sibling.x': { verdict: 'scorer', note: 'next sentence' } } };
  const sv: SupportValidationFile = {
    rounds: [
      { rule: 'old', seed: 1, round: 1, samples: [{ system: 'b', storyId: 's', sentence: 'x', flagged: 'unsupported', keys: 1, inStory: 0, grounded: true, note: '' }] },
      {
        rule: 'new', seed: 2, round: 2,
        samples: [
          ...Array.from({ length: 4 }, (_, i) => ({ system: 'b', storyId: 's', sentence: `u${i}`, flagged: 'unsupported' as const, keys: 1, inStory: 0, grounded: i === 0, note: '' })),
          ...Array.from({ length: 2 }, (_, i) => ({ system: 'b', storyId: 's', sentence: `p${i}`, flagged: 'supported' as const, keys: 1, inStory: 1, grounded: true, note: '' })),
          { system: 'b', storyId: 's', sentence: 'unjudged', flagged: 'supported', keys: 1, inStory: 1, grounded: null, note: '' },
        ],
      },
    ],
  };
  const v = evalValues(f, adj, sv);

  test('story languages, cost paid once per model call, cost per story', () => {
    expect(v['stories-en']).toBe('1');
    expect(v['stories-es']).toBe('1');
    expect(reusesCall('halfdoor_net')).toBe(true);
    expect(reusesCall('halfdoor')).toBe(false);
    expect(v['eval-cost']).toBe('$0.4200'); // halfdoor 0.02 + baseline 0.40; the safety-net row re-scores the same card
    expect(v['halfdoor-cost-per-story']).toBe('$0.0100');
  });

  test('outputs that add a sentence count only outputs scored for support', () => {
    expect(v['halfdoor-added']).toBe('1 of 2');
    expect(v['baseline_claude-added']).toBe('1 of 1');
  });

  test('baseline trap hits: automatic vs confirmed by the hand review', () => {
    expect(v['baseline_claude-traps']).toBe('1');
    expect(v['baseline_claude-reviewed-traps']).toBe('0');
    expect(v['baselines-trap-review']).toBe('1 flagged automatically, 0 confirmed by hand review');
  });

  test('grounding check uses the latest round and skips unjudged samples', () => {
    expect(groundingCheck(sv)).toEqual({ flagged: { n: 3, of: 4 }, passed: { n: 2, of: 2 } });
    expect(v['grounding-precision']).toBe('75% (3 of 4)');
    expect(v['grounding-passed']).toBe('100% (2 of 2)');
    expect(groundingCheck(null)).toBeNull();
    expect(groundingCheck({ rounds: [] })).toBeNull();
    expect('grounding-precision' in evalValues(f, adj)).toBe(false);
  });

  test('summary table: reviewed facts and claims, added sentences, words; unreviewed flags are called out', () => {
    const t = v.summary.split('\n');
    expect(t[0]).toBe('| System | Model | Safety facts kept | Wrong safety claims | Outputs with a sentence the parent never said | Words, mean |');
    expect(t).toHaveLength(2 + systems.length);
    expect(t[2]).toBe('| Halfdoor card | `e2ee-x` | 75.0% (3/4) | 0 | 1 of 2 | 85 |');
    expect(t[4]).toBe('| Plain summary, Claude Sonnet 5.5 | `claude-x` | 100.0% (4/4) | 0 | 1 of 1 | 290 |');
    const unreviewed = summaryTable(f, adjudicate(f, { items: {} })).split('\n');
    expect(unreviewed[2]).toBe('| Halfdoor card | `e2ee-x` | 75.0% (3/4) (1 flag not reviewed) | 0 | 1 of 2 | 85 |');
    expect(unreviewed[4]).toContain('| 1 | 1 of 1 |');
  });
});
