import { deleteCardData, listExpiredCards } from '@/db/repo/cards';

/** Deletes cards past retain_until (called on page loads; no cron). Returns how many were removed. */
export async function purgeExpiredCards(now: Date = new Date()): Promise<number> {
  const expired = await listExpiredCards(now);
  let n = 0;
  for (const card of expired) if (await deleteCardData(card, { personId: null, role: 'system' }, now)) n++;
  return n;
}
