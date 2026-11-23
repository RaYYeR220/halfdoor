import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'md' | 'sm';

const BASE =
  'relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-pill font-medium ' +
  'transition-[background-color,border-color,color] duration-200 ease-out ' +
  'disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45';

const SIZES: Record<ButtonSize, string> = {
  md: 'h-11 px-5 text-15',
  // 36px to the eye, 44px to the finger.
  sm: "h-9 px-4 text-15 after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'border border-hairline-strong bg-surface text-ink hover:border-hairline-emphasis',
  quiet: 'text-ink-muted hover:bg-ground-edge hover:text-ink',
  danger: 'border border-danger-line bg-surface text-danger-ink hover:bg-danger-bg',
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) {
  return cx(BASE, SIZES[size], VARIANTS[variant], className);
}

type Common = { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; iconEnd?: ReactNode };

type ButtonProps = Common &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    /** Shows a spinner, keeps the label, and blocks clicks while an action runs. */
    pending?: boolean;
  };

export function Button({ variant, size, icon, iconEnd, pending, disabled, className, children, type, onClick, ...rest }: ButtonProps) {
  // Pending keeps full colour (it is working, not unavailable) but takes no clicks.
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled}
      aria-busy={pending || undefined}
      onClick={pending ? undefined : onClick}
      className={buttonClass(variant, size, cx(pending && 'pointer-events-none', className))}
      {...rest}
    >
      {pending ? <Spinner size={14} /> : icon}
      {children}
      {iconEnd}
    </button>
  );
}

type LinkProps = Common & ComponentProps<typeof Link>;

/** A link that looks like a button (navigation, not an action). */
export function ButtonLink({ variant, size, icon, iconEnd, className, children, ...rest }: LinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
      {iconEnd}
    </Link>
  );
}
