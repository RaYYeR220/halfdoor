import { hasWord, normalizeForMatch } from './normalize';

export const LABEL_WORDS: string[] = [
  'autism', 'autistic', 'ASD', 'ADHD', 'Down syndrome', 'anxiety', 'OCD', 'ODD', 'PDA',
  'cerebral palsy', 'epilepsy', 'dyslexia', 'sensory processing disorder', 'on the spectrum',
  'autismo', 'autista', 'TDAH', 'síndrome de Down', 'ansiedad', 'epilepsia', 'parálisis cerebral', 'dislexia',
];

/** Label words that appear in `text` but never in `source`. */
export function unsaidLabels(text: string, source: string): string[] {
  const t = normalizeForMatch(text).norm;
  const s = normalizeForMatch(source).norm;
  return LABEL_WORDS.filter((w) => hasWord(t, w) && !hasWord(s, w));
}
