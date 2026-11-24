'use client';
// Approved by you · Reviewed by the kids' team · Matched with a buddy · Opened on Sunday. A row of four on wide
// screens, a list on a phone; each step says in words whether it happened, and when.
import { cx } from '@/lib/cx';
import type { Lang, MessageKey } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { dayLabel, whenLabel } from '@/lib/parent/format';
import type { StepKey, TimelineStep } from '@/lib/parent/timeline';
import type { MatchInfo } from '@/lib/parent/types';
import { Icon } from '@/components/ui/Icon';

const TITLE: Record<StepKey, MessageKey> = {
  approved: 'parent.tl.approved',
  reviewed: 'parent.tl.reviewed',
  matched: 'parent.tl.matched',
  opened: 'parent.tl.opened',
};

const WAITING: Record<StepKey, MessageKey> = {
  approved: 'parent.tl.approveWaiting',
  reviewed: 'parent.tl.reviewWaiting',
  matched: 'parent.tl.matchWaiting',
  opened: 'parent.tl.openWaiting',
};

type Props = {
  steps: TimelineStep[];
  match: MatchInfo | null;
  childName: string;
  tz: string;
  now: string;
  shiftMs: number;
  lang: Lang;
  title: string;
};

export function StatusTimeline({ steps, match, childName, tz, now, shiftMs, lang, title }: Props) {
  const t = useT();
  const ctx = { lang, tz, now: new Date(now), t, shiftMs };

  const detail = (s: TimelineStep): string => {
    if (s.state === 'attention') return t('parent.tl.returned');
    if (s.state === 'todo') return t('parent.tl.notYet');
    if (s.state === 'current') return t(WAITING[s.key], { name: childName });
    const at = s.at ? new Date(s.at) : null;
    if (s.key === 'matched' && match) return [match.buddy, at && whenLabel(at, null, ctx)].filter(Boolean).join(' · ');
    if (s.key === 'opened') return [s.who, at && whenLabel(at, null, ctx)].filter(Boolean).join(' · ');
    return at ? dayLabel(at, ctx) : '';
  };

  return (
    <ol aria-label={title} className="grid gap-0 sm:grid-cols-4 sm:gap-4">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.key} className="relative flex gap-3.5 pb-5 sm:flex-col sm:gap-3 sm:pb-0">
            {!last && (
              <span
                aria-hidden
                className={cx(
                  'absolute top-8 bottom-0 left-[13px] w-px sm:top-[13px] sm:right-[-1rem] sm:bottom-auto sm:left-9 sm:h-px sm:w-auto',
                  s.state === 'done' ? 'bg-ok-ink/45' : 'bg-hairline-strong',
                )}
              />
            )}
            <Marker state={s.state} n={i + 1} />
            <div className="min-w-0 pt-[3px] sm:pt-0">
              <p className={cx('text-15 font-medium', s.state === 'todo' ? 'text-ink-muted' : 'text-ink')}>{t(TITLE[s.key])}</p>
              <p
                className={cx(
                  'mt-0.5 text-15 tabular text-pretty',
                  s.state === 'done' ? 'text-ink-2' : s.state === 'attention' ? 'text-accent-ink' : 'text-ink-muted',
                )}
              >
                <span className="sr-only">{t(`parent.tl.state.${s.state}`)}: </span>
                {detail(s)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Marker({ state, n }: { state: TimelineStep['state']; n: number }) {
  return (
    <span
      aria-hidden
      className={cx(
        'relative z-[1] inline-flex size-7 shrink-0 items-center justify-center rounded-pill border text-13 font-medium tabular',
        state === 'done' && 'border-ok-line bg-ok-bg text-ok-ink',
        state === 'current' && 'border-ink bg-surface text-ink',
        state === 'attention' && 'border-accent-line bg-accent-tint text-accent-ink',
        state === 'todo' && 'border-hairline-strong bg-ground text-ink-muted',
      )}
    >
      {state === 'done' ? (
        <Icon name="check" size={13} />
      ) : state === 'attention' ? (
        <Icon name="alert" size={12} />
      ) : state === 'current' ? (
        <span className="size-2 rounded-pill bg-accent" />
      ) : (
        n
      )}
    </span>
  );
}
