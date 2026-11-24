'use client';
// The frame around every /c/[slug] page: top bar (wordmark, church, language, "viewing as"), the page, and in a
// sandbox the "Try a Sunday" guide. Client side because its words follow the route's language; the page itself
// stays a server component passed in as children.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Lang } from '@/lib/i18n';
import { LangProvider, useT } from '@/lib/i18n/client';
import type { Persona } from '@/lib/demo/personas';
import { Hairline } from '@/components/ui/Hairline';
import { ToastProvider } from '@/components/ui/Toast';
import { ChurchBadge } from './ChurchBadge';
import { DemoGuide } from './DemoGuide';
import { LangSwitch } from './LangSwitch';
import { RoleBar, type ViewerBadge } from './RoleBar';

export type ShellGuide = { slug: string; samId: string | null };

type Props = {
  churchName: string;
  sandbox: boolean;
  /** The viewer's preferred language; parent, buddy and room pages use it, the desk stays English. */
  lang: Lang;
  personas: Persona[];
  /** The hd_as cookie value (which persona is active). */
  current: string | null;
  viewer?: ViewerBadge | null;
  /** Present only for a sandbox the browser owns. */
  guide?: ShellGuide | null;
  children: ReactNode;
};

export function AppShell({ lang, ...rest }: Props) {
  return (
    <LangProvider preferred={lang}>
      <ToastProvider>
        <Frame {...rest} />
      </ToastProvider>
    </LangProvider>
  );
}

function Frame({ churchName, sandbox, personas, current, viewer, guide, children }: Omit<Props, 'lang'>) {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#content"
        className="sr-only z-50 rounded-pill print:hidden bg-ink px-4 py-2.5 text-15 font-medium text-surface focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('shell.skip')}
      </a>
      <TopBar>
        <Wordmark label={t('shell.home')} />
        <span className="hidden md:flex">
          <Hairline vertical />
        </span>
        <ChurchBadge name={churchName} sandbox={sandbox} className="order-last w-full md:order-none md:w-auto md:flex-1" />
        <div className="ml-auto flex items-center gap-2 md:ml-0 md:gap-3">
          <LangSwitch />
          <RoleBar personas={personas} current={current} viewer={viewer} />
        </div>
      </TopBar>

      <div className="flex flex-1 items-stretch">
        <main id="content" tabIndex={-1} className="min-w-0 flex-1 px-4 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] outline-none md:px-8 md:pt-8 lg:pb-16 print:p-0">
          {children}
        </main>
        {guide && <DemoGuide slug={guide.slug} personas={personas} current={current} samId={guide.samId} />}
      </div>
    </div>
  );
}

function TopBar({ children }: { children: ReactNode }) {
  return (
    <header className="relative z-40 border-b border-hairline bg-ground print:hidden md:sticky md:top-0 md:h-[var(--shell-h)] md:bg-ground/90 md:backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 pt-2.5 pb-3 md:h-full md:flex-nowrap md:gap-x-5 md:px-6 md:py-0">
        {children}
      </div>
    </header>
  );
}

function Wordmark({ label }: { label: string }) {
  return (
    <Link href="/" aria-label={label} className="-ml-1 inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-pill px-1 text-20 font-medium tracking-[-0.03em] text-ink">
      <svg viewBox="0 0 16 16" width={16} height={16} fill="none" aria-hidden>
        <path d="M.625 8V.625h14.75V8" stroke="currentColor" strokeWidth="1.25" />
        <rect x=".625" y="8" width="14.75" height="7.375" fill="currentColor" stroke="currentColor" strokeWidth="1.25" />
      </svg>
      Halfdoor
    </Link>
  );
}

/** The streaming placeholder: the same bar, no data yet, so nothing jumps when the shell arrives. */
export function AppShellFallback() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy>
      <TopBar>
        <Wordmark label="Halfdoor" />
      </TopBar>
    </div>
  );
}
