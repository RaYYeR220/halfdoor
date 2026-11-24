import type { Ref, TextareaHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: Ref<HTMLTextAreaElement>;
  /** Character counter under the box: visible "count / max", read as `label` (e.g. t('ui.counter', …)). */
  counter?: { count: number; max: number; label: string };
};

/** A writing box: 17px body text, generous line height, 2px corners. */
export function Textarea({ counter, className, rows = 6, ...rest }: Props) {
  const over = counter ? counter.count > counter.max : false;
  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        rows={rows}
        className={cx(
          'block w-full resize-y rounded-sharp border bg-surface px-4 py-3 text-17 leading-[1.6] text-ink',
          'placeholder:text-ink-muted-2 transition-[border-color] duration-200 ease-out',
          'border-hairline-strong hover:border-hairline-emphasis focus-visible:border-hairline-emphasis',
          'aria-[invalid=true]:border-danger-ink disabled:bg-surface-2 disabled:text-ink-muted',
          className,
        )}
        {...rest}
      />
      {counter && (
        <p className={cx('self-end text-13 tabular', over ? 'text-danger-ink' : 'text-ink-muted')}>
          <span aria-hidden>
            {counter.count.toLocaleString('en-US')} / {counter.max.toLocaleString('en-US')}
          </span>
          <span className="sr-only">{counter.label}</span>
        </p>
      )}
    </div>
  );
}
