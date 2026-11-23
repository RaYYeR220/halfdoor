export type Lang = 'en' | 'es' | 'other';

const EN = new Set(
  'the and is are was were of to in it his her he she they them with for on at that this my your has have had not but be as from by him up may can will do does'.split(' '),
);
const ES = new Set(
  'el la los las un una y es son era de del en que con por para su sus mi me le lo se al muy como pero no tiene tienen hijo hija a'.split(' '),
);

/** Stopword-ratio heuristic between English and Spanish. */
export function detectLang(text: string): Lang {
  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  if (words.length === 0) return 'other';
  let en = 0;
  let es = 0;
  for (const w of words) {
    if (EN.has(w)) en++;
    if (ES.has(w)) es++;
  }
  const best = Math.max(en, es);
  if (en === es || best / words.length < 0.2) return 'other';
  return en > es ? 'en' : 'es';
}
