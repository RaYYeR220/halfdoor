import { describe, expect, test } from 'vitest';
import type { ResultsFile } from '../../eval/results';
import final from '../../eval/results/final.json';
import { LANDING_EVAL, landingEval, modelDisplayName, ofText, type SupportValidation } from '@/lib/landing/eval';

const results = final as unknown as ResultsFile;
const prov = (system: string) => results.aggregates.find((a) => a.system === system)!.agg.provenance!;

describe('landing eval numbers', () => {
  test('come straight from final.json', () => {
    const net = results.aggregates.find((a) => a.system === 'halfdoor_net')!.agg;
    const claude = results.aggregates.find((a) => a.system === 'baseline_claude')!.agg;
    expect(LANDING_EVAL.stories).toBe(results.meta.stories);
    expect(LANDING_EVAL.english + LANDING_EVAL.spanish).toBe(results.meta.stories);
    expect(LANDING_EVAL.safety.halfdoor).toEqual({ n: net.present, of: net.total });
    expect(LANDING_EVAL.safety.plainSummary).toEqual({ n: claude.present, of: claude.total });
    expect(LANDING_EVAL.added.claudeShort).toEqual({ n: prov('baseline_claude_short').storiesWithUnsupported, of: prov('baseline_claude_short').supportScored });
    expect(LANDING_EVAL.added.sameShort).toEqual({ n: prov('baseline_same_short').storiesWithUnsupported, of: prov('baseline_same_short').supportScored });
    expect(LANDING_EVAL.added.halfdoor).toEqual({ n: prov('halfdoor').storiesWithUnsupported, of: prov('halfdoor').supportScored });
  });

  test('the current run reads as the landing says', () => {
    expect([LANDING_EVAL.stories, LANDING_EVAL.english, LANDING_EVAL.spanish]).toEqual([60, 35, 25]);
    expect(ofText(LANDING_EVAL.safety.halfdoor)).toBe('157 of 157');
    expect(ofText(LANDING_EVAL.safety.plainSummary)).toBe('157 of 157');
    expect(ofText(LANDING_EVAL.added.claudeShort)).toBe('29 of 54');
    expect(ofText(LANDING_EVAL.added.sameShort)).toBe('23 of 51');
    expect(ofText(LANDING_EVAL.added.halfdoor)).toBe('3 of 58');
    expect(LANDING_EVAL.precisionPct).toBe(85);
    expect(LANDING_EVAL.claudeName).toBe('Claude Sonnet 5.5');
  });

  test('precision comes from the latest hand-checked round', () => {
    const s = (flagged: string, grounded: boolean) => ({ flagged, grounded });
    const v: SupportValidation = {
      rounds: [
        { round: 2, samples: [s('unsupported', false), s('unsupported', true), s('supported', true), s('unsupported', false), s('unsupported', false)] },
        { round: 1, samples: [s('unsupported', true)] },
      ],
    };
    expect(landingEval(results, v).precisionPct).toBe(75);
  });

  test('a missing system fails the build instead of showing a blank number', () => {
    const v: SupportValidation = { rounds: [{ round: 1, samples: [{ flagged: 'unsupported', grounded: false }] }] };
    const without = { ...results, aggregates: results.aggregates.filter((a) => a.system !== 'baseline_same_short') };
    expect(() => landingEval(without, v)).toThrow(/baseline_same_short/);
  });

  test('model ids read as names', () => {
    expect(modelDisplayName('claude-sonnet-5-5')).toBe('Claude Sonnet 5.5');
    expect(modelDisplayName('claude-opus-4')).toBe('Claude Opus 4');
  });
});
