// SERVER-ONLY. Lesson steps for a service, shared by the moment log, the note context and patterns.
import { listLessons } from '@/db/repo/lessons';
import type { Service } from '@/db/repo/services';
import { segmentOfStep } from '@/lib/patterns';
import type { Segment } from '@/lib/schedule/segments';

export type LessonStep = { key: string; label: string; segment: Segment | null };

const HALF_DAY = 12 * 3600_000;

/**
 * The lesson taught at a service: the church's lesson dated within 12 h of it, else the most recent lesson
 * (services carry no lesson link yet, so a past service falls back to the latest template). [] when none.
 */
export function stepsFor(lessons: Awaited<ReturnType<typeof listLessons>>, service: Pick<Service, 'startsAt'>): LessonStep[] {
  if (lessons.length === 0) return [];
  const t = service.startsAt.getTime();
  const near = lessons.filter((l) => Math.abs(l.serviceDate.getTime() - t) <= HALF_DAY).sort(
    (a, b) => Math.abs(a.serviceDate.getTime() - t) - Math.abs(b.serviceDate.getTime() - t),
  )[0];
  const lesson = near ?? lessons[lessons.length - 1]; // listLessons is ordered by serviceDate
  const raw = Array.isArray(lesson.steps) ? (lesson.steps as { key?: unknown; label?: unknown; segment?: unknown }[]) : [];
  return raw.flatMap((s) => {
    if (typeof s.key !== 'string') return [];
    const step = { key: s.key, segment: typeof s.segment === 'string' ? (s.segment as Segment) : null };
    return [{ key: s.key, label: typeof s.label === 'string' ? s.label : s.key, segment: segmentOfStep(step) }];
  });
}
