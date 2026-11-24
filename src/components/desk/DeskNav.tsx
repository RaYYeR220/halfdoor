'use client';
// The desk's own navigation: a quiet column on wide screens, a scrolling row of tabs on narrow ones.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/lib/cx';
import type { MessageKey } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';

export const DESK_VIEWS = [
  { seg: '', key: 'desk.nav.children' },
  { seg: 'sunday', key: 'desk.nav.sunday' },
  { seg: 'pack', key: 'desk.nav.pack' },
  { seg: 'notes', key: 'desk.nav.notes' },
  { seg: 'patterns', key: 'desk.nav.patterns' },
  { seg: 'ledger', key: 'desk.nav.ledger' },
] as const satisfies readonly { seg: string; key: MessageKey }[];

/** /c/<slug>/desk from any path under it. */
export function deskBase(pathname: string): string {
  const i = pathname.indexOf('/desk');
  return i >= 0 ? pathname.slice(0, i + '/desk'.length) : pathname;
}

export function DeskNav() {
  const t = useT();
  const pathname = usePathname() ?? '';
  const base = deskBase(pathname);
  const current = pathname.slice(base.length).split('/')[1] ?? '';

  return (
    <nav aria-label={t('desk.nav.label')} className="print:hidden lg:sticky lg:top-[calc(var(--shell-h)+32px)] lg:self-start">
      <p className="hidden pb-3 pl-3 text-13 text-ink-muted lg:block">{t('desk.nav.title')}</p>
      <ul className="-mx-4 flex gap-1 overflow-x-auto border-b border-hairline px-4 pb-px [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-b-0 lg:px-0 lg:pb-0">
        {DESK_VIEWS.map((v) => {
          const active = v.seg === current;
          return (
            <li key={v.seg} className="shrink-0">
              <Link
                href={v.seg ? `${base}/${v.seg}` : base}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'relative flex min-h-11 items-center whitespace-nowrap px-3 text-15 transition-[background-color,color] duration-200 ease-out',
                  // narrow: underline tabs; wide: a column with a 2px ink rule on the current view
                  "after:absolute after:inset-x-3 after:-bottom-px after:h-[2px] after:rounded-pill after:content-[''] lg:after:hidden",
                  'lg:rounded-sharp lg:before:absolute lg:before:top-2.5 lg:before:bottom-2.5 lg:before:left-0 lg:before:w-[2px] lg:before:rounded-pill lg:before:content-[\'\']',
                  active
                    ? 'font-medium text-ink after:bg-ink lg:bg-surface lg:before:bg-ink'
                    : 'text-ink-muted hover:text-ink lg:hover:bg-ground-edge',
                )}
              >
                {t(v.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
