import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Toggle chips set this; it drives aria-pressed and the rose "on" look. */
  pressed?: boolean;
  icon?: ReactNode;
};

/**
 * A small tappable choice (prompt hints, "what helped" chips). 30px tall like the landing's status chip,
 * with an invisible 44px hit area. Static labels use Pill instead.
 */
export function Chip({ pressed, icon, className, children, type, ...rest }: Props) {
  return (
    <button
      type={type ?? 'button'}
      aria-pressed={pressed}
      className={cx(
        "relative inline-flex h-[30px] shrink-0 items-center gap-[7px] whitespace-nowrap rounded-pill border pl-[11px] pr-[13px] text-13 font-medium",
        "transition-[background-color,border-color,color] duration-200 ease-out after:absolute after:inset-x-0 after:-inset-y-[7px] after:content-['']",
        'disabled:opacity-45',
        pressed
          ? 'border-accent-line bg-accent-tint text-accent-ink'
          : 'border-hairline-strong bg-surface-2 text-ink hover:border-hairline-emphasis',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
