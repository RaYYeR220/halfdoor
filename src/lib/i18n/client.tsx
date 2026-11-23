'use client';
// useT() for client components. The provider takes the viewer's preferred language from the server and
// narrows it per route: parent, buddy and room pages follow it, everything else is English.
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { LANG_COOKIE, langForPath, translator, type Lang, type Translate } from './index';

type LangState = { lang: Lang; preferred: Lang; setPreferred: (lang: Lang) => void; t: Translate };

const LangContext = createContext<LangState | null>(null);

const ONE_YEAR = 365 * 24 * 3600;

export function LangProvider({ preferred: initial, children }: { preferred: Lang; children: ReactNode }) {
  const pathname = usePathname();
  const [preferred, setState] = useState(initial);
  // A new server value (another persona, a refresh) replaces local state; adjusting during render, not in an effect.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setState(initial);
  }
  const setPreferred = useCallback((lang: Lang) => {
    setState(lang);
    try {
      document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    } catch {
      // cookies blocked: the choice still holds for this page
    }
  }, []);
  const lang = langForPath(pathname ?? '', preferred);
  const value = useMemo(() => ({ lang, preferred, setPreferred, t: translator(lang) }), [lang, preferred, setPreferred]);
  return (
    <LangContext value={value}>
      <div lang={lang} className="contents">
        {children}
      </div>
    </LangContext>
  );
}

function useLangState(): LangState {
  const v = use(LangContext);
  return v ?? { lang: 'en', preferred: 'en', setPreferred: () => {}, t: translator('en') };
}

/** t() in the page's language (falls back to English outside a provider). */
export const useT = (): Translate => useLangState().t;
export const useLang = () => useLangState();

/** Forget the switch choice so the next persona starts in their own language. */
export function clearLangChoice() {
  try {
    document.cookie = `${LANG_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } catch {
    // nothing to clear
  }
}
