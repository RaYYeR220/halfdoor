import { detectLang, type Lang } from './lang';
import { hasWord, normalizeForMatch } from './normalize';

export const LIMITERS: Record<'en' | 'es', string[]> = {
  en: ['not', 'never', 'no longer', "don't", "doesn't", "can't", 'cannot', "won't", "isn't", "aren't", "wasn't", 'outgrew', 'used to', 'only', 'unless', 'except', 'avoid', 'no'],
  es: ['no', 'nunca', 'ya no', 'jamás', 'solo', 'sólo', 'solamente', 'únicamente', 'excepto', 'menos', 'evitar', 'sin'],
};

export function limiterTokens(text: string, lang: Lang): string[] {
  if (lang === 'other') return [];
  const { norm } = normalizeForMatch(text);
  return LIMITERS[lang].filter((t) => hasWord(norm, t));
}

/** A limiter in the source (not/never/only...) must survive into the paraphrase. */
export function polarityConsistent(sourceText: string, paraphrase: string, lang: Lang): boolean {
  if (limiterTokens(sourceText, lang).length === 0) return true;
  const detected = detectLang(paraphrase);
  return limiterTokens(paraphrase, detected === 'other' ? lang : detected).length > 0;
}
