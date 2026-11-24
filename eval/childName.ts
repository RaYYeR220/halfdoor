// The child's first name in a parent's story (the eval has no form field for it).

const NOT_NAMES = new Set(
  'i im she he it this that is son daughter hijo hija about age edad our my mi su hi hello hola sorry the a an and or y o just turned years old yo años and'.split(' '),
);
const AGE_AFTER = /^\s*(?:[,(–—:-]\s*)*(?:(?:she|he|él|ella)\s+)?(?:(?:is|tiene|just turned|age|edad|-)\s*)*\(?\d{1,2}(?![\d:])/iu;

/** The child's first name: the first word followed by an age ("Leo is 6", "Maya (9)", "noah 5yo", "Mateo tiene 5"). '' if none. */
export function childNameFor(text: string): string {
  for (const m of text.matchAll(/(?<![\p{L}\p{N}'’])\p{L}+(?![\p{L}'’])/gu)) {
    const w = m[0];
    if (NOT_NAMES.has(w.toLowerCase()) || w.length < 2) continue;
    if (AGE_AFTER.test(text.slice(m.index! + w.length))) return w[0].toUpperCase() + w.slice(1);
  }
  return '';
}
