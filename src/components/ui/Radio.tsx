import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export type RadioOption<V extends string> = { value: V; label: ReactNode; description?: ReactNode };

type Props<V extends string> = {
  name: string;
  legend: ReactNode;
  hint?: ReactNode;
  options: readonly RadioOption<V>[];
  /** Controlled (with onChange) or uncontrolled via defaultValue, for plain form posts. */
  value?: V;
  defaultValue?: V;
  onChange?: (value: V) => void;
  disabled?: boolean;
  className?: string;
};

/** A radio group of full-width rows (each at least 44px tall), native inputs underneath. */
export function Radio<V extends string>({ name, legend, hint, options, value, defaultValue, onChange, disabled, className }: Props<V>) {
  const hintId = hint ? `${name}-hint` : undefined;
  return (
    <fieldset className={cx('min-w-0', className)} aria-describedby={hintId} disabled={disabled}>
      <legend className="text-15 font-medium text-ink">{legend}</legend>
      {hint && (
        <p id={hintId} className="mt-1 text-15 text-ink-muted">
          {hint}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-2">
        {options.map((o) => {
          const id = `${name}-${o.value}`;
          return (
            <label
              key={o.value}
              htmlFor={id}
              className={cx(
                'flex min-h-11 cursor-pointer items-start gap-3 rounded-sharp border bg-surface px-4 py-3',
                'transition-[border-color,background-color] duration-200 ease-out',
                'border-hairline-strong hover:border-hairline-emphasis has-checked:border-ink',
                'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus',
                'has-disabled:cursor-not-allowed has-disabled:opacity-60',
              )}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={o.value}
                checked={value === undefined ? undefined : value === o.value}
                defaultChecked={value === undefined ? defaultValue === o.value : undefined}
                onChange={onChange ? () => onChange(o.value) : undefined}
                className={cx(
                  'mt-[3px] size-[18px] shrink-0 appearance-none rounded-pill border border-hairline-emphasis bg-surface',
                  'transition-[border-width,border-color] duration-150 ease-out checked:border-[5.5px] checked:border-ink',
                  'focus-visible:outline-none',
                )}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-17 leading-6 text-ink">{o.label}</span>
                {o.description && <span className="text-15 text-ink-muted">{o.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
