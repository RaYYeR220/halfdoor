// SERVER-ONLY. Today's matches for a buddy, and what the room view and the station start from. Tenant-scoped, one
// query at a time (the pooler's server pool is small). Card content is never read here: only the card's status.
import { listAssignments } from '@/db/repo/assignments';
import { getCardForChild } from '@/db/repo/cards';
import { listCheckins } from '@/db/repo/checkins';
import type { Church } from '@/db/repo/churches';
import { listPeople } from '@/db/repo/people';
import { listServices, type Service } from '@/db/repo/services';
import { isActiveAssignmentFor } from '@/lib/access/gate';
import { clockOf, upcomingServices } from '@/lib/desk/server';
import type { DeskClock } from '@/lib/desk/types';
import type { BuddyCardState, BuddyService, ChildName, LiveService, StationRow } from './types';

export const toLiveService = (s: Service): LiveService => ({
  id: s.id, label: s.label, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), room: s.room,
});

const cardState = (status: string | undefined): BuddyCardState =>
  status === 'acknowledged' ? 'ready' : status === undefined || status === 'archived' ? 'none' : 'waiting';

/** Today's services (as the desk plans them) where this buddy has an approved match, each with those children. */
export async function loadBuddyToday(church: Church, buddyId: string, now: Date, onlyService?: string): Promise<{ services: BuddyService[]; clock: DeskClock }> {
  const all = await listServices(church.id);
  const today = upcomingServices(church, all, now).filter((s) => !onlyService || s.id === onlyService);
  const people = new Map((await listPeople(church.id)).map((p) => [p.id, p]));
  const services: BuddyService[] = [];
  for (const s of today) {
    const mine = (await listAssignments(s.id)).filter((a) => isActiveAssignmentFor(a, buddyId, s.id));
    if (mine.length === 0) continue;
    const children = [];
    for (const a of mine) {
      const child = people.get(a.childId);
      if (!child || child.role !== 'child') continue;
      const card = await getCardForChild(church.id, child.id);
      children.push({ id: child.id, firstName: child.firstName, grade: child.grade ?? null, card: cardState(card?.status) });
    }
    children.sort((a, b) => a.firstName.localeCompare(b.firstName));
    if (children.length > 0) services.push({ ...toLiveService(s), children });
  }
  return { services, clock: clockOf(church, all, now) };
}

/** Today's services, the church's children by first name, and the clock: what the room view starts from. */
export async function loadRoomBase(church: Church, now: Date): Promise<{ services: LiveService[]; children: ChildName[]; clock: DeskClock }> {
  const all = await listServices(church.id);
  const children = (await listPeople(church.id))
    .filter((p) => p.role === 'child')
    .map((p) => ({ id: p.id, firstName: p.firstName, grade: p.grade ?? null }))
    .sort((a, b) => a.firstName.localeCompare(b.firstName));
  return { services: upcomingServices(church, all, now).map(toLiveService), children, clock: clockOf(church, all, now) };
}

/** The station: the room base plus each service's latest check-in per child. */
export async function loadStation(church: Church, now: Date): Promise<{ services: LiveService[]; children: ChildName[]; clock: DeskClock; rows: Record<string, StationRow[]> }> {
  const base = await loadRoomBase(church, now);
  const rows: Record<string, StationRow[]> = {};
  for (const s of base.services) {
    const latest = new Map<string, StationRow>();
    for (const r of [...(await listCheckins(s.id))].sort((a, b) => a.checkedInAt.getTime() - b.checkedInAt.getTime())) {
      latest.set(r.childId, {
        childId: r.childId, in: r.checkedOutAt === null, securityCode: r.securityCode,
        checkedInAt: r.checkedInAt.toISOString(), checkedOutAt: r.checkedOutAt?.toISOString() ?? null,
      });
    }
    rows[s.id] = [...latest.values()];
  }
  return { ...base, rows };
}
