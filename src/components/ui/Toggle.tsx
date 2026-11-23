import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
};

/** An on/off switch with its label (the whole row is the 44px target). Controlled. */
export function Toggle({ checked, onChange, label, description, disabled, className }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'group flex min-h-11 w-full items-center justify-between gap-4 text-left disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-15 font-medium text-ink">{label}</span>
        {description && <span className="text-13 text-ink-muted">{description}</span>}
      </span>
      <span
        aria-hidden
        className={cx(
          'relative inline-flex h-6 w-10 shrink-0 items-center rounded-pill border transition-[background-color,border-color] duration-200 ease-out',
          checked ? 'border-ink bg-ink' : 'border-hairline-emphasis bg-surface-2 group-hover:border-ink-muted',
        )}
      >
        <span
          className={cx(
            'absolute top-1/2 size-[18px] -translate-y-1/2 rounded-pill transition-[left,background-color] duration-200 ease-out',
            checked ? 'left-[19px] bg-surface' : 'left-[2px] bg-ink-muted',
          )}
        />
      </span>
    </button>
  );
}
