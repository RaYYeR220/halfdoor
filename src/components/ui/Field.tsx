import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon } from './Icon';

/** Props the control inside a Field must spread so its label, hint and error are wired up. */
export type FieldControlProps = { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true };

type Props = {
  id: string;
  label: ReactNode;
  /** Shown after the label, e.g. t('ui.optional'). */
  optionalLabel?: string;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
};

/** Label, hint and error around one control. The control gets its id and aria wiring from the render prop. */
export function Field({ id, label, optionalLabel, hint, error, className, children }: Props) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-15 font-medium text-ink">
        {label}
        {optionalLabel && <span className="ml-1.5 font-normal text-ink-muted">({optionalLabel})</span>}
      </label>
      {hint && (
        <p id={hintId} className="-mt-1 max-w-[62ch] text-15 text-ink-muted text-pretty">
          {hint}
        </p>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error && (
        <p id={errorId} className="flex items-start gap-2 text-15 text-danger-ink">
          <Icon name="alert" className="mt-1 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
