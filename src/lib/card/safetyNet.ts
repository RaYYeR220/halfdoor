import type { Lang } from '@/lib/text/lang';
import type { Span } from '@/lib/text/locate';
import { sentences } from '@/lib/text/sentences';
import type { SafetyPrompt } from './schema';

const w = (body: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})`, 'iu');

/**
 * Order matters: `matched` reports the first pattern that hits, so the most specific
 * medical terms come before the broad ones (EpiPen before allerg*).
 */
export const SAFETY_LEXICON: Record<'en' | 'es', RegExp[]> = {
  en: [
    w('epi-?pen'), w('epinephrine|adrenaline'), w('anaphyla\\w*'), w('allerg\\w*'), w('seizure\\w*'), w('medic\\w*'),
    w('insulin'), w('inhaler'), w('asthma'), w('diabet\\w*'), w('pick(?:s|ed|ing)?(?:\\s+(?:him|her|them))?[\\s-]?up'),
    w('collect(?:s|ed|ing)?\\s+(?:him|her|them)'), w('sign(?:s|ed|ing)?\\s+(?:him|her|them)\\s+out'), w('custody'),
    w('court order'), w('not allowed'), w('choking'), w('wanders?|runs? off|bolts?'),
  ],
  es: [
    w('epipen'), w('epinefrina|adrenalina'), w('convulsi[oó]n\\w*|convulsi\\w*'), w('al[eé]rg\\w*'), w('medic\\w*'), w('insulina'), w('inhalador'), w('asma'),
    w('diabet\\w*'), w('recog\\w*'), w('(?:pasar a )?buscarl[oa]'), w('custodia'), w('orden judicial'), w('no (?:se )?permit\\w*'),
    w('ahog\\w*'), w('se escapa'),
  ],
};

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

/** Every sentence that hits the lexicon and does not overlap an accepted safety span. */
export function findSafetyPrompts(source: string, lang: Lang, covered: Span[]): SafetyPrompt[] {
  const lexicon = lang === 'other' ? [...SAFETY_LEXICON.en, ...SAFETY_LEXICON.es] : SAFETY_LEXICON[lang];
  const out: SafetyPrompt[] = [];
  for (const span of sentences(source)) {
    if (covered.some((c) => overlaps(c, span))) continue;
    const sentence = source.slice(span.start, span.end);
    const folded = sentence.normalize('NFC');
    for (const re of lexicon) {
      const m = re.exec(folded);
      if (m) {
        out.push({ id: `s${span.start}`, sentence, span, matched: m[0] });
        break;
      }
    }
  }
  return out;
}
