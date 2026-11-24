// Provenance metrics, deterministic, computed from an output and its story (no model calls).
//   - unsupported sentences: a sentence is SUPPORTED when at least a third of its content words also occur in
//     the story (content word = 4+ letters, not a stopword, compared by 5-char prefix after normalizeForMatch);
//     sentences of 4 words or fewer (headers, "Allergies: none") and sentences with no content word are
//     ignored, title and heading lines are ignored (isTitleLine: they name the card, they claim nothing), and
//     an output in another language than its story is not scored (word overlap cannot see a translation).
//     Rule history, each change checked by hand on a fresh sample (eval/results/support-validation.json):
//     v1 half of the content words, 3-word headers, no language check (60% precise); v2 one third, 4-word
//     headers, language check; v3 (this) also ignores title and heading lines, which v2 counted as unsupported
//     ("**Wyatt, age 7**", "## About Harper", "Child Care Summary: Elias, Age 9");
//   - unsaid labels: diagnosis labels (LABEL_WORDS) in the output that the story never uses, as exact words
//     (the product verifier's check) and by label family (another form or language of the same diagnosis);
//   - length: words and reading time at 200 words per minute.
import { unsaidLabels } from '../src/lib/text/labels';
import { detectLang, type Lang } from '../src/lib/text/lang';
import { hasWord, hasWordExact, normalizeForMatch } from '../src/lib/text/normalize';
import { childNameFor } from './childName';
import { normalizeOutput, normalizeUnits, type Unit } from './normalize';

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

const SENTENCE_SPLIT = /\n|(?<=[.!?;])\s+|[•|]/u;
const splitSentences = (text: string) =>
  text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);

/** Sentences of an output: markdown stripped (no carrying), split on the scorer's separators. */
export function outputSentences(text: string): string[] {
  return splitSentences(normalizeOutput(text, { carry: false }));
}

/** A line that ends like a sentence: . ! ? or … (closing quotes or brackets may follow). */
const TERMINAL = /[.!?…]["'”’)\]]*\s*$/u;
/** With the child's name, these make a line a title: an age, or the card / volunteer / Sunday it is for. */
const TITLE_WORDS =
  /(?<![\p{L}\p{N}])(?:\d{1,2}|age|aged|edad|años|anos|years?|card|tarjeta|nota|volunteers?|voluntari[oa]s?|sunday|domingo)(?![\p{L}\p{N}])/iu;

/**
 * A title or heading line names the card or a section; it claims nothing about the child, so the support rule
 * skips it. One of: a markdown heading or a bold-only heading line (the normalizer's heading kind); the first
 * line of the output when it is plain text without terminal punctuation; a plain text line without terminal
 * punctuation that has the child's name and an age or "card" / "tarjeta" / "nota" / "volunteer" / "voluntario" /
 * "Sunday" / "domingo". A plain line must be a single sentence; list items and table rows are never titles.
 */
export function isTitleLine(unit: Unit, first: boolean, childName = ''): boolean {
  if (unit.kind === 'heading') return true;
  if (unit.kind !== 'text' || TERMINAL.test(unit.text) || splitSentences(unit.text).length !== 1) return false;
  if (first) return true;
  return !!childName && hasWord(normalizeForMatch(unit.text).norm, childName) && TITLE_WORDS.test(unit.text);
}

export type OutputSentence = { sentence: string; title: boolean };

/** outputSentences, each marked when it comes from a title or heading line (isTitleLine). */
export function outputClaims(text: string, childName = ''): OutputSentence[] {
  return normalizeUnits(text, { carry: false }).flatMap((u, i) => {
    const title = isTitleLine(u, i === 0, childName);
    return splitSentences(u.text).map((sentence) => ({ sentence, title }));
  });
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

/** Support of every claim sentence of an output (title and heading lines skipped). */
export function supportOf(text: string, story: string): SentenceSupport[] {
  const storyKeys = new Set(contentKeys(story));
  return outputClaims(text, childNameFor(story)).flatMap((s) => (s.title ? [] : (sentenceSupport(s.sentence, storyKeys) ?? [])));
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
