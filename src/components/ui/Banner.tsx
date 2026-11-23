import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';

export type BannerTone = 'neutral' | 'safety' | 'ok' | 'accent';

const TONES: Record<BannerTone, { box: string; icon: IconName | null }> = {
  neutral: { box: 'border-hairline-strong bg-surface text-ink', icon: null },
  // Safety lines: red ink on pale red (AA), always above everything else on a card.
  safety: { box: 'border-danger-line bg-danger-bg text-danger-ink', icon: 'alert' },
  ok: { box: 'border-ok-line bg-ok-bg text-ok-ink', icon: 'check' },
  accent: { box: 'border-accent-line bg-accent-tint text-accent-ink', icon: null },
};

type Props = {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** 'alert' only for something that just went wrong; 'status' for a state that just changed. */
  role?: 'alert' | 'status' | 'note';
  icon?: IconName | null;
  className?: string;
};

/** A full-width message block. The words carry the meaning; colour only backs them up. */
export function Banner({ tone = 'neutral', title, children, action, role, icon, className }: Props) {
  const glyph = icon === undefined ? TONES[tone].icon : icon;
  return (
    <div role={role} className={cx('flex flex-wrap items-start gap-x-3 gap-y-2.5 rounded-sharp border px-4 py-3', TONES[tone].box, className)}>
      {glyph && <Icon name={glyph} size={16} className="mt-[3px] shrink-0" />}
      {/* On a phone the action drops under the text instead of squeezing it. */}
      <div className="min-w-0 flex-1 basis-[16rem]">
        {title && <p className="text-15 font-semibold">{title}</p>}
        {children && <div className={cx('text-15 text-pretty', !!title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
