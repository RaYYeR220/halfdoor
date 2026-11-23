import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Props = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  as?: 'div' | 'section' | 'article' | 'li';
  /** Header row, the landing's product-fragment head: bold title, muted context. */
  title?: ReactNode;
  /** Right side of the header: a pill, a time, an action. */
  aside?: ReactNode;
  /** 'none' for cards whose rows run edge to edge. */
  padding?: 'md' | 'none';
};

/** White panel, 1px hairline, 2px corners, no shadow. */
export function Card({ as: Tag = 'div', title, aside, padding = 'md', className, children, ...rest }: Props) {
  const pad = padding === 'md' ? 'px-4 pt-4 pb-5 sm:px-[22px] sm:pt-[18px]' : '';
  return (
    <Tag className={cx('rounded-sharp border border-hairline-strong bg-surface', pad, className)} {...rest}>
      {(title || aside) && (
        <div
          className={cx(
            'mb-4 flex min-h-7 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline pb-[13px] text-15 text-ink-muted',
            padding === 'none' && 'px-4 pt-4 sm:px-[22px] sm:pt-[18px]',
          )}
        >
          <div className="min-w-0 [&_b]:font-medium [&_b]:text-ink">{title}</div>
          {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}
