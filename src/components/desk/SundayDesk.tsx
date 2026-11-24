'use client';
// This Sunday: per service, suggest buddies (the solver), read why each match was made and where there is a gap,
// approve them one by one or all at once. Cards waiting for review open in the same drawer as on Children.
import { useId, useLayoutEffect, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { reasonChip } from '@/lib/desk/helpers';
import type { AssignmentRow, CardStatus, ChildRow, DeskClock, DeskService, SolveResult } from '@/lib/desk/types';
import { useT } from '@/lib/i18n/client';
import { timeLabel } from '@/lib/parent/format';
import { Banner } from '@/components/ui/Banner';
import { Button, buttonClass } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { useToast } from '@/components/ui/Toast';
import { CardDrawer } from './CardDrawer';
import { DeskHead, useDeskTime } from './DeskFrame';
import { ServiceTabs, panelId, tabId } from './ServiceTabs';

type Props = {
  services: DeskService[];
  clock: DeskClock;
  /** Current matches per service (proposed and approved), from the server. */
  initial: Record<string, AssignmentRow[]>;
  childRows: ChildRow[];
};

type Busy = 'solve' | 'approve' | `approve:${string}` | null;

const byChild = (a: AssignmentRow, b: AssignmentRow) => a.childName.localeCompare(b.childName);

export function SundayDesk({ services, clock, initial, childRows }: Props) {
  const t = useT();
  const toast = useToast();
  const uid = useId();
  const ctx = useDeskTime(clock);
  const [selected, setSelected] = useState(services[0]?.id ?? '');
  const [rows, setRows] = useState(initial);
  const [results, setResults] = useState<Record<string, SolveResult>>({});
  const [include, setInclude] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<Record<string, Busy>>({});
  const [failed, setFailed] = useState<Record<string, 'solve' | 'approve' | null>>({});
  const [announce, setAnnounce] = useState('');
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const childById = new Map(childRows.map((c) => [c.id, c]));

  // The drawer is a transient overlay: leaving the page closes it.
  useLayoutEffect(() => () => setReviewing(null), []);

  const service = services.find((s) => s.id === selected);
  const when = (s: DeskService) => timeLabel(new Date(s.startsAt), new Date(s.endsAt), ctx);

  const solve = async (s: DeskService, extra: string[] = include[s.id] ?? []) => {
    setBusy((b) => ({ ...b, [s.id]: 'solve' }));
    setFailed((f) => ({ ...f, [s.id]: null }));
    const res = await fetch('/api/assignments/solve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ serviceId: s.id, ...(extra.length ? { includeChildIds: extra } : {}) }),
    }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as SolveResult | null) : null;
    setBusy((b) => ({ ...b, [s.id]: null }));
    if (!body) {
      setFailed((f) => ({ ...f, [s.id]: 'solve' }));
      setAnnounce(t('desk.sunday.solveFailed'));
      return;
    }
    setResults((r) => ({ ...r, [s.id]: body }));
    setRows((r) => ({ ...r, [s.id]: [...(r[s.id] ?? []).filter((a) => a.status !== 'proposed'), ...body.assignments].sort(byChild) }));
    setReviewed(new Set());
    setAnnounce(summary(body));
  };

  const approve = async (s: DeskService, ids: string[], key: Busy) => {
    if (ids.length === 0) return;
    setBusy((b) => ({ ...b, [s.id]: key }));
    setFailed((f) => ({ ...f, [s.id]: null }));
    const res = await fetch('/api/assignments/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assignmentIds: ids }),
    }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { approved: string[] } | null) : null;
    setBusy((b) => ({ ...b, [s.id]: null }));
    if (!body) {
      setFailed((f) => ({ ...f, [s.id]: 'approve' }));
      setAnnounce(t('desk.sunday.approveFailed'));
      return;
    }
    const done = new Set(body.approved);
    setRows((r) => ({ ...r, [s.id]: (r[s.id] ?? []).map((a) => (done.has(a.id) ? { ...a, status: 'approved' as const } : a)) }));
    const msg = done.size === 1 ? t('desk.sunday.approvedOne') : t('desk.sunday.approvedMany', { count: done.size });
    setAnnounce(msg);
    toast(msg, { tone: 'ok' });
  };

  const summary = (r: SolveResult) => {
    const parts = [
      r.assignments.length === 0
        ? t('desk.sunday.sum.matchNone')
        : r.assignments.length === 1
          ? t('desk.sunday.sum.matchOne')
          : t('desk.sunday.sum.matchMany', { count: r.assignments.length }),
    ];
    if (r.unassigned.length) parts.push(r.unassigned.length === 1 ? t('desk.sunday.sum.gapOne') : t('desk.sunday.sum.gapMany', { count: r.unassigned.length }));
    if (r.waitingForReview.length) parts.push(r.waitingForReview.length === 1 ? t('desk.sunday.sum.waitOne') : t('desk.sunday.sum.waitMany', { count: r.waitingForReview.length }));
    return parts.join(' · ');
  };

  if (!service) {
    return (
      <div>
        <DeskHead title={t('desk.sunday.title')} lede={t('desk.sunday.lede')} />
        <p className="mt-8 rounded-sharp border border-dashed border-hairline-strong px-5 py-6 text-15 text-ink-muted">{t('desk.noServices')}</p>
      </div>
    );
  }

  const list = rows[service.id] ?? [];
  const result = results[service.id];
  const proposed = list.filter((a) => a.status === 'proposed');
  const state = busy[service.id] ?? null;
  const short = service.label.replace(/\s+service$/i, '');
  const waiting = result?.waitingForReview ?? [];
  const reviewingChild = reviewing ? childById.get(reviewing) : undefined;

  return (
    <div>
      <DeskHead title={t('desk.sunday.title')} lede={t('desk.sunday.lede')} />

      <div className="mt-7">
        <ServiceTabs
          services={services}
          selected={service.id}
          onSelect={setSelected}
          idBase={uid}
          label={t('desk.sunday.services')}
          meta={(s) => [when(s), s.room].filter(Boolean).join(' · ')}
          aside={(s) => {
            const r = rows[s.id] ?? [];
            const approved = r.filter((a) => a.status !== 'proposed').length;
            return r.length ? (
              <span className="text-13 text-ink-muted tabular">{t('desk.sunday.tabCount', { approved, total: r.length })}</span>
            ) : null;
          }}
        />
      </div>

      <section
        id={panelId(uid, service.id)}
        role="tabpanel"
        aria-labelledby={tabId(uid, service.id)}
        tabIndex={-1}
        className="mt-6 outline-none"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant={list.length === 0 && !result ? 'primary' : 'secondary'}
            pending={state === 'solve'}
            disabled={state !== null && state !== 'solve'}
            onClick={() => solve(service)}
            icon={list.length || result ? <Icon name="reset" size={13} /> : undefined}
          >
            {list.length || result ? t('desk.sunday.suggestAgain') : t('desk.sunday.suggest', { service: short })}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {proposed.length > 0 && (
              <Button
                variant="primary"
                pending={state === 'approve'}
                disabled={state !== null && state !== 'approve'}
                onClick={() => approve(service, proposed.map((a) => a.id), 'approve')}
                iconEnd={<Icon name="check" size={13} />}
              >
                {t('desk.sunday.approveAll', { count: proposed.length })}
              </Button>
            )}
            <PcoButton />
          </div>
        </div>

        <p className="mt-3 min-h-[22px] text-15 text-ink-muted">{state === 'solve' ? t('desk.sunday.solving') : result ? summary(result) : null}</p>
        <p aria-live="polite" className="sr-only">
          {state === 'solve' ? t('desk.sunday.solving') : announce}
        </p>

        {failed[service.id] === 'solve' && (
          <Banner tone="accent" icon="alert" role="alert" className="mt-3">
            {t('desk.sunday.solveFailed')}
          </Banner>
        )}
        {failed[service.id] === 'approve' && (
          <Banner tone="accent" icon="alert" role="alert" className="mt-3">
            {t('desk.sunday.approveFailed')}
          </Banner>
        )}

        {list.length === 0 && !result && <HowItWorks service={short} />}

        {result?.newFamily.map((f) => (
          <Banner key={f.childId} tone="accent" icon={null} title={t('desk.sunday.newFamilyTitle', { name: f.name })} className="mt-5">
            {t('desk.sunday.newFamilyBody', { name: f.name })}
          </Banner>
        ))}

        {list.length > 0 && (
          <Group title={t('desk.sunday.matches')} count={list.length}>
            <ul className="rounded-sharp border border-hairline-strong bg-surface">
              {list.map((a) => (
                <MatchRow
                  key={a.id}
                  a={a}
                  child={childById.get(a.childId)}
                  busy={state === `approve:${a.id}`}
                  disabled={state !== null}
                  onApprove={() => approve(service, [a.id], `approve:${a.id}`)}
                />
              ))}
            </ul>
          </Group>
        )}

        {result && result.unassigned.length > 0 && (
          <Group title={t('desk.sunday.gaps')} count={result.unassigned.length} lede={t('desk.sunday.gapsLede')}>
            <ul className="flex flex-col gap-3">
              {result.unassigned.map((u) => (
                <li key={u.childId} className="rounded-sharp border border-accent-line bg-surface px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-17 font-medium text-ink">{u.childName}</p>
                    <SupportNote child={childById.get(u.childId)} />
                  </div>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {u.hints.map((h) => (
                      <li key={h} className="flex items-start gap-2.5 text-15 text-rose text-pretty">
                        <span aria-hidden className="mt-[9px] size-[5px] shrink-0 rounded-pill bg-rose" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Group>
        )}

        {waiting.length > 0 && (
          <Group title={t('desk.sunday.waiting')} count={waiting.length}>
            <ul className="rounded-sharp border border-hairline-strong bg-surface">
              {waiting.map((w) => {
                const done = reviewed.has(w.childId);
                return (
                  <li key={w.childId} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-hairline px-5 py-4 last:border-b-0">
                    <div className="min-w-0">
                      <p className="text-17 font-medium text-ink">{w.name}</p>
                      <p className={cx('text-15', done ? 'text-ok-ink' : 'text-ink-muted')}>
                        {done ? t('desk.sunday.waitingDone', { name: w.name }) : t('desk.sunday.waitingBody', { service: short })}
                      </p>
                    </div>
                    {done ? (
                      <Button size="sm" variant="secondary" disabled={state !== null} onClick={() => solve(service)} icon={<Icon name="reset" size={13} />}>
                        {t('desk.sunday.suggestAgain')}
                      </Button>
                    ) : (
                      <Button
                        id={`${uid}-review-${w.childId}`}
                        size="sm"
                        variant="secondary"
                        onClick={() => setReviewing(w.childId)}
                        iconEnd={<Icon name="arrowRight" size={12} />}
                        aria-haspopup="dialog"
                      >
                        {t('desk.sunday.review', { name: w.name })}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Group>
        )}

        {result && result.notExpected.length > 0 && (
          <Group title={t('desk.sunday.notExpected', { service: short })} count={result.notExpected.length} lede={t('desk.sunday.notExpectedLede')}>
            <ul className="rounded-sharp border border-hairline-strong bg-surface">
              {result.notExpected.map((n) => (
                <li key={n.childId} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-hairline px-5 py-3 last:border-b-0">
                  <p className="text-17 text-ink">{n.name}</p>
                  <Button
                    size="sm"
                    variant="quiet"
                    disabled={state !== null}
                    onClick={() => {
                      const next = [...new Set([...(include[service.id] ?? []), n.childId])];
                      setInclude((x) => ({ ...x, [service.id]: next }));
                      void solve(service, next);
                    }}
                    icon={<span aria-hidden className="text-17 leading-none">+</span>}
                  >
                    {t('desk.sunday.add')}
                  </Button>
                </li>
              ))}
            </ul>
          </Group>
        )}
      </section>

      <CardDrawer
        child={reviewingChild ? { ...reviewingChild } : null}
        clock={clock}
        onClose={() => {
          const id = reviewing;
          setReviewing(null);
          requestAnimationFrame(() => document.getElementById(`${uid}-review-${id}`)?.focus());
        }}
        onChanged={(childId: string, status: CardStatus) => {
          if (status === 'acknowledged') setReviewed((r) => new Set(r).add(childId));
        }}
      />
    </div>
  );
}

function Group({ title, count, lede, children }: { title: string; count: number; lede?: string; children: ReactNode }) {
  return (
    <section className="mt-9">
      <div className="mb-3 flex items-baseline gap-2.5">
        <h2 className="text-20 font-medium tracking-[-0.02em] text-ink">{title}</h2>
        <span className="text-15 text-ink-muted tabular">{count}</span>
      </div>
      {lede && <p className="-mt-1 mb-3 max-w-[64ch] text-15 text-ink-muted text-pretty">{lede}</p>}
      {children}
    </section>
  );
}

function SupportNote({ child }: { child?: ChildRow }) {
  const t = useT();
  if (!child?.supportLevel) return null;
  return <span className="text-13 text-ink-muted">{t(`desk.support.${child.supportLevel}`)}</span>;
}

function MatchRow({
  a, child, busy, disabled, onApprove,
}: { a: AssignmentRow; child?: ChildRow; busy: boolean; disabled: boolean; onApprove: () => void }) {
  const t = useT();
  const approved = a.status !== 'proposed';
  const chips = a.reasons.map(reasonChip);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 border-b border-hairline px-5 py-4 last:border-b-0 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <p className="truncate text-17 leading-6 font-medium text-ink">{a.childName}</p>
          <SupportNote child={child} />
        </div>
        <Icon name="arrowRight" size={14} className="shrink-0 text-ink-muted" label={t('desk.sunday.with')} />
        <div className="min-w-0">
          <p className="truncate text-17 leading-6 font-medium text-ink">{a.buddyName}</p>
          <span className="text-13 text-ink-muted">{t('desk.sunday.buddy')}</span>
        </div>
      </div>
      <ul aria-label={t('desk.sunday.why')} className="col-span-2 row-start-2 flex flex-wrap gap-1.5 md:col-span-1 md:col-start-2 md:row-start-1">
        {chips.length === 0 && <li className="text-13 text-ink-muted">{t('desk.sunday.noReason')}</li>}
        {chips.map((c) => (
          <li key={c.label}>
            <Pill tone={c.tone === 'accent' ? 'accent' : 'neutral'} size="sm" className={c.tone === 'neutral' ? 'bg-surface-2' : undefined}>
              {c.label}
            </Pill>
          </li>
        ))}
      </ul>
      <div className="col-start-2 row-start-1 justify-self-end md:col-start-3">
        {approved ? (
          <Pill tone="ok" icon={<Icon name="check" size={12} />}>
            {a.status === 'scheduled_in_pco' ? t('desk.sunday.scheduled') : t('desk.sunday.approved')}
          </Pill>
        ) : (
          <Button size="sm" variant="secondary" pending={busy} disabled={disabled && !busy} onClick={onApprove} aria-label={t('desk.sunday.approveOne', { child: a.childName, buddy: a.buddyName })}>
            {t('desk.sunday.approve')}
          </Button>
        )}
      </div>
    </li>
  );
}

function HowItWorks({ service }: { service: string }) {
  const t = useT();
  return (
    <div className="mt-5 rounded-sharp border border-dashed border-hairline-strong px-5 py-5">
      <p className="text-17 font-medium text-ink">{t('desk.sunday.emptyTitle', { service })}</p>
      <p className="mt-1 max-w-[64ch] text-15 text-ink-muted text-pretty">{t('desk.sunday.emptyBody')}</p>
    </div>
  );
}

/** Planning Center scheduling arrives with the PCO connection; until then the button says what it needs. */
function PcoButton() {
  const t = useT();
  const tip = useId();
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={tip}
        onClick={(e) => e.preventDefault()}
        className={buttonClass('secondary', 'md', 'cursor-not-allowed')}
      >
        {t('desk.sunday.pco')}
      </button>
      <span
        id={tip}
        role="tooltip"
        className="pointer-events-none absolute top-[calc(100%+8px)] right-0 z-20 rounded-sharp bg-ink px-3 py-1.5 text-13 whitespace-nowrap text-surface opacity-0 transition-opacity duration-200 ease-out group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {t('desk.sunday.pcoTip')}
      </span>
    </span>
  );
}
