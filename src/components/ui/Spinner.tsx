import { cx } from '@/lib/cx';

type Props = { size?: number; className?: string; /** When set, the spinner is announced; otherwise it is decorative. */ label?: string };

/** A thin quarter-arc ring. Under reduced motion it stands still; the text next to it carries the state. */
export function Spinner({ size = 14, className, label }: Props) {
  return (
    <span role={label ? 'status' : undefined} className={cx('inline-flex shrink-0', className)}>
      <svg viewBox="0 0 16 16" width={size} height={size} fill="none" aria-hidden className="animate-spin">
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
        <path d="M8 1.75A6.25 6.25 0 0 1 14.25 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
