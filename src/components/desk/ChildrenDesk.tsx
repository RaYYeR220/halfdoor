'use client';
// Children: every child and where their card is, as quiet rows. Filter by status; open a row for the card drawer.
// The open child is mirrored in the URL (?child=<id>), so the demo guide can link straight to a card and a reload
// keeps it open. The server hands the first value in; the page never reads search params on the client.
import { useState } from 'react';
import { cx } from '@/lib/cx';
import { CHILD_FILTERS, filterCounts, filterOf, sortChildren, type ChildFilter } from '@/lib/desk/helpers';
import type { CardStatus, ChildRow, DeskClock } from '@/lib/desk/types';
import type { MessageKey } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { dayLabel } from '@/lib/parent/format';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { CardDrawer } from './CardDrawer';
import { CardStatusPill } from './CardStatusPill';
import { DeskHead, useDeskTime } from './DeskFrame';

const FILTER_LABEL: Record<ChildFilter, MessageKey> = {
  all: 'desk.children.filter.all',
  review: 'desk.children.filter.review',
  returned: 'desk.children.filter.returned',
  reviewed: 'desk.children.filter.reviewed',
  none: 'desk.children.filter.none',
};

const rowDomId = (id: string) => `child-row-${id}`;

export function ChildrenDesk({ rows: initial, clock, initialChild }: { rows: ChildRow[]; clock: DeskClock; initialChild: string | null }) {
  const t = useT();
  const ctx = useDeskTime(clock);
  const [openId, setOpenId] = useState(initialChild);
  const [rows, setRows] = useState(initial);
  // A new server render (a refresh, a guide link to another card) replaces the local copy.
  const [seen, setSeen] = useState({ initial, initialChild });
  if (seen.initial !== initial || seen.initialChild !== initialChild) {
    setSeen({ initial, initialChild });
    setRows(initial);
    if (seen.initialChild !== initialChild) setOpenId(initialChild);
  }
  const [filter, setFilter] = useState<ChildFilter>('all');

  const counts = filterCounts(rows);
  const shown = rows.filter((r) => filter === 'all' || filterOf(r.status) === filter);
  const openChild = rows.find((r) => r.id === openId) ?? null;

  const setUrlChild = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('child', id);
    else url.searchParams.delete('child');
    url.searchParams.delete('view');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  };

  const openRow = (id: string) => {
    setOpenId(id);
    setUrlChild(id);
  };

  const close = () => {
    const id = openId;
    setOpenId(null);
    // Only this card's own URL is cleaned up: a close that lands after navigating away leaves the new URL alone.
    if (id && new URL(window.location.href).searchParams.get('child') === id) setUrlChild(null);
    if (id) requestAnimationFrame(() => document.getElementById(rowDomId(id))?.focus());
  };

  const changed = (childId: string, status: CardStatus) => {
    setRows((rs) => sortChildren(rs.map((r) => (r.id === childId ? { ...r, status, updatedAt: new Date().toISOString() } : r))));
    // Then the server's own view of the list (one read, no card content).
    fetch('/api/children', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<{ children: ChildRow[] }>) : null))
      .then((body) => body && setRows(body.children))
      .catch(() => undefined);
  };

  return (
    <div>
      <DeskHead title={t('desk.children.title')} lede={t('desk.children.lede')} />

      <div role="group" aria-label={t('desk.children.filterLabel')} className="mt-7 flex flex-wrap gap-2">
        {CHILD_FILTERS.filter((f) => f === 'all' || counts[f] > 0 || f === 'review').map((f) => (
          <Chip key={f} pressed={filter === f} onClick={() => setFilter(f)}>
            {t(FILTER_LABEL[f])}
            <span className={cx('tabular', filter === f ? 'text-accent-ink' : 'text-ink-muted')}>{counts[f]}</span>
          </Chip>
        ))}
      </div>

      <div className="mt-5 rounded-sharp border border-hairline-strong bg-surface">
        <div
          aria-hidden
          className="hidden grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_11rem_6.5rem_14px] gap-x-6 border-b border-hairline px-5 py-2.5 text-13 text-ink-muted md:grid"
        >
          <span>{t('desk.children.col.child')}</span>
          <span>{t('desk.children.col.support')}</span>
          <span>{t('desk.children.col.card')}</span>
          <span>{t('desk.children.col.updated')}</span>
          <span />
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-8 text-15 text-ink-muted">{t('desk.children.emptyFilter')}</p>
        ) : (
          <ul>
            {shown.map((r) => {
              const sub = [r.grade, r.parents.length ? t('desk.children.parentOf', { names: r.parents.join(', ') }) : null].filter(Boolean).join(' · ');
              const attention = r.status === 'parent_approved';
              return (
                <li key={r.id} className="border-b border-hairline last:border-b-0">
                  <button
                    id={rowDomId(r.id)}
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => openRow(r.id)}
                    className={cx(
                      'group relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-5 py-4 text-left outline-offset-[-2px]',
                      'transition-[background-color] duration-200 ease-out hover:bg-ground/70',
                      'md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_11rem_6.5rem_14px]',
                      attention && "before:absolute before:top-3 before:bottom-3 before:left-0 before:w-[2px] before:rounded-pill before:bg-accent before:content-['']",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-17 leading-6 font-medium text-ink">{r.firstName}</span>
                      {sub && <span className="block truncate text-13 text-ink-muted">{sub}</span>}
                    </span>
                    <span className="col-start-1 row-start-2 text-15 text-ink-2 md:col-start-auto md:row-start-auto">
                      <span className="sr-only">{t('desk.children.col.support')}: </span>
                      {r.supportLevel ? t(`desk.support.${r.supportLevel}`) : <span className="text-ink-muted">{r.status === 'none' ? '—' : t('desk.support.unset')}</span>}
                    </span>
                    <span className="col-start-2 row-span-2 row-start-1 justify-self-end md:col-start-auto md:row-span-1 md:row-start-auto md:justify-self-start">
                      <span className="sr-only">{t('desk.children.col.card')}: </span>
                      <CardStatusPill status={r.status} />
                    </span>
                    <span className="hidden text-13 text-ink-muted tabular md:block">
                      <span className="sr-only">{t('desk.children.col.updated')}: </span>
                      {r.updatedAt ? dayLabel(new Date(r.updatedAt), ctx) : '—'}
                    </span>
                    <Icon
                      name="chevronRight"
                      className="hidden text-ink-muted transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-ink md:block"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-4 max-w-[64ch] text-13 text-ink-muted text-pretty">{t('desk.children.footnote')}</p>

      <CardDrawer
        child={openChild}
        clock={clock}
        onClose={close}
        onChanged={changed}
      />
    </div>
  );
}
