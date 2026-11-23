import { NextResponse } from 'next/server';
import { getCardForChild } from '@/db/repo/cards';
import { getLessonInChurch } from '@/db/repo/lessons';
import { getServiceInChurch } from '@/db/repo/services';
import { UUID, childInChurch, fail, requireViewer } from '@/lib/access/api';
import { evaluateGate } from '@/lib/access/read';
import { TAGS, type Tag } from '@/lib/card/schema';
import { parseSteps } from '@/lib/note/server';
import { adaptationsFor } from '@/lib/schedule/adapt';
import { CHIP_PICTOGRAM, pictogramUrl } from '@/lib/schedule/arasaac';
import { BSB_ATTRIBUTION } from '@/lib/schedule/bible';
import { SEGMENT_PICTOGRAM, type Step } from '@/lib/schedule/segments';
import { socialStory } from '@/lib/schedule/socialStory';

/**
 * A child's visual schedule for a service: the lesson's steps, the child's supports on the right steps (rules, not AI),
 * a fixed-sentence social story, and the verse. Director, or a buddy who passes the same gate as the card.
 */
export async function GET(req: Request) {
  const viewer = await requireViewer(['director', 'buddy']);
  if (viewer instanceof NextResponse) return viewer;
  const url = new URL(req.url);
  const serviceId = url.searchParams.get('service');
  const childId = url.searchParams.get('child');
  if (!serviceId || !UUID.test(serviceId) || !childId || !UUID.test(childId)) return fail('not_found', 404);
  const lang = url.searchParams.get('lang') === 'es' ? 'es' : 'en';

  let tags: Tag[];
  if (viewer.role === 'buddy') {
    const ev = await evaluateGate(viewer, childId, serviceId, 'full', new Date());
    if (!ev) return fail('not_found', 404);
    if (!ev.result.allowed) return NextResponse.json({ error: 'forbidden', reason: ev.result.reason }, { status: 403 });
    tags = ev.card.tags as Tag[];
  } else {
    if (!(await childInChurch(viewer, childId))) return fail('not_found', 404);
    tags = ((await getCardForChild(viewer.churchId, childId))?.tags ?? []) as Tag[];
  }
  tags = tags.filter((t) => (TAGS as readonly string[]).includes(t));

  const service = await getServiceInChurch(viewer.churchId, serviceId);
  if (!service) return fail('not_found', 404);
  const lesson = service.lessonId ? await getLessonInChurch(viewer.churchId, service.lessonId) : undefined;
  if (!lesson) return fail('no_lesson', 404);

  const steps = parseSteps(lesson).flatMap((s): Step[] => (s.segment ? [{ ...s, segment: s.segment }] : []));
  const chips = adaptationsFor(tags, steps);
  return NextResponse.json({
    steps: steps.map((s) => ({
      key: s.key, label: s.label, segment: s.segment, minutes: s.minutes, pictogramUrl: pictogramUrl(SEGMENT_PICTOGRAM[s.segment]),
      chips: chips.filter((c) => c.stepKey === s.key).map((c) => ({ chip: c.chip, label: c.label[lang], pictogramUrl: pictogramUrl(CHIP_PICTOGRAM[c.chip]) })),
    })),
    socialStory: socialStory(steps, chips, lang),
    verse: lesson.verseRef && lesson.verseText ? { ref: lesson.verseRef, text: lesson.verseText, attribution: BSB_ATTRIBUTION } : null,
    lang,
  });
}
