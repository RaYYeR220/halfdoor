import type { MomentKind } from '@/lib/note/schema';
import { SEGMENTS, type Segment } from '@/lib/schedule/segments';

export const PATTERN_MIN_COUNT = 3;
export const PATTERN_MIN_OUT_OF = 4;

export type Pattern = { segment: Segment; kind: 'hard' | 'break'; count: number; outOf: number; momentIds: string[] };
type StepLike = { key: string; segment?: Segment | null };

/** Segment of a step: its own `segment`, else its key when that is a known segment ("bible_story" -> story). */
export function segmentOfStep(step: StepLike): Segment | null {
  if (step.segment && (SEGMENTS as readonly string[]).includes(step.segment)) return step.segment;
  if ((SEGMENTS as readonly string[]).includes(step.key)) return step.key as Segment;
  if (step.key === 'bible_story') return 'story';
  return null;
}

/** Plain counts, not AI: of the services where the child had a segment, in how many did it carry a hard/break moment. */
export function patterns(
  moments: { id: string; stepKey: string; serviceId: string; kind: MomentKind }[],
  steps: Record<string, StepLike[]>,
): Pattern[] {
  const outOf = new Map<Segment, number>();
  for (const list of Object.values(steps)) {
    for (const s of new Set(list.map(segmentOfStep).filter((x): x is Segment => x !== null))) outOf.set(s, (outOf.get(s) ?? 0) + 1);
  }
  const hits = new Map<string, { segment: Segment; kind: 'hard' | 'break'; services: Set<string>; ids: string[] }>();
  for (const m of moments) {
    if (m.kind !== 'hard' && m.kind !== 'break') continue;
    const step = steps[m.serviceId]?.find((s) => s.key === m.stepKey);
    const segment = step ? segmentOfStep(step) : null;
    if (!segment) continue;
    const k = `${segment}|${m.kind}`;
    const h = hits.get(k) ?? { segment, kind: m.kind, services: new Set<string>(), ids: [] };
    h.services.add(m.serviceId);
    h.ids.push(m.id);
    hits.set(k, h);
  }
  return [...hits.values()]
    .map((h) => ({ segment: h.segment, kind: h.kind, count: h.services.size, outOf: outOf.get(h.segment) ?? 0, momentIds: h.ids }))
    .filter((p) => p.count >= PATTERN_MIN_COUNT && p.outOf >= PATTERN_MIN_OUT_OF)
    .sort((a, b) => b.count / b.outOf - a.count / a.outOf || b.count - a.count);
}
