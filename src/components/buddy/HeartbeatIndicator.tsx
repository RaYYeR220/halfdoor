'use client';
// "Live · checked 3 s ago": proof that the page is actually listening for check-ins. The dot rings once each time a
// check lands; the age counts up between checks. Not a live region: it changes every second.
import { useEffect, useState } from 'react';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n/client';
import type { BeatStatus } from './useHeartbeat';

type Props = { status: BeatStatus; lastAt: number | null; count: number; className?: string };

export function HeartbeatIndicator({ status, lastAt, count, className }: Props) {
  const t = useT();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, []);

  const age = lastAt !== null && now !== null ? Math.max(0, Math.round((now - lastAt) / 1000)) : null;
  const ago = age === null ? null : age < 2 ? t('live.checkedNow') : age < 60 ? t('live.checkedAgo', { s: age }) : t('live.checkedMin', { m: Math.floor(age / 60) });
  const live = status === 'live';

  let head: string;
  let tail: string | null = null;
  if (status === 'live') {
    head = t('live.live');
    tail = ago;
  } else if (status === 'retrying') {
    head = t('live.retrying');
    tail = ago;
  } else if (status === 'paused') {
    head = t('live.paused');
  } else {
    head = t('live.connecting');
  }

  return (
    <p className={cx('inline-flex min-h-6 items-center gap-2 text-13 text-ink-muted tabular', className)}>
      <span aria-hidden className="relative inline-flex size-2 shrink-0">
        {live && <span key={count} className="absolute inset-0 animate-beat rounded-pill bg-ok-ink" />}
        <span className={cx('relative inline-flex size-2 rounded-pill', live ? 'bg-ok-ink' : status === 'retrying' ? 'bg-rose' : 'border border-ink-muted')} />
      </span>
      <span>
        <span className={cx('font-medium', live ? 'text-ok-ink' : status === 'retrying' ? 'text-rose' : 'text-ink-muted')}>{head}</span>
        {tail && <span> · {tail}</span>}
      </span>
    </p>
  );
}
