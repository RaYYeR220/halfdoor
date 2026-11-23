// SERVER-ONLY. Builds solver inputs from the DB for one service and runs it (never sees card text, only support level and tags).
import { listAssignmentsInChurch, replaceProposed } from '@/db/repo/assignments';
import { listCards } from '@/db/repo/cards';
import { listPeople } from '@/db/repo/people';
import type { Service } from '@/db/repo/services';
import type { Tag } from '@/lib/card/schema';
import { isBusyInPco } from '@/lib/pco/hooks';
import { explainGap } from './rules';
import { solve } from './solve';
import type { Skill, SolverBuddy, SolverChild } from './types';

const SKILLS: readonly Skill[] = ['aac', 'medical', 'es'];

export async function solveService(churchId: string, service: Service) {
  const [people, cards, all] = await Promise.all([listPeople(churchId), listCards(churchId), listAssignmentsInChurch(churchId)]);
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
  const children: SolverChild[] = [];
  const waitingForReview: { childId: string; name: string }[] = [];
  for (const p of people.filter((x) => x.role === 'child')) {
    const card = cardOf.get(p.id);
    if (!card || !card.supportLevel || card.supportLevel === 'none') continue;
    if (card.status === 'parent_approved') { waitingForReview.push({ childId: p.id, name: p.firstName }); continue; }
    if (card.status !== 'acknowledged' || decidedHere.has(p.id)) continue;
    children.push({
      id: p.id, name: p.firstName, supportLevel: card.supportLevel, tags: card.tags as Tag[], gender: p.gender, lastBuddyIds: history(p.id),
    });
  }

  const busyHere = (buddyId: string) => settled.some((a) =>
    a.buddyId === buddyId && a.startsAt.getTime() < service.endsAt.getTime() && service.startsAt.getTime() < a.endsAt.getTime());
  const buddies: SolverBuddy[] = [];
  for (const p of people.filter((x) => x.role === 'buddy')) {
    buddies.push({
      id: p.id, name: p.firstName, gender: p.gender,
      skills: [...new Set([...p.skills, ...p.langs])].filter((s): s is Skill => (SKILLS as readonly string[]).includes(s)),
      trainingAt: p.inclusionTrainingAt, backgroundExpiresAt: p.backgroundExpiresAt,
      busy: busyHere(p.id) || (await isBusyInPco(churchId, p.pcoPersonId, service.startsAt, service.endsAt)),
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
      buddyName: nameOf.get(r.buddyId) ?? '', status: r.status, reasons: r.reasons as string[],
    })),
    unassigned: result.unassigned.map((u) => {
      const child = children.find((c) => c.id === u.childId)!;
      return { childId: u.childId, childName: child.name, hints: explainGap(child, u.gapHints, buddies, service.label) };
    }),
    waitingForReview,
  };
}
