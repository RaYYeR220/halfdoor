'use client';
// Patterns: plain counts over each child's finished Sundays ("Hard moments in 4 of the last 5 worship times"),
// one mark per Sunday, and the moments behind them, including what helped when it went well. Not AI.
import { cx } from '@/lib/cx';
import type { ChildPatterns, DeskClock, PatternView } from '@/lib/desk/types';
import type { MessageKey } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { dayLabel } from '@/lib/parent/format';
import { PATTERN_MIN_COUNT, PATTERN_MIN_OUT_OF } from '@/lib/patterns';
import { Icon } from '@/components/ui/Icon';
import { DeskHead, useDeskTime } from './DeskFrame';
import { KindPill } from './NoteComposer';

const SEGMENT: Record<string, MessageKey> = {
  arrive: 'desk.segment.arrive',
  worship: 'desk.segment.worship',
  story: 'desk.segment.story',
  snack: 'desk.segment.snack',
  craft: 'desk.segment.craft',
  play: 'desk.segment.play',
  prayer: 'desk.segment.prayer',
  pickup: 'desk.segment.pickup',
  transition: 'desk.segment.transition',
};

type Props = { boards: ChildPatterns[]; without: string[]; clock: DeskClock };

export function PatternsDesk({ boards, without, clock }: Props) {
  const t = useT();
  return (
    <div>
      <DeskHead title={t('desk.patterns.title')} lede={t('desk.patterns.lede')} />

      {boards.length === 0 ? (
        <div className="mt-8 rounded-sharp border border-dashed border-hairline-strong px-5 py-6">
          <p className="text-17 font-medium text-ink">{t('desk.patterns.emptyTitle')}</p>
          <p className="mt-1 max-w-[62ch] text-15 text-ink-muted text-pretty">
            {t('desk.patterns.rule', { min: PATTERN_MIN_COUNT, outOf: PATTERN_MIN_OUT_OF })}
          </p>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          {boards.map((b) => (
            <section key={b.childId} aria-labelledby={`pattern-${b.childId}`} className="rounded-sharp border border-hairline-strong bg-surface">
              <h2 id={`pattern-${b.childId}`} className="border-b border-hairline px-5 pt-4 pb-3.5 text-20 font-medium tracking-[-0.02em] text-ink sm:px-[22px]">
                {b.firstName}
              </h2>
              {b.patterns.map((p) => (
                <PatternBlock key={`${p.segment}-${p.kind}`} p={p} clock={clock} />
              ))}
            </section>
          ))}
        </div>
      )}

      <p className="mt-6 max-w-[64ch] text-13 text-ink-muted text-pretty">
        {boards.length > 0 && t('desk.patterns.rule', { min: PATTERN_MIN_COUNT, outOf: PATTERN_MIN_OUT_OF })}{' '}
        {without.length > 0 && t('desk.patterns.none', { names: without.join(', ') })}
      </p>
    </div>
  );
}

function PatternBlock({ p, clock }: { p: PatternView; clock: DeskClock }) {
  const t = useT();
  const ctx = useDeskTime(clock);
  const segment = t(SEGMENT[p.segment] ?? 'desk.segment.transition');
  const sentence = t(p.kind === 'hard' ? 'desk.patterns.hard' : 'desk.patterns.break', { count: p.count, outOf: p.outOf, segment });
  const day = (iso: string) => dayLabel(new Date(iso), ctx);
  const went = p.services.filter((s) => s.moments.some((m) => m.kind === 'good'));
  const helped = [...new Set(went.flatMap((s) => s.moments.filter((m) => m.kind === 'good').flatMap((m) => m.helped)))];
  const newestFirst = [...p.services].reverse();

  return (
    <div className="border-b border-hairline px-5 pt-5 pb-6 last:border-b-0 sm:px-[22px]">
      <p className="text-20 leading-7 font-medium text-ink text-balance">{sentence}</p>

      {/* One mark per Sunday, oldest to newest. The sentence and the list below say the same in words. */}
      <ol aria-hidden className="mt-4 flex flex-wrap gap-x-2 gap-y-3">
        {p.services.map((s) => {
          const hit = s.moments.some((m) => m.kind === p.kind);
          const good = !hit && s.moments.some((m) => m.kind === 'good');
          return (
            <li key={s.serviceId} className="flex w-[52px] flex-col items-center gap-1.5">
              <span
                className={cx(
                  'flex size-9 items-center justify-center rounded-sharp border',
                  hit ? 'border-accent bg-accent text-on-accent' : good ? 'border-ok-line bg-ok-bg text-ok-ink' : 'border-hairline-strong bg-surface-2',
                )}
              >
                {good && <Icon name="check" size={13} />}
              </span>
              <span className="text-13 leading-4 whitespace-nowrap text-ink-muted tabular">{shortDay(s.startsAt, clock)}</span>
            </li>
          );
        })}
      </ol>

      {helped.length > 0 && (
        <p className="mt-4 max-w-[64ch] text-15 text-ok-ink text-pretty">
          {t(went.length === 1 ? 'desk.patterns.wentWellOne' : 'desk.patterns.wentWellMany', { count: went.length, segment, helped: helped.join(' · ') })}
        </p>
      )}

      <ol className="mt-4 border-t border-hairline">
        {newestFirst.flatMap((s) =>
          s.moments.length === 0
            ? [
                <li key={s.serviceId} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline py-2.5 last:border-b-0">
                  <span className="w-[8.5rem] shrink-0 text-15 text-ink-muted tabular">{day(s.startsAt)}</span>
                  <span className="text-15 text-ink-muted">{t('desk.patterns.nothingLogged')}</span>
                </li>,
              ]
            : s.moments.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline py-2.5 last:border-b-0">
                  <span className="w-[8.5rem] shrink-0 text-15 text-ink-2 tabular">{day(s.startsAt)}</span>
                  <span className="text-15 text-ink">{m.step}</span>
                  <KindPill kind={m.kind} />
                  {m.helped.length > 0 && (
                    <span className="text-15 text-ink-muted">
                      {t('desk.note.helped')} {m.helped.join(' · ')}
                    </span>
                  )}
                </li>
              )),
        )}
      </ol>
    </div>
  );
}

/** "Nov 15": the date alone, in the church's zone and the demo clock, for the marks. */
function shortDay(iso: string, clock: DeskClock): string {
  const d = new Date(Date.parse(iso) + clock.shiftMs);
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: clock.tz }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d);
  }
}
