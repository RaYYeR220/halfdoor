// The card while it is locked: its silhouette, not a smear. Section names stay readable and every line is a neat
// masked bar. The silhouette is the same five sections for every child (it says nothing about what the card holds);
// bar lengths vary per child only so two locked cards don't look stamped.
import type { MessageKey } from '@/lib/i18n';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n/client';
import { Icon } from '@/components/ui/Icon';

const ROWS: readonly { key: MessageKey; bars: number; safety?: true }[] = [
  { key: 'buddy.safety.title', bars: 2, safety: true },
  { key: 'card.section.loves', bars: 1 },
  { key: 'card.section.hard', bars: 1 },
  { key: 'card.section.helps', bars: 2 },
  { key: 'card.section.signs', bars: 2 },
];
const WIDTHS = [88, 54, 72, 46, 80, 62, 94, 58, 68, 41];

/** Stable pseudo-random bar widths from the child's id. */
function widths(seed: string, n: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: n }, (_, i) => WIDTHS[(h + i * 7) % WIDTHS.length]);
}

type Props = {
  childId: string;
  /** Why it is locked, in a sentence ("Opens on this phone when Leo is checked in…"). */
  message: string;
  /** Pickup code to show under the message (checked in, but the gate still says no). */
  code?: string | null;
  /** Settle in with the lock motion (just locked at checkout); otherwise appear still. */
  settle?: boolean;
};

export function LockedCard({ childId, message, code, settle }: Props) {
  const t = useT();
  const total = ROWS.reduce((n, r) => n + r.bars, 0);
  const w = widths(childId, total);
  const starts = ROWS.map((_, i) => ROWS.slice(0, i).reduce((n, r) => n + r.bars, 0));
  return (
    <div className={cx(settle && 'animate-relock')}>
      <div aria-hidden className="select-none px-4 pt-1 pb-2 sm:px-5">
        {ROWS.map((r, i) => {
          const bars = w.slice(starts[i], starts[i] + r.bars);
          return (
            <div
              key={r.key}
              className={cx(
                'grid grid-cols-[5.75rem_minmax(0,1fr)] items-start gap-x-4 py-3',
                r.safety ? '-mx-4 border-b border-danger-line bg-danger-bg px-4 sm:-mx-5 sm:px-5' : 'border-b border-hairline last:border-b-0',
              )}
            >
              <span className={cx('flex items-center gap-1.5 text-15 leading-5', r.safety ? 'font-medium text-danger-ink' : 'text-ink-muted')}>
                {r.safety && <Icon name="alert" size={13} />}
                {t(r.key)}
              </span>
              <span className="flex flex-col gap-[9px] pt-1.5">
                {bars.map((pct, i) => (
                  <span key={i} className={cx('block h-[9px] rounded-sharp', r.safety ? 'bg-danger-line' : 'bg-hairline')} style={{ width: `${pct}%` }} />
                ))}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-start gap-2.5 border-t border-hairline bg-surface-2 px-4 py-3.5 sm:px-5">
        <Icon name="lock" size={14} className="mt-[4px] shrink-0 text-ink-muted" />
        <div className="min-w-0">
          <p className="text-15 text-ink-2 text-pretty">{message}</p>
          {code && (
            <p className="mt-1 text-13 text-ink-muted">
              {t('room.code')}{' '}
              <span className="font-mono text-15 font-medium tracking-[0.08em] text-ink">{code}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
