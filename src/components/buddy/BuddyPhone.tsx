'use client';
// The buddy's phone. Each child's card stays locked until the front desk checks the child in: the heartbeat
// (every 8 s) sees the check-in, the card is fetched through the access gate and opens with the unlock motion.
// At checkout, or the moment any read says "locked", everything decrypted is dropped from state: the card, the
// picture schedule, the moments. Nothing about a card is ever server-rendered here.
import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { currentStepIndex, diffBeat, nextTryAt, presenceOf, windowClosed, windowEndsAt, type Presence } from '@/lib/buddy/live';
import type { BuddyChild, BuddyService, MomentRow } from '@/lib/buddy/types';
import type { CardView } from '@/lib/card/view';
import type { CheckinStatus, Heartbeat } from '@/lib/checkins/types';
import { cx } from '@/lib/cx';
import type { DeskClock } from '@/lib/desk/types';
import type { Lang, MessageKey, Translate } from '@/lib/i18n';
import { useLang, useT } from '@/lib/i18n/client';
import { timeLabel } from '@/lib/parent/format';
import type { Pack } from '@/components/desk/PackSheet';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { Spinner } from '@/components/ui/Spinner';
import { HeartbeatIndicator } from './HeartbeatIndicator';
import { KidsList, type KidTile } from './KidsList';
import { LockedCard } from './LockedCard';
import { MomentLogger, type NewMoment, type SaveResult } from './MomentLogger';
import { ScheduleNowNext, useMinuteClock } from './ScheduleNowNext';
import { SocialStory } from './SocialStory';
import { UnlockedCard, usableTranslation } from './UnlockedCard';
import { useHeartbeat } from './useHeartbeat';

type PackState = { status: 'loading' } | { status: 'ok'; pack: Pack } | { status: 'none' } | { status: 'failed' };
/**
 * Why a checked-in child's card still said no: under review, window not open yet, the service is over (window
 * closed), checked in elsewhere, or an error.
 */
type LockWhy = 'waiting' | 'no_card' | 'window' | 'closed' | 'elsewhere' | 'error';
type Live =
  | { phase: 'none' }
  | { phase: 'locked'; session: string | null; retry: boolean; why: LockWhy | null; settle: boolean; tries: number; nextTryAt?: number }
  | { phase: 'opening'; session: string }
  | { phase: 'open'; session: string; card: CardView; pack: PackState; moments: MomentRow[] | null };

const NONE: Live = { phase: 'none' };

/** A read that hangs counts as failed (and is retried) rather than leaving the card "opening" forever. */
const READ_TIMEOUT_MS = 20_000;

type PackFetch = Exclude<PackState, { status: 'loading' }> | { status: 'denied'; reason: unknown };

/** GET /api/pack, as data: no state is touched here. 403 = the gate closed (the card must lock). */
async function fetchPack(serviceId: string, childId: string, lang: Lang): Promise<PackFetch> {
  const res = await fetch(`/api/pack?service=${serviceId}&child=${childId}&lang=${lang}`, { cache: 'no-store', signal: AbortSignal.timeout(READ_TIMEOUT_MS) }).catch(() => null);
  if (res?.status === 403) return { status: 'denied', reason: (await res.json().catch(() => null))?.reason };
  const pack = res?.ok ? ((await res.json().catch(() => null)) as Pack | null) : null;
  if (pack) return { status: 'ok', pack };
  return res?.status === 404 ? { status: 'none' } : { status: 'failed' };
}

const WHY: Record<string, LockWhy | null> = {
  not_acknowledged: 'waiting',
  outside_window: 'window',
  other_service: 'elsewhere',
  checked_out: null,
  not_checked_in: null,
  // A re-read that finds the card gone (deleted by the family) or the person no longer allowed.
  not_found: 'no_card',
  forbidden: 'error',
};
/** Every open card is read again through the gate every 4th heartbeat (~32 s), to catch a gate closed server-side. */
const RECHECK_EVERY = 4;
/** setTimeout's ceiling; a window end further out than this is not scheduled. */
const MAX_TIMER_MS = 2_147_000_000;

type Me = { id: string; firstName: string };
type Props = {
  me: Me;
  services: BuddyService[];
  clock: DeskClock;
  initialService: string | null;
  initialChild: string | null;
  /** Demo churches only: the simulated station, so one person can check a child in and watch the card unlock. */
  stationHref?: string | null;
};

export function BuddyPhone({ me, services, clock, initialService, initialChild, stationHref }: Props) {
  const t = useT();
  const [serviceId, setServiceId] = useState(initialService ?? services[0]?.id ?? null);
  const [switched, setSwitched] = useState(false);
  const service = services.find((s) => s.id === serviceId) ?? null;

  return (
    <div className="mx-auto w-full max-w-[640px]">
      <h1 className="text-32 font-medium text-balance text-ink">{t('buddy.title')}</h1>
      {stationHref && <StationLink href={stationHref} />}
      {switched ? (
        <SwitchedBack me={me} onBack={() => setSwitched(false)} />
      ) : services.length === 0 || !service ? (
        <div className="mt-6 rounded-sharp border border-dashed border-hairline-strong px-5 py-6">
          <p className="text-17 font-medium text-ink">{t('buddy.empty.title')}</p>
          <p className="mt-1 text-15 text-ink-muted text-pretty">{t('buddy.empty.body')}</p>
        </div>
      ) : (
        <>
          {services.length > 1 && (
            <div role="group" aria-label={t('buddy.services')} className="mt-4 flex flex-wrap gap-2">
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={s.id === serviceId}
                  onClick={() => setServiceId(s.id)}
                  className={cx(
                    'inline-flex h-11 items-center rounded-pill border px-4 text-15 font-medium transition-[background-color,border-color,color] duration-200 ease-out',
                    s.id === serviceId ? 'border-ink bg-ink text-surface' : 'border-hairline-strong bg-surface text-ink-2 hover:border-hairline-emphasis',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {/* A service of its own: switching services drops everything the last one opened. */}
          <ServiceLive key={service.id} service={service} me={me} clock={clock} initialChild={initialChild} onSwitched={() => setSwitched(true)} />
        </>
      )}
    </div>
  );
}

/** A quiet link to the demo's check-in station, in a new tab: check a child in there and this phone unlocks live. */
export function StationLink({ href }: { href: string }) {
  const t = useT();
  return (
    <p className="mt-1.5 text-15">
      <a
        href={href}
        target="_blank"
        rel="noopener"
        className="inline-flex min-h-11 items-center gap-1.5 text-ink-muted underline decoration-hairline-strong underline-offset-4 transition-colors duration-200 ease-out hover:text-ink"
      >
        {t('buddy.openStation')}
        <Icon name="arrowRight" size={14} />
      </a>
    </p>
  );
}

/** Another tab of this browser switched the persona: this view stopped and cleared; one tap switches back. */
function SwitchedBack({ me, onBack }: { me: Me; onBack: () => void }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const back = async () => {
    setBusy(true);
    const res = await fetch('/api/sandbox/as', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ personId: me.id }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return;
    onBack();
    router.refresh();
  };
  return (
    <Banner
      tone="accent"
      role="status"
      className="mt-6"
      title={t('buddy.switched.title')}
      action={
        <Button variant="primary" size="sm" pending={busy} onClick={back}>
          {t('buddy.switched.action', { name: me.firstName })}
        </Button>
      }
    >
      <p>{t('buddy.switched.body', { name: me.firstName })}</p>
    </Banner>
  );
}

type Fmt = (iso: string) => string;

function ServiceLive({ service, me, clock, initialChild, onSwitched }: { service: BuddyService; me: Me; clock: DeskClock; initialChild: string | null; onSwitched: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const uid = useId();
  const kids = service.children;
  const [selected, setSelected] = useState(kids.some((k) => k.id === initialChild) ? (initialChild as string) : kids[0].id);
  const [live, setLive] = useState<Record<string, Live>>({});
  const [checkins, setCheckins] = useState<CheckinStatus[] | null>(null);
  // A counter beside the words: the same sentence twice in a row (locked, unlocked, locked) is still announced.
  const [announce, setAnnounce] = useState({ text: '', n: 0 });
  const say = (text: string) => setAnnounce((a) => ({ text, n: a.n + 1 }));
  const beats = useRef(0);
  // The check-in each child's open (or opening) card belongs to. Async answers for any other check-in are dropped.
  const sessions = useRef<Record<string, string | null>>({});

  const fmt: Fmt = (iso) => timeLabel(new Date(iso), null, { lang, tz: clock.tz, shiftMs: clock.shiftMs });
  const put = (id: string, next: Live) => setLive((cur) => ({ ...cur, [id]: next }));
  const patchOpen = (id: string, session: string, patch: (l: Extract<Live, { phase: 'open' }>) => Live) =>
    setLive((cur) => {
      const l = cur[id];
      return l?.phase === 'open' && l.session === session ? { ...cur, [id]: patch(l) } : cur;
    });

  /** `tries`: denied reads of this check-in in a row; a retryable lock waits 8 s five times, then 30 s (lib/buddy/live). */
  const lock = (id: string, session: string | null, why: LockWhy | null, settle: boolean, retry: boolean, tries = 0) => {
    sessions.current[id] = null;
    put(id, { phase: 'locked', session, retry, why, settle, tries, ...(retry ? { nextTryAt: nextTryAt(tries, Date.now()) } : {}) });
  };

  /** The gate's reason in this page's terms. Outside the window after the service means over, not "not yet". */
  const whyOf = (reason: unknown): LockWhy | null => {
    if (reason === 'outside_window') return windowClosed(service, Date.now()) ? 'closed' : 'window';
    return typeof reason === 'string' && reason in WHY ? WHY[reason] : 'error';
  };
  /** A denial that can clear by itself (review done, window opens) is asked again; a checkout or a closed window is final. */
  const retryable = (why: LockWhy | null, reason: unknown) => why !== 'closed' && reason !== 'checked_out' && reason !== 'other_service';
  const triesOf = (id: string, session: string) => {
    const l = live[id];
    return l?.phase === 'locked' && l.session === session ? l.tries : 0;
  };

  /** Any read answered "locked" (403): wipe now, don't wait for the next heartbeat. */
  const denied = (child: BuddyChild, session: string, reason: unknown) => {
    const wasOpen = sessions.current[child.id] === session;
    const why = whyOf(reason);
    lock(child.id, session, why, true, retryable(why, reason), 1);
    if (wasOpen) say(t(why === 'closed' ? 'buddy.announce.closed' : 'buddy.announce.lockedPlain', { name: child.firstName }));
  };

  const applyPack = (child: BuddyChild, session: string, r: PackFetch) => {
    if (sessions.current[child.id] !== session) return;
    if (r.status === 'denied') return denied(child, session, r.reason);
    patchOpen(child.id, session, (l) => ({ ...l, pack: r }));
  };
  const loadPack = async (child: BuddyChild, session: string, packLang: Lang) => applyPack(child, session, await fetchPack(service.id, child.id, packLang));

  const loadMoments = async (child: BuddyChild, session: string) => {
    const res = await fetch(`/api/moments?service=${service.id}&child=${child.id}`, { cache: 'no-store', signal: AbortSignal.timeout(READ_TIMEOUT_MS) }).catch(() => null);
    if (sessions.current[child.id] !== session) return;
    if (res?.status === 403) return denied(child, session, (await res.json().catch(() => null))?.reason);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { moments: MomentRow[] } | null) : null;
    if (sessions.current[child.id] !== session) return;
    patchOpen(child.id, session, (l) => ({ ...l, moments: body?.moments ?? [] }));
  };

  const open = async (child: BuddyChild, session: string, inAt: string) => {
    const cur = live[child.id];
    const retry = cur?.phase === 'locked' && cur.session === session;
    if (retry && sessions.current[child.id] === session) return; // that retry is still on its way
    // The service is over: nothing to ask the server, the window will not open again.
    if (windowClosed(service, Date.now())) return lock(child.id, session, 'closed', false, false);
    const tries = triesOf(child.id, session) + 1;
    sessions.current[child.id] = session;
    // A retry of the same check-in (card still under review, window not open) keeps its locked face: no flicker.
    if (!retry) put(child.id, { phase: 'opening', session });
    const res = await fetch(`/api/cards/${child.id}?service=${service.id}&scope=full`, { cache: 'no-store', signal: AbortSignal.timeout(READ_TIMEOUT_MS) }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { locked: true; reason: string } | { locked: false; card: CardView } | null) : null;
    if (sessions.current[child.id] !== session) return;
    if (!res || (!res.ok && res.status !== 404) || (res.ok && !body)) return lock(child.id, session, 'error', false, true, tries);
    if (res.status === 404) return lock(child.id, session, 'no_card', false, true, tries);
    if (!body || body.locked) {
      const why = whyOf(body?.reason);
      return lock(child.id, session, why, false, retryable(why, body?.reason), tries);
    }
    put(child.id, { phase: 'open', session, card: body.card, pack: { status: 'loading' }, moments: null });
    say(t('buddy.announce.unlocked', { name: child.firstName, time: fmt(inAt) }));
    void loadPack(child, session, lang);
    void loadMoments(child, session);
  };

  const recheck = async (child: BuddyChild, session: string) => {
    const res = await fetch(`/api/cards/${child.id}?service=${service.id}&scope=full`, { cache: 'no-store', signal: AbortSignal.timeout(READ_TIMEOUT_MS) }).catch(() => null);
    if (!res || sessions.current[child.id] !== session) return; // offline: the heartbeat and the window end still apply
    if (res.status === 404 || res.status === 403) return denied(child, session, res.status === 404 ? 'not_found' : 'forbidden');
    const body = res.ok ? ((await res.json().catch(() => null)) as { locked: true; reason: string } | { locked: false; card: CardView } | null) : null;
    if (!body || sessions.current[child.id] !== session) return;
    if (body.locked) return denied(child, session, body.reason);
    patchOpen(child.id, session, (l) => ({ ...l, card: body.card }));
  };

  const onBeat = (hb: Heartbeat) => {
    if (hb.viewerId !== me.id) {
      sessions.current = {};
      setLive({});
      onSwitched();
      return;
    }
    setCheckins(hb.checkins);
    const events = diffBeat(live, hb.checkins, kids.map((k) => k.id), Date.now());
    for (const e of events) {
      const child = kids.find((k) => k.id === e.childId);
      if (!child) continue;
      if (e.kind === 'lock') {
        const cur = live[e.childId] ?? NONE;
        lock(e.childId, cur.phase === 'none' ? null : cur.session, null, true, false);
        say(e.outAt ? t('buddy.announce.locked', { name: child.firstName, time: fmt(e.outAt) }) : t('buddy.announce.lockedPlain', { name: child.firstName }));
      } else {
        void open(child, e.session, e.inAt);
      }
    }
    // Every 4th beat, cards that stay open are read again through the gate: an assignment withdrawn, a card sent back
    // for changes or any other server-side close locks the phone without waiting for a checkout.
    beats.current += 1;
    if (beats.current % RECHECK_EVERY === 0) {
      const changed = new Set(events.map((e) => e.childId));
      for (const k of kids) {
        const l = live[k.id];
        if (l?.phase === 'open' && !changed.has(k.id)) void recheck(k, l.session);
      }
    }
  };
  const pulse = useHeartbeat(service.id, onBeat);

  // The window closes 30 min after the service ends: an open card locks then, whether or not a checkout came through.
  const expire = useEffectEvent(() => {
    for (const k of kids) {
      const l = live[k.id];
      if (l?.phase !== 'open' && l?.phase !== 'opening') continue;
      lock(k.id, l.session, 'closed', true, false);
      if (l.phase === 'open') say(t('buddy.announce.closed', { name: k.firstName }));
    }
  });
  useEffect(() => {
    const ms = windowEndsAt(service) - Date.now();
    if (ms > MAX_TIMER_MS) return;
    const id = setTimeout(() => expire(), Math.max(0, ms));
    return () => clearTimeout(id);
  }, [service]);

  // The schedule follows the page's language: a pack in the other language is fetched again.
  const stalePacks = useEffectEvent(() =>
    kids.flatMap((k) => {
      const l = live[k.id];
      return l?.phase === 'open' && l.pack.status === 'ok' && l.pack.pack.lang !== lang ? [{ child: k, session: l.session }] : [];
    }),
  );
  const onPack = useEffectEvent((child: BuddyChild, session: string, r: PackFetch) => applyPack(child, session, r));
  useEffect(() => {
    for (const { child, session } of stalePacks()) {
      void fetchPack(service.id, child.id, lang).then((r) => onPack(child, session, r));
    }
  }, [lang, service.id]);

  const saveMoment = async (child: BuddyChild, m: NewMoment): Promise<SaveResult> => {
    const cur = live[child.id];
    if (cur?.phase !== 'open') return 'locked';
    const session = cur.session;
    const res = await fetch('/api/moments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ serviceId: service.id, childId: child.id, ...m }),
    }).catch(() => null);
    if (!res) return 'failed';
    if (res.status === 403) {
      denied(child, session, (await res.json().catch(() => null))?.reason);
      return 'locked';
    }
    const body = res.ok ? ((await res.json().catch(() => null)) as { id: string } | null) : null;
    if (!body) return 'failed';
    if (sessions.current[child.id] !== session) return 'locked';
    const row: MomentRow = { id: body.id, stepKey: m.stepKey, kind: m.kind, helpedItemIds: m.helpedItemIds, note: m.note ?? null, at: new Date().toISOString() };
    patchOpen(child.id, session, (l) => ({ ...l, moments: [...(l.moments ?? []), row] }));
    return 'ok';
  };

  const view = (child: BuddyChild) => statusOf(child, live[child.id] ?? NONE, checkins ? presenceOf(checkins, child.id) : null, t, fmt);
  const tiles: KidTile[] = kids.map((k) => {
    const v = view(k);
    return { id: k.id, firstName: k.firstName, status: v.short, tone: v.tone === 'open' ? 'open' : v.tone === 'locked' ? 'locked' : 'quiet' };
  });
  const child = kids.find((k) => k.id === selected) ?? kids[0];
  const multi = kids.length > 1;
  const range = timeLabel(new Date(service.startsAt), new Date(service.endsAt), { lang, tz: clock.tz, shiftMs: clock.shiftMs });

  return (
    <>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-15 text-ink-muted tabular">{[service.label, range, service.room].filter(Boolean).join(' · ')}</p>
        <HeartbeatIndicator status={pulse.status} lastAt={pulse.lastAt} count={pulse.count} />
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announce.text}
        {announce.n % 2 ? '\u200b' : ''}
      </p>

      {multi && (
        <div className="mt-5">
          <KidsList
            kids={tiles}
            selected={child.id}
            onSelect={setSelected}
            label={t('buddy.kids')}
            tabId={(id) => `${uid}-kid-${id}`}
            panelId={(id) => `${uid}-panel-${id}`}
          />
        </div>
      )}

      <ChildPanel
        key={child.id}
        child={child}
        live={live[child.id] ?? NONE}
        view={view(child)}
        service={service}
        lang={lang}
        fmt={fmt}
        onSave={(m) => saveMoment(child, m)}
        onRetryPack={() => {
          const l = live[child.id];
          if (l?.phase === 'open') {
            patchOpen(child.id, l.session, (x) => ({ ...x, pack: { status: 'loading' } }));
            void loadPack(child, l.session, lang);
          }
        }}
        panelId={multi ? `${uid}-panel-${child.id}` : undefined}
        tabId={multi ? `${uid}-kid-${child.id}` : undefined}
      />
    </>
  );
}

type Tone = 'open' | 'locked' | 'waiting' | 'quiet';
type View = { tone: Tone; chip: string; short: string; message: string; code: string | null; inAt: string | null };

/** What the head chip, the kids list and the locked card say about a child, in words. */
function statusOf(child: BuddyChild, l: Live, p: Presence | null, t: Translate, fmt: Fmt): View {
  const name = child.firstName;
  const inAt = p?.state === 'in' ? p.inAt : null;
  const code = p?.state === 'in' ? p.code : null;
  if (l.phase === 'open' && inAt) {
    const chip = t('buddy.chip.open', { time: fmt(inAt) });
    return { tone: 'open', chip, short: chip, message: '', code, inAt };
  }
  if (l.phase === 'open' || l.phase === 'opening') {
    return { tone: 'quiet', chip: t('buddy.chip.opening'), short: t('buddy.chip.opening'), message: t('buddy.locked.hint', { name }), code, inAt };
  }
  if (l.phase === 'locked' && l.why && p?.state === 'in') {
    const m: Record<LockWhy, [MessageKey, MessageKey]> = {
      waiting: ['buddy.chip.waiting', 'buddy.locked.waiting'],
      no_card: ['buddy.chip.noCard', 'buddy.locked.noCard'],
      window: ['buddy.chip.window', 'buddy.locked.window'],
      closed: ['buddy.chip.closed', 'buddy.locked.closed'],
      elsewhere: ['buddy.chip.elsewhere', 'buddy.locked.elsewhere'],
      error: ['buddy.chip.error', 'buddy.locked.error'],
    };
    const [c, msg] = m[l.why];
    return { tone: l.why === 'waiting' || l.why === 'no_card' ? 'waiting' : 'locked', chip: t(c), short: t(c), message: t(msg, { name }), code, inAt };
  }
  if (p?.state === 'out') {
    const chip = t('buddy.chip.out', { time: fmt(p.outAt) });
    return { tone: 'locked', chip, short: chip, message: t('buddy.locked.out', { name }), code: null, inAt: null };
  }
  if (child.card === 'none') return { tone: 'waiting', chip: t('buddy.chip.noCard'), short: t('buddy.chip.noCard'), message: t('buddy.locked.noCard', { name }), code, inAt };
  if (child.card === 'waiting') return { tone: 'waiting', chip: t('buddy.chip.waiting'), short: t('buddy.chip.waiting'), message: t('buddy.locked.waiting', { name }), code, inAt };
  return { tone: 'locked', chip: t('buddy.chip.locked', { name }), short: t('buddy.chip.locked', { name }), message: t('buddy.locked.hint', { name }), code, inAt };
}

type Tab = 'card' | 'schedule' | 'moments';
const TABS: readonly { key: Tab; label: MessageKey }[] = [
  { key: 'card', label: 'buddy.tab.card' },
  { key: 'schedule', label: 'buddy.tab.schedule' },
  { key: 'moments', label: 'buddy.tab.moments' },
];

type PanelProps = {
  child: BuddyChild;
  live: Live;
  view: View;
  service: BuddyService;
  lang: Lang;
  fmt: Fmt;
  onSave: (m: NewMoment) => Promise<SaveResult>;
  onRetryPack: () => void;
  panelId?: string;
  tabId?: string;
};

function ChildPanel({ child, live, view, service, lang, fmt, onSave, onRetryPack, panelId, tabId }: PanelProps) {
  const t = useT();
  const uid = useId();
  const headRef = useRef<HTMLHeadingElement>(null);
  const isOpen = live.phase === 'open';
  // The card locked while focus was inside it: put focus on the child's name instead of losing it to the page.
  const refocus = () => requestAnimationFrame(() => headRef.current?.focus());

  return (
    <article
      id={panelId}
      role={panelId ? 'tabpanel' : undefined}
      aria-labelledby={tabId ?? `${uid}-name`}
      className={cx(
        'mt-5 rounded-sharp border bg-surface transition-[border-color] duration-200 ease-out',
        // While the card is open its frame carries the rose of the unlock; locked, it is plain hairline.
        isOpen ? 'border-accent-line' : 'border-hairline-strong',
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 px-4 pt-4 pb-3.5 sm:px-5">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 id={`${uid}-name`} ref={headRef} tabIndex={-1} className="text-24 font-medium text-ink outline-none">
            {child.firstName}
          </h2>
          {child.grade && <span className="truncate text-15 text-ink-muted">{child.grade}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusPill view={view} />
          {view.tone === 'open' && view.code && (
            <span className="text-13 text-ink-muted">
              {t('room.code')}{' '}
              <span className="font-mono text-15 font-medium tracking-[0.08em] text-ink">{view.code}</span>
            </span>
          )}
        </div>
      </header>

      <div className="border-t border-hairline">
        {isOpen ? (
          <OpenBody
            key={live.session}
            child={child}
            live={live}
            service={service}
            lang={lang}
            fmt={fmt}
            onSave={onSave}
            onRetryPack={onRetryPack}
            onLostFocus={refocus}
          />
        ) : (
          <LockedCard childId={child.id} message={view.message} code={view.tone !== 'open' ? view.code : null} settle={live.phase === 'locked' && live.settle} />
        )}
      </div>
    </article>
  );
}

function StatusPill({ view }: { view: View }) {
  if (view.tone === 'open') {
    return (
      <Pill tone="accent" dot className="animate-rise">
        {view.chip}
      </Pill>
    );
  }
  if (view.chip && view.tone === 'quiet') {
    return (
      <Pill tone="quiet" icon={<Spinner size={12} />}>
        {view.chip}
      </Pill>
    );
  }
  return (
    <Pill tone={view.tone === 'waiting' ? 'quiet' : 'neutral'} icon={<Icon name="lock" size={12} />}>
      {view.chip}
    </Pill>
  );
}

function OpenBody({
  child, live, service, lang, fmt, onSave, onRetryPack, onLostFocus,
}: {
  child: BuddyChild;
  live: Extract<Live, { phase: 'open' }>;
  service: BuddyService;
  lang: Lang;
  fmt: Fmt;
  onSave: (m: NewMoment) => Promise<SaveResult>;
  onRetryPack: () => void;
  onLostFocus: () => void;
}) {
  const t = useT();
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const storyBtn = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<Tab>('card');
  const [story, setStory] = useState(false);
  const now = useMinuteClock();
  const lostFocus = useEffectEvent(onLostFocus);

  // On the way out (the card locked), hand focus back if it was inside.
  useLayoutEffect(() => {
    const node = rootRef.current;
    return () => {
      if (node && node.contains(document.activeElement)) lostFocus();
    };
  }, []);

  const card = live.card;
  const pack = live.pack.status === 'ok' ? live.pack.pack : null;
  const steps = pack?.steps ?? [];
  const current = steps.length ? steps[currentStepIndex(steps, new Date(service.startsAt), new Date(now))].key : null;
  const helps = card.items
    .filter((i) => i.section === 'helps')
    .map((i) => {
      const tr = card.lang !== lang ? usableTranslation(i, lang) : null;
      return { id: i.id, text: tr ? tr.text : i.text, lang: tr ? tr.lang : card.lang };
    });

  const onTabKey = (e: KeyboardEvent, i: number) => {
    const n = TABS.length;
    const to = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: n - 1 } as Record<string, number>)[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const k = ((to % n) + n) % n;
    setTab(TABS[k].key);
    tabRefs.current[k]?.focus();
  };

  const closeStory = () => {
    setStory(false);
    requestAnimationFrame(() => storyBtn.current?.focus());
  };

  return (
    <div ref={rootRef} className="animate-unlock">
      <div role="tablist" aria-label={t('buddy.tabs', { name: child.firstName })} className="grid grid-cols-3 border-b border-hairline">
        {TABS.map((x, i) => {
          const on = tab === x.key;
          return (
            <button
              key={x.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`${uid}-tab-${x.key}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`${uid}-panel-${x.key}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(x.key)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={cx(
                'relative h-12 text-15 font-medium outline-offset-[-2px] transition-colors duration-200 ease-out',
                on ? 'text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {t(x.label)}
              {x.key === 'moments' && live.moments && live.moments.length > 0 && (
                <span className="ml-1.5 text-13 font-normal text-ink-muted tabular">{live.moments.length}</span>
              )}
              <span aria-hidden className={cx('absolute inset-x-4 -bottom-px h-[2px] rounded-pill transition-colors duration-200 ease-out', on ? 'bg-ink' : 'bg-transparent')} />
            </button>
          );
        })}
      </div>

      <div id={`${uid}-panel-card`} role="tabpanel" aria-labelledby={`${uid}-tab-card`} hidden={tab !== 'card'}>
        <UnlockedCard card={card} lang={lang} idBase={`${uid}-card`} />
      </div>

      <div id={`${uid}-panel-schedule`} role="tabpanel" aria-labelledby={`${uid}-tab-schedule`} hidden={tab !== 'schedule'}>
        {live.pack.status === 'loading' ? (
          <p className="flex min-h-24 items-center gap-2.5 px-4 py-6 text-15 text-ink-muted sm:px-5">
            <Spinner size={14} />
            {t('buddy.sched.loading')}
          </p>
        ) : live.pack.status === 'failed' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-5">
            <p className="text-15 text-danger-ink">{t('buddy.sched.failed')}</p>
            <Button size="sm" variant="secondary" onClick={onRetryPack}>
              {t('buddy.retry')}
            </Button>
          </div>
        ) : !pack ? (
          <p className="px-4 py-6 text-15 text-ink-muted sm:px-5">{t('buddy.sched.none')}</p>
        ) : story ? (
          <SocialStory lines={pack.socialStory} lang={pack.lang} name={child.firstName} onClose={closeStory} />
        ) : (
          <ScheduleNowNext pack={pack} startsAt={service.startsAt} name={child.firstName} onOpenStory={() => setStory(true)} storyButtonRef={storyBtn} />
        )}
      </div>

      <div id={`${uid}-panel-moments`} role="tabpanel" aria-labelledby={`${uid}-tab-moments`} hidden={tab !== 'moments'}>
        <MomentLogger
          name={child.firstName}
          steps={steps.map((s) => ({ key: s.key, label: s.label }))}
          currentKey={current}
          helps={helps}
          moments={live.moments}
          onSave={onSave}
          timeOf={fmt}
        />
      </div>
    </div>
  );
}
