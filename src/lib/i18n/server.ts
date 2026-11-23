// SERVER-ONLY. The language a page renders in, from the switch cookie and the viewer's own language.
import { cookies } from 'next/headers';
import { LANG_COOKIE, resolveLang, translator, type Lang, type Translate } from './index';

/** For parent, buddy and room pages. The director desk is English: call t('en', …) there. */
export async function getLang(personLang?: string | null): Promise<Lang> {
  return resolveLang((await cookies()).get(LANG_COOKIE)?.value, personLang);
}

export async function getT(personLang?: string | null): Promise<{ lang: Lang; t: Translate }> {
  const lang = await getLang(personLang);
  return { lang, t: translator(lang) };
}
