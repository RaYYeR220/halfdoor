import { describe, expect, test } from 'vitest';
import { locateQuote } from '@/lib/text/locate';
import { normalizeForMatch } from '@/lib/text/normalize';
import { sentenceContaining, sentences } from '@/lib/text/sentences';
import { detectLang } from '@/lib/text/lang';
import { limiterTokens, polarityConsistent } from '@/lib/text/polarity';
import { unsaidLabels } from '@/lib/text/labels';

describe('text primitives', () => {
  test('locates quotes across smart punctuation and line breaks', () => {
    const src = 'He “really” hates loud music —\nit hurts his ears.';
    expect(locateQuote(src, 'he "really" hates loud music - it hurts his ears')).toEqual({ start: 0, end: src.length - 1 });
  });
  test('returns null for a quote that is not in the text', () => {
    expect(locateQuote('He loves trains.', 'He loves buses')).toBeNull();
  });
  test('sentences keep Mr. and Dr. intact', () => {
    expect(sentences('Ask Dr. Lee. Then Mr. Ray.').length).toBe(2);
  });
  test('detects Spanish', () => expect(detectLang('A mi hijo le encantan los trenes y la música suave')).toBe('es'));
  test('English limiter must survive paraphrase', () => {
    expect(polarityConsistent('His dad is NOT allowed to pick him up', 'Dad may pick him up', 'en')).toBe(false);
    expect(polarityConsistent('His dad is NOT allowed to pick him up', 'Dad is not allowed to pick him up', 'en')).toBe(true);
  });
  test('outgrew counts as limiter', () => expect(limiterTokens('He outgrew his egg allergy', 'en')).toContain('outgrew'));
  test('flags labels the parent never used', () => {
    expect(unsaidLabels('Leo is autistic and loves trains', 'Leo loves trains')).toEqual(['autistic']);
    expect(unsaidLabels('Leo has autism', 'My son has autism')).toEqual([]);
  });
});

describe('text edge cases', () => {
  test('normalize maps back to original indices and strips zero-width', () => {
    const { norm, map } = normalizeForMatch('A\u200B  “B”');
    expect(norm).toBe('a "b"');
    expect(map).toHaveLength(norm.length);
    expect(map[0]).toBe(0);
  });
  test('locate tolerates dropped punctuation', () => {
    const src = 'Please, call mom first; then dad.';
    expect(locateQuote(src, 'call mom first then dad')).toEqual({ start: 8, end: src.length - 1 });
  });
  test('locate on empty quote is null', () => expect(locateQuote('abc', '')).toBeNull());
  test('sentences split on newline and ?!', () => {
    expect(sentences('Is he ok? Yes!\nGood e.g. fine.').length).toBe(4 - 1);
  });
  test('sentenceContaining merges across sentences', () => {
    const src = 'One two. Three four. Five.';
    expect(sentenceContaining(src, { start: 4, end: 14 })).toEqual({ start: 0, end: 20 });
  });
  test('Spanish limiters with accents and multi-word', () => {
    expect(limiterTokens('Ya no come maní, sólo pan', 'es')).toEqual(expect.arrayContaining(['ya no', 'sólo']));
    expect(limiterTokens('Cinco niños', 'es')).toEqual([]);
    expect(limiterTokens('He no longer naps', 'en')).toContain('no longer');
    expect(limiterTokens('not', 'other')).toEqual([]);
  });
  test('smart apostrophe limiter', () => expect(limiterTokens('He doesn’t like it', 'en')).toContain("doesn't"));
  test('polarity: no source limiter is always consistent', () => {
    expect(polarityConsistent('He likes trains', 'Likes trains', 'en')).toBe(true);
  });
  test('polarity uses the paraphrase language', () => {
    expect(polarityConsistent('Ella no puede comer nueces', 'She cannot eat nuts at all', 'es')).toBe(true);
  });
});
