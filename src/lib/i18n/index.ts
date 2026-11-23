// Shared by server and client code: dictionaries, t(), and the language rules. No React, no next/headers.
import { en, type MessageKey } from './en';
import { es } from './es';

export type { MessageKey };
export type Lang = 'en' | 'es';
export type Vars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: Vars) => string;

export const LANGS: readonly Lang[] = ['en', 'es'];
export const DICTIONARIES: Record<Lang, Readonly<Record<MessageKey, string>>> = { en, es };

/** Readable by the client (the switch sets it); holds only 'en' or 'es'. */
export const LANG_COOKIE = 'hd_lang';

/** Route segments under /c/[slug]/ that speak the family's language. The director desk stays English. */
export const LOCALIZED_SURFACES = ['parent', 'buddy', 'room'] as const;

export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'es';

/** Strict outside production: a missing key or variable is a bug and should fail loudly (tests, dev). */
const strict = () => process.env.NODE_ENV !== 'production';

export function t(lang: Lang, key: MessageKey, vars?: Vars): string {
  let s: string | undefined = DICTIONARIES[lang]?.[key];
  if (s === undefined) {
    if (strict()) throw new Error(`i18n: missing "${key}" for ${lang}`);
    s = en[key] ?? key;
  }
  return s.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = vars?.[name];
    if (v === undefined) {
      if (strict()) throw new Error(`i18n: "${key}" needs {${name}}`);
      return whole;
    }
    return String(v);
  });
}

export const translator = (lang: Lang): Translate => (key, vars) => t(lang, key, vars);

/** The viewer's choice (cookie) wins; otherwise the person's own language; otherwise English. */
export function resolveLang(cookieValue: string | null | undefined, personLang?: string | null): Lang {
  if (isLang(cookieValue)) return cookieValue;
  return personLang === 'es' ? 'es' : 'en';
}

/** Whether the page at this path offers EN/ES (e.g. /c/fernbrook-x/parent/123). */
export function isLocalizedPath(pathname: string): boolean {
  const segment = pathname.split('/')[3] ?? '';
  return (LOCALIZED_SURFACES as readonly string[]).includes(segment);
}

/** The language a page at this path actually renders in. */
export const langForPath = (pathname: string, preferred: Lang): Lang => (isLocalizedPath(pathname) ? preferred : 'en');
