'use client';
// The demo church's front desk. It stands in for Planning Center Check-Ins and says so: check a child in (a real
// check-in row with a 4-character pickup code) or out. The buddy's phone and the room view pick it up on their next
// heartbeat. Any persona may play the desk; only sandbox churches have one.
import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChildName, LiveService, StationRow } from '@/lib/buddy/types';
import { cx } from '@/lib/cx';
import type { DeskClock } from '@/lib/desk/types';
import { useLang, useT } from '@/lib/i18n/client';
import { timeLabel } from '@/lib/parent/format';
import { ServiceTabs, panelId, tabId } from '@/components/desk/ServiceTabs';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

type Props = {
  services: LiveService[];
  roster: ChildName[];
  clock: DeskClock;
  rows: Record<string, StationRow[]>;
  initialService: string | null;
  /** A child to pick out (the demo guide's "Check Sam in"). */
  highlight: string | null;
};

export function StationDesk({ services, roster, clock, rows, initialService, highlight }: Props) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const router = useRouter();
  const uid = useId();
  const [selected, setSelected] = useState(initialService ?? services[0]?.id ?? '');
  // The server's rows, plus what this desk did since. A refresh brings new server rows and replaces both.
  const [local, setLocal] = useState(rows);
  const [seen, setSeen] = useState(rows);
  if (seen !== rows) {
    setSeen(rows);
    setLocal(rows);
  }
  const [busy, setBusy] = useState<string | null>(null);

  // Another desk (or tab) may have changed things: look again when this one comes back into view.
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [router]);

  const service = services.find((s) => s.id === selected) ?? null;
  const fmt = (iso: string) => timeLabel(new Date(iso), null, { lang, tz: clock.tz, shiftMs: clock.shiftMs });
  const when = (s: LiveService) => timeLabel(new Date(s.startsAt), new Date(s.endsAt), { lang, tz: clock.tz, shiftMs: clock.shiftMs });
  const rowOf = (sid: string, childId: string) => local[sid]?.find((r) => r.childId === childId) ?? null;
  const inCount = (sid: string) => (local[sid] ?? []).filter((r) => r.in).length;

  const act = async (child: ChildName, action: 'in' | 'out') => {
    if (!service || busy) return;
    setBusy(child.id);
    const res = await fetch('/api/station', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ serviceId: service.id, childId: child.id, action }),
    }).catch(() => null);
    setBusy(null);
    if (res?.status === 409) {
      toast(t('station.conflict'));
      router.refresh();
      return;
    }
    const body = res?.ok ? ((await res.json().catch(() => null)) as { securityCode: string | null; in: boolean } | null) : null;
    if (!body) {
      toast(t('station.failed'));
      return;
    }
    const at = new Date().toISOString();
    const prev = rowOf(service.id, child.id);
    const next: StationRow = body.in
      ? { childId: child.id, in: true, securityCode: body.securityCode, checkedInAt: at, checkedOutAt: null }
      : { childId: child.id, in: false, securityCode: body.securityCode, checkedInAt: prev?.checkedInAt ?? at, checkedOutAt: at };
    setLocal((cur) => ({ ...cur, [service.id]: [...(cur[service.id] ?? []).filter((r) => r.childId !== child.id), next] }));
    toast(body.in ? t('station.didIn', { name: child.firstName, code: body.securityCode ?? '' }) : t('station.didOut', { name: child.firstName }), { tone: 'ok' });
    // Pick up the server's own times quietly.
    router.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-[960px]">
      <header className="max-w-[64ch]">
        <p className="text-15 text-ink-muted">{t('station.title')}</p>
        <h1 className="mt-1 text-32 font-medium text-balance text-ink">{t('station.label')}</h1>
        <p className="mt-3 border-l-2 border-accent pl-3.5 text-17 text-ink-2 text-pretty">{t('station.labelBody')}</p>
        <p className="mt-3 text-15 text-ink-muted text-pretty">{t('station.lede')}</p>
      </header>

      {services.length === 0 || !service ? (
        <p className="mt-8 text-17 text-ink-muted">{t('station.noServices')}</p>
      ) : (
        <>
          <div className="mt-7">
            <ServiceTabs
              services={services}
              selected={service.id}
              onSelect={setSelected}
              idBase={uid}
              label={t('station.services')}
              meta={(s) => [when(s), s.room].filter(Boolean).join(' · ')}
              aside={(s) => <span className="text-13 text-ink-muted tabular">{t('station.count', { in: inCount(s.id), total: roster.length })}</span>}
            />
          </div>
          <div id={panelId(uid, service.id)} role="tabpanel" aria-labelledby={tabId(uid, service.id)} className="mt-5">
            <ul className="rounded-sharp border border-hairline-strong bg-surface">
              {roster.map((child) => {
                const r = rowOf(service.id, child.id);
                const isIn = !!r?.in;
                const picked = highlight === child.id;
                return (
                  <li
                    key={child.id}
                    className={cx(
                      'relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2.5 border-t border-hairline px-4 py-3.5 first:border-t-0 sm:px-5',
                      'md:grid-cols-[minmax(8rem,0.9fr)_minmax(0,1.6fr)_auto]',
                      picked && 'bg-accent-tint/35',
                    )}
                  >
                    {picked && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />}
                    <div className="min-w-0">
                      <p className="text-17 leading-6 font-medium text-ink">{child.firstName}</p>
                      {child.grade && <p className="text-13 text-ink-muted">{child.grade}</p>}
                    </div>
                    <div className="col-span-2 row-start-2 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 md:col-span-1 md:row-start-auto">
                      {isIn && r ? (
                        <>
                          <p className="inline-flex items-center gap-2 text-15 font-medium text-ok-ink tabular">
                            <span aria-hidden className="size-[7px] rounded-pill bg-ok-ink" />
                            {t('station.in', { time: fmt(r.checkedInAt) })}
                          </p>
                          {r.securityCode && (
                            <p className="inline-flex items-baseline gap-2">
                              <span className="text-13 text-ink-muted">{t('station.code')}</span>
                              <span className="font-mono text-20 leading-6 font-medium tracking-[0.14em] text-ink">{r.securityCode}</span>
                            </p>
                          )}
                        </>
                      ) : r?.checkedOutAt ? (
                        <p className="inline-flex items-center gap-2 text-15 text-ink-muted tabular">
                          <span aria-hidden className="size-[7px] rounded-pill border border-ink-muted" />
                          {t('station.out', { time: fmt(r.checkedOutAt) })}
                        </p>
                      ) : (
                        <p className="inline-flex items-center gap-2 text-15 text-ink-muted">
                          <span aria-hidden className="size-[7px] rounded-pill border border-ink-muted" />
                          {t('station.notIn')}
                        </p>
                      )}
                    </div>
                    <div className="col-start-2 row-start-1 md:col-start-auto md:row-start-auto">
                      {isIn ? (
                        <Button
                          variant="secondary"
                          pending={busy === child.id}
                          disabled={busy !== null && busy !== child.id}
                          onClick={() => act(child, 'out')}
                          aria-label={t('station.checkOutLabel', { name: child.firstName })}
                          className="min-w-[8.5rem]"
                        >
                          {t('station.checkOut')}
                        </Button>
                      ) : (
                        <Button
                          variant={picked ? 'primary' : 'secondary'}
                          pending={busy === child.id}
                          disabled={busy !== null && busy !== child.id}
                          onClick={() => act(child, 'in')}
                          aria-label={t('station.checkInLabel', { name: child.firstName })}
                          className="min-w-[8.5rem]"
                        >
                          {t('station.checkIn')}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
