// SERVER-ONLY. The parent-facing access log, with lazy closing of sessions whose window has ended.
import { closeAccess, insertAccess, listAccessForChild, type AccessEntry } from '@/db/repo/access';
import { getPersonInChurch } from '@/db/repo/people';
import { getServiceInChurch } from '@/db/repo/services';
import { startOfZonedDay } from '@/lib/time/zoned';
import { WINDOW_MS } from './gate';

/** Whether this viewer already has a read of this kind logged today (church time zone). */
export function loggedToday(
  entries: readonly Pick<AccessEntry, 'viewerId' | 'reason' | 'openedAt'>[], viewerId: string, reason: 'parent' | 'director', now: Date, tz: string,
): boolean {
  const since = startOfZonedDay(now, tz).getTime();
  return entries.some((e) => e.viewerId === viewerId && e.reason === reason && e.openedAt.getTime() >= since);
}

/**
 * A director's read that decrypts a child's card text outside the card drawer (the patterns board's "what helped",
 * the note-home context). Logged like a drawer read, at most once per director, child and day, so the family sees
 * "Hannah read Leo's card" without a row per page load.
 */
export async function logDirectorRead(church: { tz: string }, directorId: string, card: { id: string; childId: string }, now: Date): Promise<void> {
  if (loggedToday(await listAccessForChild(card.childId), directorId, 'director', now, church.tz)) return;
  await insertAccess({
    cardId: card.id, childId: card.childId, serviceId: null, viewerId: directorId, role: 'director', reason: 'director', openedAt: now, closedAt: now,
  });
}

/** null = not a child of this church. An open buddy/leader entry past its service window is closed at the window end. */
export async function readAccessLog(churchId: string, childId: string, now: Date): Promise<AccessEntry[] | null> {
  const child = await getPersonInChurch(churchId, childId);
  if (!child || child.role !== 'child') return null;
  const entries = await listAccessForChild(childId);
  for (const e of entries) {
    if (e.closedAt || !e.serviceId) continue;
    const service = await getServiceInChurch(churchId, e.serviceId);
    if (!service) continue;
    const windowEnd = new Date(service.endsAt.getTime() + WINDOW_MS);
    if (now.getTime() > windowEnd.getTime()) {
      await closeAccess([e.id], windowEnd);
      e.closedAt = windowEnd;
    }
  }
  return entries;
}
