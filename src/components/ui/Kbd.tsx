import type { HTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

/** A key name (Esc, ↑ ↓) in hints. */
export function Kbd({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cx(
        'inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-sharp border border-hairline-strong bg-surface px-1.5 font-sans text-13 leading-none font-medium text-ink-muted',
        className,
      )}
      {...rest}
    >
      {children}
    </kbd>
  );
}
