'use client';
// The morning in pictures, held up for the child: a big "Now" and a smaller "Next", with this child's supports
// under the step they belong to. It follows the clock (by each step's minutes from the service start); swipe, the
// arrow keys or the buttons look ahead or back, and "Back to now" returns.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { currentStepIndex } from '@/lib/buddy/live';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n/client';
import type { Pack, PackStep } from '@/components/desk/PackSheet';
import { Button, buttonClass } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useSwipe } from './useSwipe';

const ROUND =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-pill border border-hairline-strong bg-surface text-ink ' +
  'transition-[border-color] duration-200 ease-out hover:border-hairline-emphasis disabled:pointer-events-none disabled:opacity-40';

/** Re-reads the clock every 20 s so "Now" moves on by itself. */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

type Props = {
  pack: Pack;
  startsAt: string;
  name: string;
  onOpenStory: () => void;
  storyButtonRef?: Ref<HTMLButtonElement>;
};

export function ScheduleNowNext({ pack, startsAt, name, onOpenStory, storyButtonRef }: Props) {
  const t = useT();
  const uid = useId();
  const steps = pack.steps;
  const now = useMinuteClock();
  const current = currentStepIndex(steps, new Date(startsAt), new Date(now));
  // null: follow the clock. A number: the step the buddy moved to.
  const [picked, setPicked] = useState<number | null>(null);
  const at = picked ?? current;
  const regionRef = useRef<HTMLElement>(null);

  const go = (i: number) => {
    const k = Math.max(0, Math.min(steps.length - 1, i));
    setPicked(k === current ? null : k);
  };
  const prev = () => go(at - 1);
  const next = () => go(at + 1);
  const swipe = useSwipe(prev, next);
  const onKey = (e: KeyboardEvent) => {
    const to = ({ ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: steps.length - 1 } as Record<string, number>)[e.key];
    if (to === undefined) return;
    e.preventDefault();
    go(to);
  };

  if (steps.length === 0) return <p className="px-4 py-6 text-15 text-ink-muted sm:px-5">{t('buddy.sched.none')}</p>;
  const step = steps[at];
  const after = steps[at + 1] ?? null;
  const label = at === current ? t('buddy.sched.now') : at < current ? t('buddy.sched.earlier') : t('buddy.sched.later');

  return (
    <div className="flex flex-col gap-5 px-4 pt-4 pb-5 sm:px-5">
      <section
        ref={regionRef}
        aria-roledescription="carousel"
        aria-label={t('buddy.sched.region')}
        aria-describedby={`${uid}-hint`}
        tabIndex={0}
        onKeyDown={onKey}
        {...swipe}
        className="touch-pan-y select-none rounded-sharp outline-offset-4"
      >
        <p id={`${uid}-hint`} className="sr-only">
          {t('buddy.sched.hint')}
        </p>
        <div aria-live="polite" aria-atomic className="sr-only">
          {`${label}: ${step.label}.${after ? ` ${t('buddy.sched.next')}: ${after.label}.` : ''}`}
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <NowPanel step={step} label={label} isNow={at === current} pos={t('buddy.sched.step', { n: at + 1, total: steps.length })} name={name} />
          <NextPanel step={after} label={at === current ? t('buddy.sched.next') : t('buddy.sched.after')} last={t('buddy.sched.last')} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <button type="button" aria-label={t('buddy.sched.prev')} disabled={at === 0} onClick={prev} className={ROUND}>
            <Icon name="chevronRight" className="shrink-0 rotate-180" />
          </button>
          <ol aria-hidden className="flex items-center gap-1.5">
            {steps.map((s, i) => (
              <li
                key={s.key}
                className={cx(
                  'h-1.5 rounded-pill transition-[width,background-color] duration-200 ease-out',
                  i === at ? 'w-5 bg-ink' : i === current ? 'w-1.5 bg-accent' : 'w-1.5 bg-hairline-emphasis',
                )}
              />
            ))}
          </ol>
          <button type="button" aria-label={t('buddy.sched.nextStep')} disabled={at === steps.length - 1} onClick={next} className={ROUND}>
            <Icon name="chevronRight" />
          </button>
        </div>
        {at !== current && (
          <div className="mt-2 flex justify-center">
            <Button variant="quiet" size="sm" onClick={() => setPicked(null)}>
              {t('buddy.sched.backToNow')}
            </Button>
          </div>
        )}
      </section>

      <section aria-labelledby={`${uid}-steps`}>
        <h3 id={`${uid}-steps`} className="text-15 font-medium text-ink-muted">
          {t('buddy.sched.steps')}
        </h3>
        <ol className="-mx-4 mt-2 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:scroll-px-5 sm:px-5">
          {steps.map((s, i) => (
            <li key={s.key} className="snap-start">
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === at ? 'step' : undefined}
                className={cx(
                  'flex min-h-11 items-center gap-2 rounded-pill border py-1 pr-3.5 pl-1.5 text-15 whitespace-nowrap transition-[border-color,background-color] duration-200 ease-out',
                  i === at ? 'border-ink bg-surface text-ink' : 'border-hairline-strong bg-surface-2 text-ink-2 hover:border-hairline-emphasis',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- pinned ARASAAC pictograms through our proxy */}
                <img src={s.pictogramUrl} alt="" width={28} height={28} className="size-7 rounded-pill bg-surface object-contain" />
                <span className="font-medium">{s.label}</span>
                {i === current && <span className="text-13 text-rose">{t('buddy.log.nowTag')}</span>}
                {s.chips.length > 0 && <span aria-hidden className="size-1.5 rounded-pill bg-accent" />}
              </button>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-col gap-3 border-t border-hairline pt-4">
        <button ref={storyButtonRef} type="button" onClick={onOpenStory} className={buttonClass('secondary', 'md', 'self-start')}>
          {t('buddy.story.open', { name })}
          <Icon name="arrowRight" size={12} />
        </button>
        <p className="text-13 text-ink-muted-2 text-pretty">{t('pack.sheet.arasaac')}</p>
      </div>
    </div>
  );
}

function NowPanel({ step, label, isNow, pos, name }: { step: PackStep; label: string; isNow: boolean; pos: string; name: string }) {
  const t = useT();
  return (
    <figure className="flex flex-col rounded-sharp border border-hairline-strong bg-surface-2 px-4 pt-3.5 pb-4">
      <div className="flex items-center justify-between gap-3">
        <span
          className={cx(
            'inline-flex h-7 items-center gap-1.5 rounded-pill border px-3 text-13 font-medium',
            isNow ? 'border-accent-line bg-accent-tint text-accent-ink' : 'border-hairline-strong bg-surface text-ink-muted',
          )}
        >
          {isNow && <span aria-hidden className="size-[7px] rounded-pill bg-accent" />}
          {label}
        </span>
        <span className="text-13 text-ink-muted tabular">{pos}</span>
      </div>
      <div key={step.key} className="mt-3 flex animate-rise flex-col items-center text-center">
        <div className="flex size-[148px] items-center justify-center rounded-sharp border border-hairline bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element -- pinned ARASAAC pictograms through our proxy */}
          <img src={step.pictogramUrl} alt="" width={124} height={124} className="size-[124px] object-contain" />
        </div>
        <figcaption className="mt-3">
          <span className="block text-32 font-medium text-ink text-balance">{step.label}</span>
          <span className="mt-1 block text-15 text-ink-muted tabular">{t('pack.sheet.minutes', { n: step.minutes })}</span>
        </figcaption>
      </div>
      {step.chips.length > 0 && (
        <div className="mt-4 border-t border-hairline pt-3">
          <p className="text-13 text-ink-muted">{t('buddy.sched.forChild', { name })}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {step.chips.map((c) => (
              <li key={c.chip} className="flex items-center gap-2.5 rounded-sharp border border-accent-line bg-accent-tint/50 px-2.5 py-2 text-15 text-accent-ink">
                {/* eslint-disable-next-line @next/next/no-img-element -- pinned ARASAAC pictograms */}
                <img src={c.pictogramUrl} alt="" width={28} height={28} className="size-7 shrink-0 rounded-sharp bg-surface object-contain" />
                <span className="min-w-0">{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}

function NextPanel({ step, label, last }: { step: PackStep | null; label: string; last: string }) {
  const t = useT();
  return (
    <figure className="flex items-center gap-3.5 rounded-sharp border border-hairline bg-surface px-3.5 py-3 sm:flex-col sm:items-start sm:justify-center sm:px-4 sm:py-4">
      <span className="w-[4.5rem] shrink-0 text-13 font-medium text-ink-muted sm:w-auto">{label}</span>
      {step ? (
        <>
          <div className="flex size-14 shrink-0 items-center justify-center rounded-sharp border border-hairline bg-surface-2 sm:size-24">
            {/* eslint-disable-next-line @next/next/no-img-element -- pinned ARASAAC pictograms through our proxy */}
            <img src={step.pictogramUrl} alt="" width={80} height={80} className="size-11 object-contain sm:size-20" />
          </div>
          <figcaption className="min-w-0">
            <span className="block text-20 leading-6 font-medium text-ink-2">{step.label}</span>
            <span className="block text-13 text-ink-muted tabular">{t('pack.sheet.minutes', { n: step.minutes })}</span>
          </figcaption>
        </>
      ) : (
        <figcaption className="text-17 text-ink-muted">{last}</figcaption>
      )}
    </figure>
  );
}
