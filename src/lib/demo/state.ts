// SERVER-ONLY. Progress through the demo guide's seven steps, read from the sandbox church's own rows.
// Every read is scoped to the church: Sam is looked up among its people, services among its services.
import { listAccessForChild } from '@/db/repo/access';
import { listAssignmentsForChild } from '@/db/repo/assignments';
import { getCardForChild } from '@/db/repo/cards';
import { listCheckinsInChurch } from '@/db/repo/checkins';
import { listNotesForChild } from '@/db/repo/notes';
import { listPeople } from '@/db/repo/people';
import { listServices } from '@/db/repo/services';
import { EMPTY_DEMO_STATE, type DemoState } from './flags';

export { DEMO_STEP_FLAGS, EMPTY_DEMO_STATE, type DemoFlags, type DemoState } from './flags';

const HOUR = 3600_000;
/**
 * "Today" in a sandbox: its two services start 5 min before and 115 min after it was made, and it lives 24 h.
 * Its past Sundays are whole weeks back, so +/-36 h holds today's services and nothing else.
 */
const TODAY_SPAN = 36 * HOUR;

export async function readDemoState(churchId: string, now: Date = new Date()): Promise<DemoState> {
  // One query at a time: the guide polls this every few seconds and the pooler's server pool is small.
  const people = await listPeople(churchId);
  const sam = people.find((p) => p.role === 'child' && p.firstName === 'Sam');
  if (!sam) return { ...EMPTY_DEMO_STATE };

  const today = (await listServices(churchId))
    .filter((s) => Math.abs(s.startsAt.getTime() - now.getTime()) <= TODAY_SPAN)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const todayIds = new Set(today.map((s) => s.id));

  const card = await getCardForChild(churchId, sam.id);
  const assignments = await listAssignmentsForChild(sam.id);
  const checkins = await listCheckinsInChurch(churchId);
  const access = await listAccessForChild(sam.id);
  const notes = await listNotesForChild(sam.id);

  const approvedToday = assignments
    .filter((a) => todayIds.has(a.serviceId) && (a.status === 'approved' || a.status === 'scheduled_in_pco'))
    .sort((a, b) => today.findIndex((s) => s.id === a.serviceId) - today.findIndex((s) => s.id === b.serviceId));
  const buddyId = approvedToday[0]?.buddyId ?? null;
  const samCheckins = checkins.filter((c) => c.childId === sam.id && todayIds.has(c.serviceId));

  return {
    samCardApproved: card?.status === 'parent_approved' || card?.status === 'acknowledged',
    samCardAcknowledged: card?.status === 'acknowledged',
    samAssignedApproved: approvedToday.length > 0,
    samCheckedIn: samCheckins.length > 0,
    samCardOpenedByBuddy: access.some((e) => e.role === 'buddy' && e.reason === 'checked_in'),
    samCheckedOut: samCheckins.some((c) => c.checkedOutAt !== null),
    samNoteApproved: notes.some((n) => n.status === 'approved'),
    samBuddyId: buddyId,
    samBuddyName: people.find((p) => p.id === buddyId)?.firstName ?? null,
  };
}
