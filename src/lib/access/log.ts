// SERVER-ONLY. The parent-facing access log, with lazy closing of sessions whose window has ended.
import { closeAccess, listAccessForChild, type AccessEntry } from '@/db/repo/access';
import { getPersonInChurch } from '@/db/repo/people';
import { getServiceInChurch } from '@/db/repo/services';
import { WINDOW_MS } from './gate';

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
