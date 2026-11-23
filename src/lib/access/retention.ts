import { getCardForChild, updateCard } from '@/db/repo/cards';

export const RETENTION_MS = 365 * 24 * 3600_000;

/** Retention follows attendance: every check-in (station, later PCO) pushes retain_until to at least at + 12 months. */
export async function bumpRetention(churchId: string, childId: string, at: Date): Promise<void> {
  const card = await getCardForChild(churchId, childId);
  if (!card) return;
  const target = at.getTime() + RETENTION_MS;
  if (card.retainUntil && card.retainUntil.getTime() >= target) return;
  await updateCard(card.id, { retainUntil: new Date(target) });
}
