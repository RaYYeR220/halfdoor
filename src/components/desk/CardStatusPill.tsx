'use client';
import type { CardStatus } from '@/lib/desk/types';
import type { MessageKey } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';

export const STATUS_LABEL: Record<CardStatus | 'none', MessageKey> = {
  parent_approved: 'desk.status.review',
  acknowledged: 'desk.status.reviewed',
  returned: 'desk.status.returned',
  draft: 'desk.status.draft',
  archived: 'desk.status.archived',
  none: 'desk.status.none',
};

/** A card's state in the director's words. The text carries the state; colour only backs it up. */
export function CardStatusPill({ status, size }: { status: CardStatus | 'none'; size?: 'sm' | 'md' }) {
  const t = useT();
  const label = t(STATUS_LABEL[status]);
  if (status === 'parent_approved') return <Pill tone="accent" size={size} dot>{label}</Pill>;
  if (status === 'acknowledged') return <Pill tone="ok" size={size} icon={<Icon name="check" size={12} />}>{label}</Pill>;
  if (status === 'returned') return <Pill tone="neutral" size={size} icon={<Icon name="reset" size={12} />}>{label}</Pill>;
  return <Pill tone="quiet" size={size}>{label}</Pill>;
}
