// The landing's "Measured" numbers, read from the eval results at build time. Nothing here is typed in by hand:
// every count comes from eval/results/final.json (and the support rule's hand check from support-validation.json,
// the short-card check when there is one, since the landing compares short cards).
import type { ResultsFile } from '../../../eval/results';
import final from '../../../eval/results/final.json';
import validation from '../../../eval/results/support-validation.json';

export type Fraction = { n: number; of: number };

type SupportSample = { flagged: string; grounded: boolean | null };
type SupportCheck = { samples: SupportSample[] };
export type SupportValidation = { rounds: (SupportCheck & { round: number })[]; shortCard?: SupportCheck };

export type LandingEval = {
  stories: number;
  english: number;
  spanish: number;
  /** Safety facts kept: Halfdoor after the parent accepts the safety prompts, and the one-page Claude summary. */
  safety: { halfdoor: Fraction; plainSummary: Fraction };
  /** Outputs with at least one sentence the story does not support, of the outputs scored for support. */
  added: { claudeShort: Fraction; sameShort: Fraction; halfdoor: Fraction };
  /** The hand check of the support rule: the short-card check when there is one, else the latest round. */
  check: { shortCards: boolean; flagged: Fraction; passed: Fraction };
  /** Share of flagged sentences in that check that really add something. */
  precisionPct: number;
  /** Display name of the comparison model, e.g. "Claude Sonnet 5.5". */
  claudeName: string;
};

/** 'claude-sonnet-5-5' → 'Claude Sonnet 5.5'. */
export function modelDisplayName(id: string): string {
  const words: string[] = [];
  const version: string[] = [];
  for (const part of id.split('-')) {
    if (/^\d+$/.test(part)) version.push(part);
    else words.push(part.charAt(0).toUpperCase() + part.slice(1));
  }
  return [...words, version.join('.')].filter(Boolean).join(' ');
}

export function landingEval(f: ResultsFile, v: SupportValidation): LandingEval {
  const agg = (system: string) => {
    const a = f.aggregates.find((x) => x.system === system)?.agg;
    if (!a) throw new Error(`eval results have no "${system}" aggregate`);
    return a;
  };
  const added = (system: string): Fraction => {
    const p = agg(system).provenance;
    if (!p) throw new Error(`eval results have no provenance for "${system}"`);
    return { n: p.storiesWithUnsupported, of: p.supportScored };
  };
  const kept = (system: string): Fraction => {
    const a = agg(system);
    return { n: a.present, of: a.total };
  };

  const ids = f.rows.filter((r) => r.system === 'halfdoor').map((r) => r.storyId);
  const english = ids.filter((id) => id.startsWith('en-')).length;
  const spanish = ids.filter((id) => id.startsWith('es-')).length;
  if (english + spanish !== f.meta.stories) throw new Error('eval story languages do not add up to the story count');
  const safety = { halfdoor: kept('halfdoor_net'), plainSummary: kept('baseline_claude') };
  const addedBy = { claudeShort: added('baseline_claude_short'), sameShort: added('baseline_same_short'), halfdoor: added('halfdoor') };

  const checked = v.shortCard ?? [...v.rounds].sort((a, b) => b.round - a.round)[0];
  const judged = checked?.samples.filter((s) => s.grounded !== null) ?? [];
  const flagged = judged.filter((s) => s.flagged === 'unsupported');
  const passed = judged.filter((s) => s.flagged === 'supported');
  if (!flagged.length || !passed.length) throw new Error('support validation has no judged flagged and passed samples');
  const check = {
    shortCards: !!v.shortCard,
    flagged: { n: flagged.filter((s) => s.grounded === false).length, of: flagged.length },
    passed: { n: passed.filter((s) => s.grounded === true).length, of: passed.length },
  };
  const precisionPct = Math.round((100 * check.flagged.n) / check.flagged.of);

  return {
    stories: f.meta.stories,
    english,
    spanish,
    safety,
    added: addedBy,
    check,
    precisionPct,
    claudeName: modelDisplayName(f.meta.claudeModel),
  };
}

export const LANDING_EVAL: LandingEval = landingEval(final as unknown as ResultsFile, validation as SupportValidation);

/** "28 of 54" */
export const ofText = (x: Fraction) => `${x.n} of ${x.of}`;
