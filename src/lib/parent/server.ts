// SERVER-ONLY. Everything the parent page shows for one child, read tenant-scoped and one query at a time
// (the pooler's server pool is small). The raw story is never stored, so it is never read here.
import type { AccessEntry } from '@/db/repo/access';
import { listAssignmentsForChild } from '@/db/repo/assignments';
import { getCardForChild } from '@/db/repo/cards';
import type { Church } from '@/db/repo/churches';
import { listNotesForChild } from '@/db/repo/notes';
import { listPeople, type Person } from '@/db/repo/people';
import { listServices, type Service } from '@/db/repo/services';
import { readAccessLog } from '@/lib/access/log';
import { buildCardView } from '@/lib/card/view';
import { demoClockShift } from '@/lib/demo/clock';
import { openJson } from '@/lib/crypto/atrest';
import type { AccessRow, ChildPageData, MatchInfo, NoteView } from './types';

const REASONS = new Set<AccessRow['reason']>(['checked_in', 'director', 'parent', 'room_safety', 'deleted']);

/** Log rows with first names instead of ids. `viewerId` marks the viewer's own rows. */
export function toAccessRows(entries: readonly AccessEntry[], people: readonly Pick<Person, 'id' | 'firstName'>[], viewerId: string): AccessRow[] {
  const names = new Map(people.map((p) => [p.id, p.firstName]));
  return entries
    .filter((e) => REASONS.has(e.reason as AccessRow['reason']))
    .map((e) => ({
      id: e.id,
      who: e.viewerId ? (names.get(e.viewerId) ?? null) : null,
      me: !!e.viewerId && e.viewerId === viewerId,
      role: e.role,
      reason: e.reason as AccessRow['reason'],
      openedAt: e.openedAt.toISOString(),
      closedAt: e.closedAt?.toISOString() ?? null,
    }))
    .sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
}

/** The next approved assignment that has not ended, else the most recent past one. */
export function pickMatch(
  assignments: readonly { serviceId: string; buddyId: string; status: string }[],
  services: readonly Pick<Service, 'id' | 'label' | 'startsAt' | 'endsAt'>[],
  people: readonly Pick<Person, 'id' | 'firstName'>[],
  now: Date,
): MatchInfo | null {
  const byId = new Map(services.map((s) => [s.id, s]));
  const rows = assignments
    .filter((a) => a.status === 'approved' || a.status === 'scheduled_in_pco')
    .flatMap((a) => {
      const s = byId.get(a.serviceId);
      return s ? [{ a, s }] : []; // assignments of services outside this church never show
    });
  const upcoming = rows.filter((r) => r.s.endsAt.getTime() >= now.getTime()).sort((x, y) => x.s.startsAt.getTime() - y.s.startsAt.getTime())[0];
  const past = rows.sort((x, y) => y.s.startsAt.getTime() - x.s.startsAt.getTime())[0];
  const pick = upcoming ?? past;
  if (!pick) return null;
  return {
    buddy: people.find((p) => p.id === pick.a.buddyId)?.firstName ?? null,
    serviceLabel: pick.s.label,
    startsAt: pick.s.startsAt.toISOString(),
  };
}

export async function loadChildPage(church: Church, child: Person, viewerId: string, now: Date): Promise<ChildPageData> {
  const row = await getCardForChild(church.id, child.id);
  const card = row ? buildCardView(row, child.firstName, church.wrappedDek, 'parent', 'full') : null;
  const entries = (await readAccessLog(church.id, child.id, now)) ?? [];
  const people = await listPeople(church.id);
  const services = await listServices(church.id);
  const assignments = await listAssignmentsForChild(child.id);
  const notes = (await listNotesForChild(child.id)).filter((n) => n.status === 'approved');

  const serviceById = new Map(services.map((s) => [s.id, s]));
  const noteViews: NoteView[] = notes
    .flatMap((n) => {
      const s = serviceById.get(n.serviceId);
      if (!s) return [];
      const sentences = openJson<{ text: string }[]>(church.wrappedDek, n.draftEnc).map((x) => x.text);
      return [{ id: n.id, serviceLabel: s.label, serviceStartsAt: s.startsAt.toISOString(), approvedAt: n.approvedAt?.toISOString() ?? null, sentences }];
    })
    .sort((a, b) => Date.parse(b.serviceStartsAt ?? '') - Date.parse(a.serviceStartsAt ?? ''));

  return {
    child: { id: child.id, firstName: child.firstName, gender: child.gender ?? null },
    card,
    match: pickMatch(assignments, services, people, now),
    access: toAccessRows(entries, people, viewerId),
    notes: noteViews,
    tz: church.tz,
    now: now.toISOString(),
    clockShiftMs: church.mode === 'sandbox' ? demoClockShift(services, now, church.tz) : 0,
  };
}
