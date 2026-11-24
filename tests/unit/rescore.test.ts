import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { rescore } from '../../eval/rescore';
import type { ResultsFile } from '../../eval/results';
import { aggregate, scoreOutput, type Row } from '../../eval/score';
import { CLAUDE_MODEL, MAX_TOKENS, PLAIN_SYSTEM, SHORT_USER, promptHash } from '../../eval/systems';
import type { EvalStory } from '../../eval/types';

const STORY: EvalStory = {
  id: 'en-99',
  lang: 'en',
  text: "Leo is 6 and he's autistic. He loves dinosaurs and anything with wheels. His dad is NOT allowed to pick him up.",
  facts: [],
  traps: [],
  tags: [],
};
const CARD = [
  '**Leo, age 6 — Sunday Volunteer Card**',
  'Leo loves dinosaurs and anything with wheels, and he is happy when the room is calm.',
  'His dad is not allowed to pick him up, so check the list with the parent.',
  'Offer him a sensory fidget toy and a weighted blanket.',
].join('\n\n');

const dir = mkdtempSync(join(tmpdir(), 'halfdoor-rescore-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function cache(text: string) {
  const user = `${SHORT_USER}\n\n${STORY.text}`;
  const hash = promptHash({ system: PLAIN_SYSTEM, user, maxTokens: MAX_TOKENS });
  const path = join(dir, 'baseline_claude_short', CLAUDE_MODEL, `${STORY.id}.${hash}.json`);
  mkdirSync(join(dir, 'baseline_claude_short', CLAUDE_MODEL), { recursive: true });
  writeFileSync(path, JSON.stringify({ model: CLAUDE_MODEL, text, usage: null, usageEstimated: true, latencyMs: 900, waitedMs: 0, costUsd: 0.001, at: 'x' }));
}

function file(text: string | undefined, unsupported: string[]): ResultsFile {
  const row: Row = {
    system: 'baseline_claude_short',
    model: CLAUDE_MODEL,
    storyId: STORY.id,
    noSafety: true,
    score: scoreOutput(STORY, CARD),
    latencyMs: 900,
    costUsd: 0.001,
    cached: true,
    ...(text !== undefined ? { text } : {}),
    prov: { supportScored: true, lang: { output: 'en', story: 'en' }, sentences: 3, unsupported, unsaidLabels: [], unsaidFamilies: [], words: 22, readSec: 7 },
  };
  return {
    meta: { createdAt: 'x', stories: 1, systems: ['baseline_claude_short'], models: ['e2ee-x'], claudeModel: CLAUDE_MODEL, maxTokens: MAX_TOKENS, concurrency: 1, balanceBeforeUsd: null, balanceAfterUsd: null, liveSpendUsd: 0 },
    aggregates: [{ system: 'baseline_claude_short', model: CLAUDE_MODEL, agg: aggregate([row]) }],
    rows: [row],
  };
}

const stories = new Map([[STORY.id, STORY]]);

describe('rescore', () => {
  test('re-reads the output from the cache, scores it with the current rule and records what it replaced', async () => {
    cache(CARD);
    const old = file(CARD, ['Leo, age 6 — Sunday Volunteer Card', 'Offer him a sensory fidget toy and a weighted blanket.']);
    const { file: f, mismatches } = await rescore(old, stories, { cacheDir: dir, note: 'titles skipped', at: '2026-11-24T00:00:00Z' });
    expect(mismatches).toEqual([]);
    expect(f.rows[0].prov?.unsupported).toEqual(['Offer him a sensory fidget toy and a weighted blanket.']);
    expect(f.rows[0].score).toEqual(old.rows[0].score);
    expect(f.meta.rescored).toEqual([
      {
        at: '2026-11-24T00:00:00Z',
        note: 'titles skipped',
        before: { [`baseline_claude_short@${CLAUDE_MODEL}`]: { storiesWithUnsupported: 1, supportScored: 1, unsupportedMean: 2, present: 0, trapHits: 0 } },
      },
    ]);
    expect(f.aggregates[0].agg.provenance?.unsupportedMean).toBe(1);
  });

  test('a stored text that differs from the cache is reported; a row stored without text stays without it', async () => {
    cache(CARD);
    expect((await rescore(file('something else', []), stories, { cacheDir: dir, note: 'n' })).mismatches).toEqual([`baseline_claude_short@${CLAUDE_MODEL} en-99`]);
    const { file: f, mismatches } = await rescore(file(undefined, []), stories, { cacheDir: dir, note: 'n' });
    expect(mismatches).toEqual([]);
    expect('text' in f.rows[0]).toBe(false);
  });

  test('a cache miss stops: no model call, no network', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'halfdoor-rescore-empty-'));
    try {
      await expect(rescore(file(CARD, []), stories, { cacheDir: empty, note: 'n' })).rejects.toThrow(/no cached output for baseline_claude_short/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
