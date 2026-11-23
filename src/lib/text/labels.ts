import { hasWord, hasWordExact, normalizeForMatch } from './normalize';

export const LABEL_WORDS: string[] = [
  'autism', 'autistic', 'ASD', 'ADHD', 'Down syndrome', 'anxiety', 'OCD', 'ODD', 'PDA',
  'cerebral palsy', 'epilepsy', 'dyslexia', 'sensory processing disorder', 'on the spectrum',
  'autismo', 'autista', 'TDAH', 'síndrome de Down', 'ansiedad', 'epilepsia', 'parálisis cerebral', 'dislexia',
];

/** All-caps acronyms match case-sensitively so "odd" is not ODD. */
const ACRONYM = /^[A-Z]{2,}$/;

/** Label words that appear in `text` but never in `source`. */
export function unsaidLabels(text: string, source: string): string[] {
  const t = normalizeForMatch(text).norm;
  const s = normalizeForMatch(source).norm;
  const present = (norm: string, raw: string, w: string) => (ACRONYM.test(w) ? hasWordExact(raw, w) : hasWord(norm, w));
  return LABEL_WORDS.filter((w) => present(t, text, w) && !present(s, source, w));
}
