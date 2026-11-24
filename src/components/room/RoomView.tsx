'use client';
// The room leader's tablet: who is checked in at this service, each child's pickup code and the safety lines of
// their card, in the parent's exact words. Nothing else of a card ever reaches this page. Children appear with the
// heartbeat after check-in and leave the list (and this page's memory) at checkout.
import { useId, useRef, useState } from 'react';
import { pickService } from '@/lib/buddy/live';
import type { ChildName, LiveService } from '@/lib/buddy/types';
import type { CardItem } from '@/lib/card/schema';
import type { Heartbeat } from '@/lib/checkins/types';
import type { DeskClock } from '@/lib/desk/types';
import { useLang, useT } from '@/lib/i18n/client';
import { timeLabel } from '@/lib/parent/format';
import { HeartbeatIndicator } from '@/components/buddy/HeartbeatIndicator';
import { SafetyBanner } from '@/components/buddy/SafetyBanner';
import { usableTranslation } from '@/components/buddy/UnlockedCard';
import { useHeartbeat } from '@/components/buddy/useHeartbeat';
import { ServiceTabs, panelId, tabId } from '@/components/desk/ServiceTabs';
import { Banner } from '@/components/ui/Banner';
import { Icon } from '@/components/ui/Icon';

type Safety =
  | { status: 'loading' }
  | { status: 'ok'; items: CardItem[]; lang: string }
  | { status: 'noCard' }
  | { status: 'notReady' }
  | { status: 'failed' };
type Entry = { session: string; code: string | null; inAt: string; safety: Safety };

type Props = { services: LiveService[]; roster: ChildName[]; clock: DeskClock; initialService: string | null; viewerId: string };

export function RoomView({ services, roster, clock, initialService, viewerId }: Props) {
  const t = useT();
  const { lang } = useLang();
  const uid = useId();
  const [selected, setSelected] = useState(initialService ?? pickService(services, new Date(clock.now))?.id ?? null);
  const service = services.find((s) => s.id === selected) ?? null;
  const when = (s: LiveService) => timeLabel(new Date(s.startsAt), new Date(s.endsAt), { lang, tz: clock.tz, shiftMs: clock.shiftMs });

  return (
    <div className="mx-auto w-full max-w-[1080px]">
      <header className="max-w-[62ch]">
        <h1 className="text-32 font-medium text-balance text-ink">{t('room.title')}</h1>
        <p className="mt-2 text-17 text-ink-muted text-pretty">{t('room.lede')}</p>
      </header>
      {services.length === 0 || !service ? (
        <p className="mt-8 text-17 text-ink-muted">{t('room.noServices')}</p>
      ) : (
        <>
          <div className="mt-6">
            <ServiceTabs
              services={services}
              selected={service.id}
              onSelect={setSelected}
              idBase={uid}
              label={t('room.services')}
              meta={(s) => [when(s), s.room].filter(Boolean).join(' · ')}
            />
          </div>
          <div id={panelId(uid, service.id)} role="tabpanel" aria-labelledby={tabId(uid, service.id)}>
            <RoomLive key={service.id} service={service} names={roster} clock={clock} viewerId={viewerId} />
          </div>
        </>
      )}
    </div>
  );
}

function RoomLive({ service, names, clock, viewerId }: { service: LiveService; names: ChildName[]; clock: DeskClock; viewerId: string }) {
  const t = useT();
  const { lang } = useLang();
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [first, setFirst] = useState(false);
  const [switched, setSwitched] = useState(false);
  const [announce, setAnnounce] = useState('');
  const sessions = useRef<Record<string, string | null>>({});
  // One card read at a time: a full room checking in at once shouldn't flood the server's small database pool.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const nameOf = (id: string) => names.find((n) => n.id === id);
  const fmt = (iso: string) => timeLabel(new Date(iso), null, { lang, tz: clock.tz, shiftMs: clock.shiftMs });

  const setSafety = (id: string, session: string, safety: Safety) =>
    setEntries((cur) => (cur[id]?.session === session ? { ...cur, [id]: { ...cur[id], safety } } : cur));

  const loadSafety = async (id: string, session: string) => {
    const res = await fetch(`/api/cards/${id}?service=${service.id}&scope=safety`, { cache: 'no-store' }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { locked: true; reason: string } | { locked: false; card: { items: CardItem[]; lang: string } } | null) : null;
    if (sessions.current[id] !== session) return;
    if (res?.status === 404) return setSafety(id, session, { status: 'noCard' });
    if (!body) return setSafety(id, session, { status: 'failed' });
    if (body.locked) return setSafety(id, session, body.reason === 'not_acknowledged' ? { status: 'notReady' } : { status: 'failed' });
    setSafety(id, session, { status: 'ok', items: body.card.items.filter((i) => i.section === 'safety'), lang: body.card.lang });
  };

  const onBeat = (hb: Heartbeat) => {
    if (hb.viewerId !== viewerId) {
      sessions.current = {};
      setEntries({});
      setSwitched(true);
      return;
    }
    setFirst(true);
    const inNow = new Map(hb.checkins.filter((c) => c.in).map((c) => [c.childId, c]));
    const next: Record<string, Entry> = {};
    const said: string[] = [];
    for (const [id, e] of Object.entries(entries)) {
      const c = inNow.get(id);
      if (c && c.checkedInAt === e.session) next[id] = e;
      else {
        sessions.current[id] = null;
        const n = nameOf(id);
        if (n && !c) said.push(t('room.left', { name: n.firstName }));
      }
    }
    for (const c of inNow.values()) {
      const e = next[c.childId];
      if (e && e.safety.status !== 'failed') continue;
      next[c.childId] = { session: c.checkedInAt, code: c.securityCode, inAt: c.checkedInAt, safety: { status: 'loading' } };
      sessions.current[c.childId] = c.checkedInAt;
      const n = nameOf(c.childId);
      if (!e && n) said.push(t('room.arrived', { name: n.firstName }));
      const session = c.checkedInAt;
      queue.current = queue.current.then(() => (sessions.current[c.childId] === session ? loadSafety(c.childId, session) : undefined));
    }
    setEntries(next);
    if (said.length) setAnnounce(said.join('. '));
  };
  const pulse = useHeartbeat(service.id, onBeat);

  const list = Object.entries(entries)
    .map(([id, e]) => ({ id, e, child: nameOf(id) }))
    .filter((x): x is { id: string; e: Entry; child: ChildName } => !!x.child)
    .sort((a, b) => a.child.firstName.localeCompare(b.child.firstName));

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-hairline pb-3">
        <p className="min-h-7 text-17 font-medium text-ink tabular">
          {first && !switched && (list.length === 1 ? t('room.count.one') : t('room.count.other', { count: list.length }))}
        </p>
        <HeartbeatIndicator status={pulse.status} lastAt={pulse.lastAt} count={pulse.count} />
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      {switched ? (
        <Banner tone="accent" role="status" className="mt-5">
          <p>{t('room.switched')}</p>
        </Banner>
      ) : list.length === 0 ? (
        first && (
          <div className="mt-5 rounded-sharp border border-dashed border-hairline-strong px-5 py-6">
            <p className="text-17 font-medium text-ink">{t('room.empty.title')}</p>
            <p className="mt-1 text-15 text-ink-muted text-pretty">{t('room.empty.body')}</p>
          </div>
        )
      ) : (
        <div className="@container mt-5">
          <ul className="grid gap-3 @2xl:grid-cols-2">
            {list.map(({ id, e, child }) => (
              <RoomCard key={`${id}:${e.session}`} child={child} entry={e} since={fmt(e.inAt)} lang={lang} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function RoomCard({ child, entry, since, lang }: { child: ChildName; entry: Entry; since: string; lang: 'en' | 'es' }) {
  const t = useT();
  const uid = useId();
  const s = entry.safety;
  const cardLang = s.status === 'ok' && (s.lang === 'en' || s.lang === 'es') ? s.lang : undefined;
  return (
    <li aria-labelledby={`${uid}-name`} className="flex animate-rise flex-col rounded-sharp border border-hairline-strong bg-surface">
      <div className="flex items-start justify-between gap-4 px-4 pt-4 pb-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 id={`${uid}-name`} className="text-24 font-medium text-ink">
            {child.firstName}
          </h2>
          <p className="mt-0.5 text-15 text-ink-muted tabular">{[child.grade, t('room.since', { time: since })].filter(Boolean).join(' · ')}</p>
        </div>
        {entry.code && (
          <div className="shrink-0 rounded-sharp border border-hairline px-3 py-1.5 text-right">
            <p className="text-13 text-ink-muted">{t('room.code')}</p>
            <p className="font-mono text-24 leading-7 font-medium tracking-[0.14em] text-ink">{entry.code}</p>
          </div>
        )}
      </div>
      <div className="px-4 pb-4 sm:px-5">
        {s.status === 'ok' ? (
          s.items.length > 0 ? (
            <SafetyBanner
              size="md"
              headingId={`${uid}-safety`}
              title={t('buddy.safety.title')}
              note={t('buddy.safety.exact')}
              lines={s.items.map((i) => ({ id: i.id, text: i.text, lang: cardLang, translation: s.lang !== lang ? usableTranslation(i, lang) : null }))}
            />
          ) : (
            <Quiet>{t('room.noSafety')}</Quiet>
          )
        ) : s.status === 'loading' ? (
          <div className="rounded-sharp border border-danger-line/60 bg-danger-bg/50 px-4 py-3.5">
            <span className="sr-only">{t('room.loading')}</span>
            <div aria-hidden>
              <div className="h-3 w-32 rounded-sharp bg-danger-line/60" />
              <div className="mt-3 h-2.5 w-[85%] rounded-sharp bg-danger-line/40" />
              <div className="mt-2 h-2.5 w-[60%] rounded-sharp bg-danger-line/40" />
            </div>
          </div>
        ) : s.status === 'noCard' ? (
          <Quiet>{t('room.noCard')}</Quiet>
        ) : s.status === 'notReady' ? (
          <Quiet>{t('room.notReady')}</Quiet>
        ) : (
          <Quiet icon="alert">{t('room.failed')}</Quiet>
        )}
      </div>
    </li>
  );
}

function Quiet({ children, icon }: { children: string; icon?: 'alert' }) {
  return (
    <p className="flex items-start gap-2 rounded-sharp border border-hairline bg-surface-2 px-4 py-3 text-15 text-ink-muted">
      {icon && <Icon name={icon} size={14} className="mt-[4px] shrink-0" />}
      {children}
    </p>
  );
}
