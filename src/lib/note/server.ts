// SERVER-ONLY. Lesson steps for a service, shared by the moment log, the note context and patterns.
import type { listLessons } from '@/db/repo/lessons';
import type { Service } from '@/db/repo/services';
import { segmentOfStep } from '@/lib/patterns';
import { SEGMENTS, SENSORY_LOADS, type Segment, type SensoryLoad, type Step } from '@/lib/schedule/segments';

export type LessonStep = { key: string; label: string; segment: Segment | null };
type LessonRow = Awaited<ReturnType<typeof listLessons>>[number];

/** The stored steps of a lesson, defaulting what an older row lacks (segment from the key, load med, 5 minutes). */
export function parseSteps(lesson: Pick<LessonRow, 'steps'>): (Omit<Step, 'segment'> & { segment: Segment | null })[] {
  const raw = Array.isArray(lesson.steps) ? (lesson.steps as Record<string, unknown>[]) : [];
  return raw.flatMap((s) => {
    if (typeof s?.key !== 'string') return [];
    const segment = segmentOfStep({ key: s.key, segment: (SEGMENTS as readonly unknown[]).includes(s.segment) ? (s.segment as Segment) : null });
    const load = (SENSORY_LOADS as readonly unknown[]).includes(s.sensoryLoad) ? (s.sensoryLoad as SensoryLoad) : 'med';
    return [{
      key: s.key, label: typeof s.label === 'string' ? s.label : s.key, segment, sensoryLoad: load,
      minutes: typeof s.minutes === 'number' ? s.minutes : 5,
    }];
  });
}

/** The lesson taught at a service is the one linked by `services.lesson_id`. [] when none is linked. */
export function stepsFor(lessons: LessonRow[], service: Pick<Service, 'lessonId'>): LessonStep[] {
  const lesson = service.lessonId ? lessons.find((l) => l.id === service.lessonId) : undefined;
  return lesson ? parseSteps(lesson).map((s) => ({ key: s.key, label: s.label, segment: s.segment })) : [];
}
