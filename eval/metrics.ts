// Provenance metrics, deterministic, computed from an output and its story (no model calls).
//   - unsupported sentences: a sentence is SUPPORTED when at least a third of its content words also occur in
//     the story (content word = 4+ letters, not a stopword, compared by 5-char prefix after normalizeForMatch);
//     sentences of 4 words or fewer (headers, "Allergies: none") and sentences with no content word are
//     ignored, and an output in another language than its story is not scored (word overlap cannot see a
//     translation). This is the rule after one revision: the first version (half of the content words,
//     3-word headers, no language check) was 60% precise on a hand-checked sample; see
//     eval/results/support-validation.json;
//   - unsaid labels: diagnosis labels (LABEL_WORDS) in the output that the story never uses, as exact words
//     (the product verifier's check) and by label family (another form or language of the same diagnosis);
//   - length: words and reading time at 200 words per minute.
import { unsaidLabels } from '../src/lib/text/labels';
import { detectLang, type Lang } from '../src/lib/text/lang';
import { hasWord, hasWordExact, normalizeForMatch } from '../src/lib/text/normalize';
import { normalizeOutput } from './normalize';

export const SUPPORT_THRESHOLD = 1 / 3;
export const MAX_IGNORED_WORDS = 4;
export const READ_WPM = 200;

// Function words of 4+ letters (shorter words are never content words), English and Spanish.
const STOP_WORDS = (
  'about above after again against also because been before being below between both could does doing down during each from further have having here hers herself himself into itself just more most myself once only other ours over same should some such than that their theirs them themselves then there these they this those through under until very were what when where which while will with would your yours yourself yourselves please shall must might maybe make made sure know need needs thing things really there\'s that\'s it\'s he\'s she\'s they\'re you\'re don\'t doesn\'t isn\'t can\'t won\'t '
  + 'para como pero esta este esto estos estas esos esas tiene tienen todo toda todos todas cuando donde porque sobre entre desde hasta unos unas nosotros nosotras ellos ellas también tambien solo sólo está están estar será puede pueden hace hacer cada otra otro otros otras mismo misma algo nada poco mucho mucha muchos muchas usted ustedes según sino aunque mientras durante antes después despues luego ahora siempre nunca favor'
).split(' ');
const STOP = new Set(STOP_WORDS.map((w) => normalizeForMatch(w).norm));

const words = (text: string) => normalizeForMatch(text).norm.match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) ?? [];

/** 5-char prefixes of the content words. */
export function contentKeys(text: string): string[] {
  return words(text)
    .filter((w) => w.length >= 4 && !STOP.has(w))
    .map((w) => w.slice(0, 5));
}

/** Sentences of an output: markdown stripped (no carrying), split on the scorer's separators. */
export function outputSentences(text: string): string[] {
  return normalizeOutput(text, { carry: false })
    .split(/\n|(?<=[.!?;])\s+|[•|]/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type SentenceSupport = { sentence: string; keys: number; inStory: number; supported: boolean };

/** null = ignored (header-like or no content word). */
export function sentenceSupport(sentence: string, storyKeys: Set<string>): SentenceSupport | null {
  if (words(sentence).length <= MAX_IGNORED_WORDS) return null;
  const keys = contentKeys(sentence);
  if (keys.length === 0) return null;
  const inStory = keys.filter((k) => storyKeys.has(k)).length;
  return { sentence, keys: keys.length, inStory, supported: inStory / keys.length >= SUPPORT_THRESHOLD };
}

export function supportOf(text: string, story: string): SentenceSupport[] {
  const storyKeys = new Set(contentKeys(story));
  return outputSentences(text).flatMap((s) => sentenceSupport(s, storyKeys) ?? []);
}

/** Same diagnosis across inflection and EN/ES, so a translation is not counted as a new label. */
export const LABEL_FAMILIES: string[][] = [
  ['autism', 'autistic', 'ASD', 'on the spectrum', 'autismo', 'autista'],
  ['ADHD', 'TDAH'],
  ['Down syndrome', 'síndrome de Down'],
  ['anxiety', 'ansiedad'],
  ['epilepsy', 'epilepsia'],
  ['cerebral palsy', 'parálisis cerebral', 'CP'],
  ['dyslexia', 'dislexia'],
  ['OCD'],
  ['ODD'],
  ['PDA'],
  ['sensory processing disorder'],
];

/** Labels whose whole family is absent from the story (a family member in the story counts as said). */
export function unsaidLabelFamilies(text: string, story: string): string[] {
  const norm = normalizeForMatch(story).norm;
  // Acronyms of 4+ letters are unambiguous in lower case ("adhd"); shorter ones ("odd", "cp") are not.
  const said = (m: string) =>
    /^[A-Z]{2,}$/.test(m) ? hasWordExact(story, m) || (m.length >= 4 && hasWord(norm, m.toLowerCase())) : hasWord(norm, m);
  return unsaidLabels(text, story).filter((w) => !(LABEL_FAMILIES.find((f) => f.includes(w)) ?? [w]).some(said));
}

export function wordCount(text: string): number {
  return words(normalizeOutput(text, { carry: false })).length;
}

/** Support is only scored when the output is in the story's language. */
export const outputLang = (text: string): Lang => detectLang(normalizeOutput(text, { carry: false }));
export const sameLanguage = (text: string, story: string) => outputLang(text) === detectLang(story);

export type Provenance = {
  /** false: detected output language differs from the story's, support not scored (sentences 0, unsupported []). */
  supportScored: boolean;
  /** detectLang of the output and of the story (the stopword heuristic; short or mixed text can come out 'other'). */
  lang: { output: Lang; story: Lang };
  sentences: number;
  unsupported: string[];
  unsaidLabels: string[];
  unsaidFamilies: string[];
  words: number;
  readSec: number;
};

export function provenance(text: string, story: string): Provenance {
  const supportScored = sameLanguage(text, story);
  const sup = supportScored ? supportOf(text, story) : [];
  const w = wordCount(text);
  return {
    supportScored,
    lang: { output: outputLang(text), story: detectLang(story) },
    sentences: sup.length,
    unsupported: sup.filter((s) => !s.supported).map((s) => s.sentence),
    unsaidLabels: unsaidLabels(text, story),
    unsaidFamilies: unsaidLabelFamilies(text, story),
    words: w,
    readSec: Math.round((w / READ_WPM) * 60),
  };
}
