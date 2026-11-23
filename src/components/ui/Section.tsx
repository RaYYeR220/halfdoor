import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Props = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** h1 for a page head, h2 for sections within it. */
  level?: 1 | 2 | 3;
  /** A hairline above, for sections after the first. */
  divided?: boolean;
};

const HEADINGS = {
  1: 'text-32 font-medium text-ink',
  2: 'text-24 font-medium text-ink',
  3: 'text-20 font-medium tracking-[-0.02em] text-ink',
} as const;

/** A titled block of a page: heading, one-line description, actions on the right. */
export function Section({ title, description, actions, level = 2, divided, className, children, id, ...rest }: Props) {
  const H = `h${level}` as const;
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cx(divided && 'mt-10 border-t border-hairline pt-8', className)}
      {...rest}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 max-w-[68ch]">
          <H id={headingId} className={cx(HEADINGS[level], 'text-balance')}>
            {title}
          </H>
          {description && <p className="mt-2 text-15 text-ink-muted text-pretty sm:text-17">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-6">{children}</div>}
    </section>
  );
}
