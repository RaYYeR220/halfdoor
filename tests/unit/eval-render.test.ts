import { describe, expect, test } from 'vitest';
import { adjudicate, type Adjudication, type ResultsFile } from '../../eval/results';
import { aggregate } from '../../eval/score';
import { replaceEvalBlocks } from '../../scripts/render-readme-numbers';

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
