// The landing's "Measured" numbers, read from the eval results at build time. Nothing here is typed in by hand:
// every count comes from eval/results/final.json (and the support rule's hand check from support-validation.json).
import type { ResultsFile } from '../../../eval/results';
import final from '../../../eval/results/final.json';
import validation from '../../../eval/results/support-validation.json';

export type Fraction = { n: number; of: number };

type SupportSample = { flagged: string; grounded: boolean };
export type SupportValidation = { rounds: { round: number; samples: SupportSample[] }[] };

export type LandingEval = {
  stories: number;
  english: number;
  spanish: number;
  /** Safety facts kept: Halfdoor after the parent accepts the safety prompts, and the one-page Claude summary. */
  safety: { halfdoor: Fraction; plainSummary: Fraction };
  /** Outputs with at least one sentence the story does not support, of the outputs scored for support. */
  added: { claudeShort: Fraction; sameShort: Fraction; halfdoor: Fraction };
  /** Share of flagged sentences that really add something, from the latest hand-checked round. */
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

  const round = [...v.rounds].sort((a, b) => b.round - a.round)[0];
  const flagged = round?.samples.filter((s) => s.flagged === 'unsupported') ?? [];
  if (!flagged.length) throw new Error('support validation has no flagged samples');
  const precisionPct = Math.round((100 * flagged.filter((s) => !s.grounded).length) / flagged.length);

  return {
    stories: f.meta.stories,
    english,
    spanish,
    safety: { halfdoor: kept('halfdoor_net'), plainSummary: kept('baseline_claude') },
    added: { claudeShort: added('baseline_claude_short'), sameShort: added('baseline_same_short'), halfdoor: added('halfdoor') },
    precisionPct,
    claudeName: modelDisplayName(f.meta.claudeModel),
  };
}

export const LANDING_EVAL: LandingEval = landingEval(final as unknown as ResultsFile, validation as SupportValidation);

/** "29 of 54" */
export const ofText = (x: Fraction) => `${x.n} of ${x.of}`;
