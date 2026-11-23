import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

export type PillTone = 'neutral' | 'quiet' | 'accent' | 'ok' | 'danger';

const TONES: Record<PillTone, string> = {
  neutral: 'border-hairline-strong text-ink',
  quiet: 'border-hairline-strong text-ink-muted',
  accent: 'border-accent-line bg-accent-tint text-accent-ink',
  ok: 'border-ok-line bg-ok-bg text-ok-ink',
  danger: 'border-danger-line bg-danger-bg text-danger-ink',
};

const DOTS: Record<PillTone, string> = {
  neutral: 'bg-ink-muted',
  quiet: 'bg-ink-muted',
  accent: 'bg-accent',
  ok: 'bg-ok-ink',
  danger: 'bg-danger-ink',
};

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: PillTone;
  /** 'sm' (24px) for pills inside dense rows such as the top bar. */
  size?: 'md' | 'sm';
  /** A 7px status dot before the label. */
  dot?: boolean;
  icon?: ReactNode;
};

/** A static status label: card status, "Fictional church · sample data", "Unlocked · checked in 9:02". */
export function Pill({ tone = 'neutral', size = 'md', dot, icon, className, children, ...rest }: Props) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-[7px] whitespace-nowrap rounded-pill border text-13 font-medium tabular',
        size === 'sm' ? 'h-6 px-2.5' : 'h-7 px-3',
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span aria-hidden className={cx('size-[7px] shrink-0 rounded-pill', DOTS[tone])} />}
      {icon}
      {children}
    </span>
  );
}
