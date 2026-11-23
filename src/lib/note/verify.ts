import type { NoteDraft, VerifiedNote } from './schema';

export const JUDGMENT_WORDS: Record<'en' | 'es', string[]> = {
  en: ['bad', 'naughty', 'misbehav\\w*', 'aggressive', 'problem child', 'difficult child', 'meltdown', 'tantrum', 'defiant', 'lazy', 'rude'],
  es: ['malo', 'mala', 'se portó mal', 'agresiv\\w*', 'berrinche', 'rabieta', 'desobediente', 'grosero', 'flojo'],
};

const bounded = (alts: string[]) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
const RES = { en: bounded(JUDGMENT_WORDS.en), es: bounded(JUDGMENT_WORDS.es) };

/** Judgment words found in the text (lowercased, deduplicated). Flagged for the director, never removed. */
export function judgmentFlags(text: string, lang: 'en' | 'es'): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(RES[lang])) out.add(m[0].toLowerCase());
  return [...out];
}

/**
 * Every sentence must cite at least one real moment of this child at this service. Unknown ids are removed;
 * a sentence left with none is dropped. Judgment words are flagged, not removed.
 */
export function verifyNote(draft: NoteDraft, momentIds: Set<string>, lang: 'en' | 'es'): VerifiedNote {
  const sentences: VerifiedNote['sentences'] = [];
  const dropped: VerifiedNote['dropped'] = [];
  for (const s of draft.sentences) {
    const evidence = [...new Set(s.evidence.filter((id) => momentIds.has(id)))];
    if (evidence.length === 0) dropped.push({ text: s.text, reason: 'no_evidence' });
    else sentences.push({ text: s.text, evidence, flags: judgmentFlags(s.text, lang) });
  }
  return { sentences, dropped };
}
