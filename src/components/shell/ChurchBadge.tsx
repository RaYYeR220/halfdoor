'use client';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n/client';
import { Pill } from '@/components/ui/Pill';

/** The church's name, and on every sandbox page the "fictional church, sample data" label. */
export function ChurchBadge({ name, sandbox, className }: { name: string; sandbox: boolean; className?: string }) {
  const t = useT();
  return (
    <div className={cx('flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5', className)}>
      <span className="truncate text-15 font-medium text-ink">{name}</span>
      {sandbox && (
        <Pill tone="quiet" size="sm">
          {t('shell.fictional')}
        </Pill>
      )}
    </div>
  );
}
