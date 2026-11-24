// SERVER-ONLY. Builds solver inputs from the DB for one service and runs it (never sees card text, only support level and tags).
import { listAssignmentsInChurch, replaceProposed } from '@/db/repo/assignments';
import { listBlockouts } from '@/db/repo/blockouts';
import { listCards } from '@/db/repo/cards';
import { listCheckinsInChurch } from '@/db/repo/checkins';
import { listPeople } from '@/db/repo/people';
import type { Service } from '@/db/repo/services';
import type { Tag } from '@/lib/card/schema';
import { isBusyInPco } from '@/lib/pco/hooks';
import { explainGap } from './rules';
import { solve } from './solve';
import type { Skill, SolverBuddy, SolverChild } from './types';

const SKILLS: readonly Skill[] = ['aac', 'medical', 'es'];

const WEEK = 7 * 24 * 3600_000;
/** A child counts as a regular of a service slot if they checked in at the same-labelled service in the last 5 weeks. */
export const ATTENDANCE_WINDOW = 5 * WEEK + 24 * 3600_000;
export const NEW_FAMILY_NOTE = 'New family — confirm which service';

export async function solveService(churchId: string, service: Service, includeChildIds: string[] = []) {
  // Sequential on purpose: parallel reads through the small pooler pool can stall it.
  const people = await listPeople(churchId);
  const cards = await listCards(churchId);
  const all = await listAssignmentsInChurch(churchId);
  const blockouts = await listBlockouts(churchId);
  const checkins = await listCheckinsInChurch(churchId);
  const settled = all.filter((a) => a.status !== 'proposed');
  const decidedHere = new Set(settled.filter((a) => a.serviceId === service.id).map((a) => a.childId));

  // Last 3 approved services before this one, most recent first.
  const history = (childId: string) =>
    settled
      .filter((a) => a.childId === childId && a.serviceId !== service.id && a.startsAt.getTime() < service.startsAt.getTime())
      .sort((x, y) => y.startsAt.getTime() - x.startsAt.getTime())
      .slice(0, 3)
      .map((a) => a.buddyId);

  const cardOf = new Map(cards.map((c) => [c.childId, c]));
  const regulars = new Set(checkins
    .filter((c) => c.label === service.label && c.startsAt.getTime() <= service.startsAt.getTime() && service.startsAt.getTime() - c.startsAt.getTime() <= ATTENDANCE_WINDOW)
    .map((c) => c.childId));
  const everCheckedIn = new Set(checkins.map((c) => c.childId));
  const forced = new Set(includeChildIds);
  const children: SolverChild[] = [];
  const notExpected: { childId: string; name: string }[] = [];
  const newFamily = new Set<string>();
  const waitingForReview: { childId: string; name: string }[] = [];
  for (const p of people.filter((x) => x.role === 'child')) {
    const card = cardOf.get(p.id);
    if (!card || !card.supportLevel || card.supportLevel === 'none') continue;
    // A card waiting for review is listed only where the child is expected, like everyone else: a regular of this
    // service, a family with no check-in history yet, or a child the director added by hand.
    const expected = !everCheckedIn.has(p.id) || regulars.has(p.id) || forced.has(p.id);
    if (card.status === 'parent_approved') {
      if (expected) waitingForReview.push({ childId: p.id, name: p.firstName });
      continue;
    }
    if (card.status !== 'acknowledged' || decidedHere.has(p.id)) continue;
    if (!everCheckedIn.has(p.id)) newFamily.add(p.id); // no history anywhere: expected at every service
    else if (!expected) { notExpected.push({ childId: p.id, name: p.firstName }); continue; }
    children.push({
      id: p.id, name: p.firstName, supportLevel: card.supportLevel, tags: card.tags as Tag[], gender: p.gender, lastBuddyIds: history(p.id),
    });
  }

  const overlaps = (x: { startsAt: Date; endsAt: Date }) =>
    x.startsAt.getTime() < service.endsAt.getTime() && service.startsAt.getTime() < x.endsAt.getTime();
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  /** Halfdoor assignment, then Planning Center blockout, then (later) PCO Services scheduling. */
  const busyWhy = async (buddy: { id: string; pcoPersonId: string | null }): Promise<string | null> => {
    if (settled.some((a) => a.buddyId === buddy.id && overlaps(a))) return 'already scheduled';
    const block = blockouts.find((x) => x.personId === buddy.id && overlaps(x));
    if (block) return block.reason ? lower(block.reason) : 'blocked out';
    return (await isBusyInPco(churchId, buddy.pcoPersonId, service.startsAt, service.endsAt)) ? 'scheduled elsewhere in Planning Center' : null;
  };
  const buddies: SolverBuddy[] = [];
  for (const p of people.filter((x) => x.role === 'buddy')) {
    const why = await busyWhy(p);
    buddies.push({
      id: p.id, name: p.firstName, gender: p.gender,
      skills: [...new Set([...p.skills, ...p.langs])].filter((s): s is Skill => (SKILLS as readonly string[]).includes(s)),
      trainingAt: p.inclusionTrainingAt, backgroundExpiresAt: p.backgroundExpiresAt,
      busy: why !== null, busyReason: why,
    });
  }

  const result = solve({ serviceDate: service.startsAt, children, buddies });
  const rows = await replaceProposed(service.id, result.assignments.map((a) => ({
    serviceId: service.id, childId: a.childId, buddyId: a.buddyId, status: 'proposed' as const, reasons: a.reasons,
  })));

  const nameOf = new Map(people.map((p) => [p.id, p.firstName]));
  return {
    assignments: rows.map((r) => ({
      id: r.id, childId: r.childId, childName: nameOf.get(r.childId) ?? '', buddyId: r.buddyId,
      buddyName: nameOf.get(r.buddyId) ?? '', status: r.status,
      reasons: [...(r.reasons as string[]), ...(newFamily.has(r.childId) ? [NEW_FAMILY_NOTE] : [])],
    })),
    unassigned: result.unassigned.map((u) => {
      const child = children.find((c) => c.id === u.childId)!;
      return { childId: u.childId, childName: child.name, hints: explainGap(child, u, buddies, service.label) };
    }),
    waitingForReview,
    notExpected: notExpected.sort((a, b) => a.name.localeCompare(b.name)),
    newFamily: children.filter((c) => newFamily.has(c.id)).map((c) => ({ childId: c.id, name: c.name, note: NEW_FAMILY_NOTE })),
  };
}
