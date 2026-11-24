'use client';
// "Try a Sunday": the sandbox's seven-step guide through Sam's first Sunday. A right-hand panel on wide
// screens, a bottom sheet on phones, a small pill when hidden (remembered per browser). Each step is one
// button: it switches to the right person and opens the right page. Checks come from GET /api/demo/state.
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { cx } from '@/lib/cx';
import type { MessageKey } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import type { Persona, PersonaKey } from '@/lib/demo/personas';
import { DEMO_STEP_FLAGS, type DemoFlags, type DemoState } from '@/lib/demo/flags';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { useSwitchPersona } from './RoleBar';

const POLL_MS = 5000;

// ---- collapsed state: localStorage when it works, memory when it doesn't
const STORE_KEY = 'hd.guide.collapsed';
let memo: boolean | null = null;
const listeners = new Set<() => void>();
function readCollapsed(): boolean {
  if (memo !== null) return memo;
  try {
    memo = window.localStorage.getItem(STORE_KEY) === '1';
  } catch {
    memo = false;
  }
  return memo;
}
function writeCollapsed(v: boolean) {
  memo = v;
  try {
    window.localStorage.setItem(STORE_KEY, v ? '1' : '0');
  } catch {
    // private mode / blocked storage: remembered until reload
  }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// ---- steps
type Who = PersonaKey | 'buddy';
type PathCtx = { base: string; samId: string | null; buddyId: string | null; serviceId: string | null };
type StepDef = { flag: keyof DemoFlags; who: Who; path: (c: PathCtx) => string };

/** The station and the buddy's phone open on Sam's service (the one he is matched at), with Sam picked out. */
const atService = (c: PathCtx, child = false) => {
  const q = [c.serviceId && `service=${c.serviceId}`, child && c.samId && `child=${c.samId}`].filter(Boolean).join('&');
  return q ? `?${q}` : '';
};

const STEPS: readonly StepDef[] = [
  { flag: 'samCardApproved', who: 'jordan', path: () => '' },
  { flag: 'samCardAcknowledged', who: 'hannah', path: (c) => `${c.base}/desk${c.samId ? `?child=${c.samId}` : ''}` },
  { flag: 'samAssignedApproved', who: 'hannah', path: (c) => `${c.base}/desk/sunday` },
  { flag: 'samCheckedIn', who: 'hannah', path: (c) => `${c.base}/station${atService(c, true)}` },
  { flag: 'samCardOpenedByBuddy', who: 'buddy', path: (c) => `${c.base}/buddy/${c.buddyId}${atService(c, true)}` },
  { flag: 'samCheckedOut', who: 'hannah', path: (c) => `${c.base}/station${atService(c, true)}` },
  { flag: 'samNoteApproved', who: 'hannah', path: (c) => `${c.base}/desk/notes` },
];

type Props = {
  slug: string;
  personas: Persona[];
  current: string | null;
  samId: string | null;
};

export function DemoGuide({ slug, personas, current, samId }: Props) {
  const t = useT();
  const pathname = usePathname();
  const panelId = useId();
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  // null until the first answer: steps show no checks rather than a wrong "0 of 7".
  const [state, setState] = useState<DemoState | null>(null);
  const done = (f: keyof DemoFlags) => state?.[f] ?? false;
  const [stale, setStale] = useState(false);
  const [pendingStep, setPendingStep] = useState<number | null>(null);
  const { go, isPending } = useSwitchPersona(current);
  const quietPill = useQuietPill();

  // Check now and after each navigation (the hidden pill shows progress too); while the guide is open, again 5 s
  // after each answer. One request at a time, so a slow database never piles polls up; a hidden tab skips its turn.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (alive && !collapsed) timer = setTimeout(tick, POLL_MS);
    };
    const tick = () => {
      if (document.visibilityState !== 'visible') return schedule();
      fetch('/api/demo/state', { cache: 'no-store' })
        .then((res) => (res.ok ? (res.json() as Promise<DemoState>) : Promise.reject(new Error(String(res.status)))))
        .then((next) => {
          if (!alive) return;
          setState(next);
          setStale(false);
        })
        .catch(() => {
          if (alive) setStale(true);
        })
        .finally(schedule);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [collapsed, pathname]);

  const base = `/c/${encodeURIComponent(slug)}`;
  const byKey = new Map(personas.map((p) => [p.key, p]));
  const buddyId = state?.samBuddyId ?? null;
  // Always as the buddy themself: a role-bar persona for the same person may stand for another role (Tom is the
  // room leader there, `id:leader`), and the phone opens only for the buddy.
  const buddy = buddyId ? { value: buddyId, name: personas.find((p) => p.personId === buddyId)?.name ?? state?.samBuddyName ?? '' } : null;
  const doneCount = DEMO_STEP_FLAGS.filter(done).length;
  const next = state ? STEPS.findIndex((s) => !done(s.flag)) : -1;
  const progress = state ? t('guide.progress', { done: doneCount, total: STEPS.length }) : t('guide.checking');
  const jordan = byKey.get('jordan');

  const serviceId = state?.samServiceId ?? null;
  const target = (s: StepDef): { value: string; name: string; href: string } | null => {
    if (s.who === 'buddy') return buddy ? { ...buddy, href: s.path({ base, samId, buddyId, serviceId }) } : null;
    const p = byKey.get(s.who);
    if (!p) return null;
    return { value: p.value, name: p.name, href: s.who === 'jordan' ? p.href : s.path({ base, samId, buddyId: null, serviceId }) };
  };

  // Hiding or showing the guide unmounts the control that was clicked; keep keyboard focus on its counterpart.
  const toggle = (hide: boolean) => {
    writeCollapsed(hide);
    requestAnimationFrame(() => document.getElementById(`${panelId}-${hide ? 'show' : 'hide'}`)?.focus());
  };

  const run = (i: number) => {
    const to = target(STEPS[i]);
    if (!to) return;
    setPendingStep(i);
    go(to, to.href);
  };

  if (collapsed) {
    // On phones the pill shrinks to its progress ring (a 44px button) once the page is scrolled or a text field has
    // focus, so it never sits on the words being read or typed. Screen readers hear the same name either way.
    const hideOnPhone = quietPill ? 'max-lg:sr-only' : undefined;
    return (
      <button
        id={`${panelId}-show`}
        type="button"
        aria-expanded={false}
        onClick={() => toggle(false)}
        className={cx(
          'fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex h-11 items-center gap-2.5 rounded-pill border border-hairline-strong bg-surface pr-4 pl-3 text-15 font-medium text-ink',
          'transition-[border-color] duration-200 ease-out hover:border-hairline-emphasis lg:right-6 lg:bottom-6 print:hidden',
          quietPill && 'max-lg:w-11 max-lg:justify-center max-lg:gap-0 max-lg:px-0',
        )}
      >
        <ProgressRing done={doneCount} total={STEPS.length} />
        <span className={hideOnPhone}>{t('guide.title')}</span>
        <span className={cx('text-13 font-normal text-ink-muted tabular', hideOnPhone)}>{progress}</span>
        <Icon name="chevronUp" className={cx('shrink-0 text-ink-muted', quietPill && 'max-lg:hidden')} />
        <span className="sr-only">{t('guide.show')}</span>
      </button>
    );
  }

  return (
    <aside
      id={panelId}
      aria-labelledby={`${panelId}-title`}
      className={cx(
        'fixed inset-x-0 bottom-0 z-30 flex max-h-[min(76dvh,680px)] flex-col border-t border-hairline-strong bg-surface print:hidden',
        'lg:sticky lg:inset-x-auto lg:top-[var(--shell-h)] lg:self-start lg:bottom-auto lg:z-10 lg:h-[calc(100dvh-var(--shell-h))] lg:max-h-none lg:w-[var(--guide-w)] lg:shrink-0 lg:border-t-0 lg:border-l lg:border-hairline',
      )}
    >
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-4 lg:px-6 lg:pt-6">
        <header>
          <div className="flex items-start justify-between gap-3">
            <h2 id={`${panelId}-title`} className="text-20 font-medium tracking-[-0.02em] text-ink">
              {t('guide.title')}
            </h2>
            <button
              id={`${panelId}-hide`}
              type="button"
              aria-expanded
              aria-controls={panelId}
              aria-label={t('guide.hide')}
              title={t('guide.hide')}
              onClick={() => toggle(true)}
              className="-mt-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink-muted transition-colors duration-200 ease-out hover:bg-ground hover:text-ink"
            >
              <Icon name="panelRight" size={16} className="hidden lg:block" />
              <Icon name="chevronDown" size={16} className="lg:hidden" />
            </button>
          </div>
          <p className="mt-1 text-15 text-ink-muted text-pretty">{t('guide.intro')}</p>
          <div className="mt-4 flex items-center gap-3">
            <div className="grid flex-1 grid-cols-7 gap-1" aria-hidden>
              {STEPS.map((s) => (
                <span key={s.flag} className={cx('h-1 rounded-pill transition-colors duration-200 ease-out', done(s.flag) ? 'bg-ink' : 'bg-hairline-strong')} />
              ))}
            </div>
            <p aria-live="polite" className="shrink-0 text-13 text-ink-muted tabular">
              {progress}
            </p>
          </div>
        </header>

        <ol className="-mx-2 mt-5">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const isDone = done(s.flag);
            const isNext = i === next;
            const to = target(s);
            const busy = isPending && pendingStep === i;
            const title = t(`guide.s${n}.title` as MessageKey);
            const whyId = `${panelId}-why-${n}`;
            return (
              <li key={s.flag} className="relative">
                {/* the rail from this marker to the next one */}
                {n < STEPS.length && (
                  <span aria-hidden className={cx('absolute top-6 left-[21.5px] h-full w-px', done(s.flag) ? 'bg-ok-line' : 'bg-hairline-strong')} />
                )}
                <button
                  type="button"
                  onClick={() => run(i)}
                  disabled={!to || (isPending && pendingStep !== null)}
                  aria-label={t('guide.goLabel', { n, title, name: to?.name ?? '' }) + (isDone ? ` · ${t('guide.done')}` : '')}
                  aria-describedby={whyId}
                  aria-current={isNext ? 'step' : undefined}
                  className={cx(
                    'group grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-x-3 rounded-sharp px-2 py-2.5 text-left',
                    'transition-[background-color] duration-200 ease-out disabled:cursor-default',
                    isNext ? 'bg-ground' : 'enabled:hover:bg-ground',
                  )}
                >
                  <Marker n={n} done={isDone} next={isNext} />
                  <span className="min-w-0 pt-[3px]">
                    <span className={cx('block text-15 leading-[22px] font-medium', isDone ? 'text-ink-2' : 'text-ink')}>{title}</span>
                    <span id={whyId} className="mt-0.5 block text-13 leading-[18px] text-ink-muted text-pretty">
                      {t(`guide.s${n}.why` as MessageKey)}
                    </span>
                    {!to && s.who === 'buddy' && state && (
                      <span className="mt-1 block text-13 leading-[19px] text-rose">{t('guide.needsBuddy')}</span>
                    )}
                  </span>
                  <span className="flex flex-col items-end gap-1 pt-[1px]">
                    {busy ? (
                      <span className="inline-flex h-7 items-center px-2 text-ink-muted"><Spinner size={14} /></span>
                    ) : isDone ? (
                      <span className="inline-flex h-7 items-center px-1 text-13 font-medium text-ok-ink">{t('guide.done')}</span>
                    ) : to ? (
                      <span
                        className={cx(
                          'inline-flex h-7 items-center gap-1.5 rounded-pill px-3 text-13 font-medium transition-[background-color,border-color,color] duration-200 ease-out',
                          isNext
                            ? 'bg-accent text-on-accent group-hover:bg-accent-hover'
                            : 'border border-transparent text-ink-muted group-hover:border-hairline-strong group-hover:bg-surface group-hover:text-ink',
                        )}
                      >
                        {t('guide.go')}
                        <Icon name="arrowRight" size={12} />
                      </span>
                    ) : null}
                    {isNext && to && !busy && <span className="pr-1 text-13 leading-[18px] text-ink-muted">{t('guide.as', { name: to.name })}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {doneCount === STEPS.length && (
          <Banner tone="ok" role="status" className="mt-4">
            <p>{t('guide.allDone')}</p>
            {jordan && (
              <Button size="sm" variant="secondary" className="mt-3" iconEnd={<Icon name="arrowRight" size={12} />} onClick={() => go(jordan, jordan.href)}>
                {t('guide.jordanView')}
              </Button>
            )}
          </Banner>
        )}
        {stale && (
          <p role="status" className="mt-3 text-13 text-ink-muted">
            {t('guide.stale')}
          </p>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-x-3 border-t border-hairline px-5 py-2 lg:px-6">
        {/* A full page load: /demo makes a new sandbox church and lands on the desk as Hannah. */}
        <a
          href="/demo"
          className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-pill px-2 text-15 font-medium whitespace-nowrap text-ink-2 transition-colors duration-200 ease-out hover:text-ink"
          aria-describedby={`${panelId}-reset`}
        >
          <Icon name="reset" />
          {t('guide.reset')}
        </a>
        <span id={`${panelId}-reset`} className="text-13 text-ink-muted">
          {t('guide.resetHint')}
        </span>
      </footer>
    </aside>
  );
}

/** Text fields: where a floating control must not sit while someone types. */
function isTextField(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)) return true;
  return el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(el.type);
}

/** The page is scrolled away from its top, or a text field has focus: the phone pill goes quiet. */
function useQuietPill(): boolean {
  const [scrolled, setScrolled] = useState(false);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    // After focusout the next element isn't focused yet; read activeElement on the next tick.
    const onFocus = () => setTimeout(() => setTyping(isTextField(document.activeElement)), 0);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onFocus);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onFocus);
    };
  }, []);
  return scrolled || typing;
}

function Marker({ n, done, next }: { n: number; done: boolean; next: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'relative z-[1] inline-flex size-7 items-center justify-center rounded-pill border text-13 font-medium tabular transition-colors duration-200 ease-out',
        done ? 'border-ok-line bg-ok-bg text-ok-ink' : next ? 'border-ink bg-ink text-surface' : 'border-hairline-strong bg-surface text-ink-muted',
      )}
    >
      {done ? <Icon name="check" size={12} /> : n}
    </span>
  );
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 20 20" width={20} height={20} aria-hidden className="-rotate-90">
      <circle cx="10" cy="10" r={r} fill="none" strokeWidth="2" className="stroke-hairline-strong" />
      <circle cx="10" cy="10" r={r} fill="none" strokeWidth="2" strokeDasharray={`${(done / total) * c} ${c}`} strokeLinecap="round" className="stroke-ink" />
    </svg>
  );
}
