'use client';
// EN / ES for the family-facing pages (parent, buddy, room). Hidden on the director desk, which is English.
import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { cx } from '@/lib/cx';
import { isLocalizedPath, type Lang } from '@/lib/i18n';
import { useLang, useT } from '@/lib/i18n/client';

const OPTIONS: { lang: Lang; short: string; name: string }[] = [
  { lang: 'en', short: 'EN', name: 'English' },
  { lang: 'es', short: 'ES', name: 'Español' },
];

export function LangSwitch() {
  const t = useT();
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { lang, setPreferred } = useLang();
  const [, startTransition] = useTransition();
  if (!isLocalizedPath(pathname)) return null;

  const choose = (next: Lang) => {
    if (next === lang) return;
    setPreferred(next);
    // Server-rendered page text follows the cookie the provider just set.
    startTransition(() => router.refresh());
  };

  return (
    <div role="group" aria-label={t('lang.label')} className="flex h-11 items-center rounded-pill border border-hairline-strong bg-surface p-[3px]">
      {OPTIONS.map((o) => (
        <button
          key={o.lang}
          type="button"
          lang={o.lang}
          aria-label={o.name}
          aria-pressed={lang === o.lang}
          onClick={() => choose(o.lang)}
          className={cx(
            // 36px to the eye inside the 44px track; the hit area is the full 44px.
            "relative h-9 min-w-11 rounded-pill px-3 text-13 font-medium transition-[background-color,color] duration-200 ease-out after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
            lang === o.lang ? 'bg-ink text-surface' : 'text-ink-muted hover:text-ink',
          )}
        >
          {o.short}
        </button>
      ))}
    </div>
  );
}
