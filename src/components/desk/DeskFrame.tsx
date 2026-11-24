'use client';
// Small pieces every desk view shares: the page head, the desk clock as format context, the "not yours" panel
// and the streaming placeholder.
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { DeskClock } from '@/lib/desk/types';
import { useT } from '@/lib/i18n/client';
import type { WhenCtx } from '@/lib/parent/format';

/** Format context for lib/parent/format: the church's zone, the server's "now", the demo clock shift. Desk is English. */
export function useDeskTime(clock: DeskClock): WhenCtx {
  const t = useT();
  return useMemo(() => ({ lang: 'en', tz: clock.tz, now: new Date(clock.now), t, shiftMs: clock.shiftMs }), [clock, t]);
}

export function DeskHead({ title, lede, actions, id }: { title: ReactNode; lede?: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 print:hidden">
      <div className="min-w-0 max-w-[62ch]">
        <h1 id={id} tabIndex={-1} className="text-32 font-medium text-balance text-ink outline-none">
          {title}
        </h1>
        {lede && <p className="mt-2 text-17 text-ink-muted text-pretty">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function NotForYou() {
  const t = useT();
  return (
    <div className="max-w-[56ch]">
      <h1 className="text-32 font-medium text-ink">{t('desk.notYours.title')}</h1>
      <p className="mt-3 text-17 text-ink-muted text-pretty">{t('desk.notYours.body')}</p>
    </div>
  );
}

/** Quiet placeholder in the shape of a desk view while its data loads. */
export function DeskFallback() {
  return (
    <div aria-hidden>
      <div className="h-9 w-[min(16rem,70%)] rounded-sharp bg-ground-edge" />
      <div className="mt-4 h-5 w-[min(30rem,92%)] rounded-sharp bg-ground-edge" />
      <div className="mt-9 flex flex-col rounded-sharp border border-hairline bg-surface">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-6 border-b border-hairline px-5 py-5 last:border-b-0">
            <div className="h-4 w-28 rounded-sharp bg-ground-edge" />
            <div className="h-4 w-40 rounded-sharp bg-ground" />
          </div>
        ))}
      </div>
    </div>
  );
}
