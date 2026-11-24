// SERVER-ONLY. Patterns over a child's finished services (GET /api/patterns) and, for the desk, the moments
// behind each one. Plain counts, not AI. Tenant-scoped: only this church's services, and only ones already over.
import { listAssignmentsForChild } from '@/db/repo/assignments';
import { getCardForChild } from '@/db/repo/cards';
import type { Church } from '@/db/repo/churches';
import { listLessons } from '@/db/repo/lessons';
import { listMomentsForChild, type Moment } from '@/db/repo/moments';
import { listPeople } from '@/db/repo/people';
import { listServices, type Service } from '@/db/repo/services';
import type { CardItem } from '@/lib/card/schema';
import { openJson } from '@/lib/crypto/atrest';
import { stepsFor, type LessonStep } from '@/lib/note/server';
import { patterns, segmentOfStep, type Pattern } from '@/lib/patterns';
import type { ChildPatterns, PatternMoment, PatternView } from './types';

type Inputs = { patterns: Pattern[]; moments: Moment[]; services: Service[]; steps: Record<string, LessonStep[]> };

/** The child's attended, finished services in this church, their lesson steps, their moments, and the patterns. */
export async function patternInputs(churchId: string, childId: string, now: number): Promise<Inputs> {
  const moments = await listMomentsForChild(childId);
  const attended = new Set([
    ...moments.map((m) => m.serviceId),
    ...(await listAssignmentsForChild(childId)).filter((a) => a.status !== 'proposed').map((a) => a.serviceId),
  ]);
  const lessons = await listLessons(churchId);
  const services: Service[] = [];
  const steps: Record<string, LessonStep[]> = {};
  for (const s of await listServices(churchId)) {
    if (attended.has(s.id) && s.endsAt.getTime() <= now) {
      services.push(s);
      steps[s.id] = stepsFor(lessons, s);
    }
  }
  const rows = moments.filter((m) => m.stepKey && steps[m.serviceId]).map((m) => ({ id: m.id, stepKey: m.stepKey!, serviceId: m.serviceId, kind: m.kind }));
  return { patterns: patterns(rows, steps), moments, services, steps };
}

/**
 * For each child with at least one pattern: the pattern, and every service where the child had that segment
 * with what was logged in it (good moments included, and what helped, from the card). Children in name order.
 */
export async function loadPatternsBoard(church: Church, now: Date): Promise<ChildPatterns[]> {
  const children = (await listPeople(church.id)).filter((p) => p.role === 'child').sort((a, b) => a.firstName.localeCompare(b.firstName));
  const out: ChildPatterns[] = [];
  for (const child of children) {
    const input = await patternInputs(church.id, child.id, now.getTime());
    if (input.patterns.length === 0) continue;
    const card = await getCardForChild(church.id, child.id);
    const items = new Map((card ? openJson<CardItem[]>(church.wrappedDek, card.itemsEnc) : []).map((i) => [i.id, i.text]));
    const views: PatternView[] = input.patterns.map((p) => {
      const services = input.services
        .filter((s) => (input.steps[s.id] ?? []).some((st) => segmentOfStep(st) === p.segment))
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .map((s) => {
          const inSegment = new Map((input.steps[s.id] ?? []).filter((st) => segmentOfStep(st) === p.segment).map((st) => [st.key, st.label]));
          const moments: PatternMoment[] = input.moments
            .filter((m) => m.serviceId === s.id && m.stepKey && inSegment.has(m.stepKey))
            .map((m) => ({
              id: m.id,
              serviceId: s.id,
              at: m.at.toISOString(),
              step: inSegment.get(m.stepKey!) ?? m.stepKey!,
              kind: m.kind,
              helped: (m.helpedItemIds ?? []).flatMap((id) => (items.has(id) ? [items.get(id)!] : [])),
            }));
          return { serviceId: s.id, startsAt: s.startsAt.toISOString(), moments };
        });
      return { ...p, services };
    });
    out.push({ childId: child.id, firstName: child.firstName, patterns: views });
  }
  return out;
}
