'use client';
// Who opened the card and when, in plain sentences. Read again from /api/access-log when the parent comes back
// to the tab (or asks), so a session that just ended shows its closing time.
import { useCallback, useEffect, useId, useState } from 'react';
import { cx } from '@/lib/cx';
import type { Lang } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { accessLine, visibleAccessRows } from '@/lib/parent/accessLog';
import type { AccessRow } from '@/lib/parent/types';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';

const FIRST = 6;

type Props = {
  /** Present when the log can be refreshed in place. */
  childId?: string;
  childName: string;
  rows: AccessRow[];
  tz: string;
  now: string;
  /** Demo clock offset (lib/demo/clock). */
  shiftMs: number;
  lang: Lang;
};

export function AccessLog({ childId, childName, rows: initial, tz, now, shiftMs, lang }: Props) {
  const t = useT();
  const id = useId();
  // Server rows win whenever the page re-renders with new ones; a refresh replaces them until then.
  const [state, setState] = useState({ from: initial, rows: initial, at: now });
  if (state.from !== initial) setState({ from: initial, rows: initial, at: now });
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!childId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/access-log?child=${encodeURIComponent(childId)}`, { cache: 'no-store' });
      if (res.ok) {
        const j = (await res.json()) as { rows: AccessRow[] };
        setState((s) => ({ ...s, rows: j.rows, at: new Date().toISOString() }));
      }
    } catch {
      // offline: keep what is shown
    } finally {
      setBusy(false);
    }
  }, [childId]);

  useEffect(() => {
    if (!childId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [childId, refresh]);

  const visible = visibleAccessRows(state.rows);
  const ctx = { lang, tz, now: new Date(state.at), t, childName, shiftMs };
  const lines = visible.map((r) => ({ row: r, line: accessLine(r, ctx) }));
  const shown = all ? lines : lines.slice(0, FIRST);

  return (
    <section aria-labelledby={`${id}-title`}>
      <div className="flex items-center justify-between gap-x-4">
        <h2 id={`${id}-title`} className="text-20 font-medium tracking-[-0.02em] text-ink">
          {t('parent.log.title')}
        </h2>
        {childId && (
          <Button size="sm" variant="quiet" onClick={refresh} pending={busy} icon={<Icon name="reset" />} className="-mr-3">
            {t('parent.log.refresh')}
          </Button>
        )}
      </div>
      <p className="mt-1 text-15 text-ink-muted text-pretty">{t('parent.log.lede')}</p>

      {lines.length === 0 ? (
        <p className="mt-4 rounded-sharp border border-dashed border-hairline-strong px-4 py-4 text-15 text-ink-muted">
          {t('parent.log.empty', { name: childName })}
        </p>
      ) : (
        <ol className="mt-4 border-t border-hairline">
          {shown.map(({ row, line }) => (
            <li key={row.id} className="flex gap-3.5 border-b border-hairline py-3.5">
              <span
                aria-hidden
                className={cx(
                  'mt-[9px] size-2 shrink-0 rounded-pill',
                  line.openNow ? 'bg-accent' : row.reason === 'deleted' ? 'bg-danger-ink' : row.reason === 'checked_in' || row.reason === 'room_safety' ? 'bg-ink' : 'border border-ink-muted',
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="sr-only">{line.sentence}</p>
                <div aria-hidden className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <p className="text-17 leading-6 text-ink">{line.action}</p>
                  {line.openNow && (
                    <Pill tone="accent" size="sm" dot>
                      {t('parent.log.openNow')}
                    </Pill>
                  )}
                </div>
                <p aria-hidden className="mt-0.5 text-15 text-ink-muted tabular text-pretty">
                  {line.when}
                  {line.context && <span> · {line.context}</span>}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {lines.length > FIRST && (
        <Button size="sm" variant="quiet" onClick={() => setAll((v) => !v)} aria-expanded={all} className="mt-2 -ml-3">
          {all ? t('parent.log.showLess') : t('parent.log.showAll', { count: lines.length })}
          <Icon name={all ? 'chevronUp' : 'chevronDown'} />
        </Button>
      )}
    </section>
  );
}
