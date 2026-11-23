import { listAssignments } from '@/db/repo/assignments';
import { listCheckins } from '@/db/repo/checkins';
import { getChurch } from '@/db/repo/churches';
import { listHouseholdLinks } from '@/db/repo/people';
import { getServiceInChurch } from '@/db/repo/services';
import { closeStaleAccess } from '@/lib/access/read';
import type { Viewer } from '@/lib/auth/viewer';
import { refreshFromPco } from '@/lib/pco/hooks';
import type { CheckinStatus } from './types';

export const PCO_REFRESH_MS = 8_000;
const lastRefresh = new Map<string, number>();

/** For tests. */
export function resetHeartbeatThrottle(): void {
  lastRefresh.clear();
}

/** null = service is not in the viewer's church. */
export async function heartbeat(viewer: Viewer, serviceId: string, now: Date): Promise<{ now: string; checkins: CheckinStatus[] } | null> {
  const service = await getServiceInChurch(viewer.churchId, serviceId);
  if (!service) return null;
  const church = await getChurch(viewer.churchId);
  if (church && (church.mode === 'pco' || church.mode === 'live')) {
    const last = lastRefresh.get(church.id);
    if (last === undefined || now.getTime() - last >= PCO_REFRESH_MS) {
      lastRefresh.set(church.id, now.getTime());
      await refreshFromPco(service.id);
    }
  }
  await closeStaleAccess(viewer, now);

  let rows = await listCheckins(service.id);
  if (viewer.role === 'parent') {
    // A parent never sees other families' children or their pickup codes.
    const mine = new Set((await listHouseholdLinks(rows.map((r) => r.childId))).filter((l) => l.parentId === viewer.personId).map((l) => l.childId));
    rows = rows.filter((r) => mine.has(r.childId));
  }
  if (viewer.role === 'buddy') {
    // A buddy gets pickup codes only for the children assigned to them at this service.
    const mine = new Set((await listAssignments(service.id)).filter((a) => a.buddyId === viewer.personId).map((a) => a.childId));
    rows = rows.filter((r) => mine.has(r.childId));
  }
  // Newest row per child wins: a child may check out and back in.
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of [...rows].sort((a, b) => a.checkedInAt.getTime() - b.checkedInAt.getTime())) latest.set(r.childId, r);
  return {
    now: now.toISOString(),
    checkins: [...latest.values()].map((r) => ({ childId: r.childId, securityCode: r.securityCode, in: r.checkedOutAt === null })),
  };
}
