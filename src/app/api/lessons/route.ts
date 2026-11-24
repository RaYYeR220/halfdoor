import { NextResponse } from 'next/server';
import { getLessonInChurch, insertLesson } from '@/db/repo/lessons';
import { getServiceInChurch, setServicesLesson } from '@/db/repo/services';
import { UUID, fail, readJson, requireViewer } from '@/lib/access/api';
import { getVerse } from '@/lib/schedule/bible';
import { LessonDraftError, MAX_LESSON_CHARS, MIN_LESSON_CHARS, lessonToDraft, verifyLesson } from '@/lib/schedule/lesson';
import { testFixtureMode } from '@/lib/testing/fixtureMode';

const MAX_SERVICES = 12;

/** Director pastes the lesson: restructure (no child data), verify, fetch the verse verbatim, store, link the services. */
export async function POST(req: Request) {
  const viewer = await requireViewer(['director']);
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  if (!body) return fail('invalid_lesson', 400);
  const { serviceIds, text } = body;
  if (typeof text !== 'string' || text.trim().length < MIN_LESSON_CHARS) return fail('lesson_too_short', 400);
  if (text.length > MAX_LESSON_CHARS) return fail('lesson_too_long', 400);
  if (!Array.isArray(serviceIds) || serviceIds.length === 0 || serviceIds.length > MAX_SERVICES || serviceIds.some((x) => typeof x !== 'string' || !UUID.test(x))) {
    return fail('invalid_services', 400);
  }
  const ids = [...new Set(serviceIds as string[])];
  const services = await Promise.all(ids.map((id) => getServiceInChurch(viewer.churchId, id)));
  if (services.some((s) => !s)) return fail('not_found', 404);

  let draft;
  try {
    draft = await lessonToDraft(text, { churchId: viewer.churchId });
  } catch (e) {
    const code = e instanceof LessonDraftError ? e.code : 'upstream';
    if (code === 'sandbox_cap' || code === 'daily_cap') return NextResponse.json({ error: code }, { status: 429 });
    if (code === 'invalid_output') return fail('lesson_failed', 502);
    return fail('ai_unavailable', 503);
  }
  const verified = verifyLesson(text, draft);
  if (!verified.ok) return NextResponse.json({ error: 'lesson_unverified', errors: verified.errors }, { status: 422 });
  const { lesson } = verified;

  const replaced = services.filter((s) => s!.lessonId).map((s) => s!.id);
  const verse = lesson.verseRef ? await getVerse(lesson.verseRef) : null;
  const serviceDate = new Date(Math.min(...services.map((s) => s!.startsAt.getTime())));
  const row = await insertLesson({
    churchId: viewer.churchId, serviceDate, sourceText: text, title: lesson.title, bigIdeaQuote: lesson.bigIdeaQuote,
    verseRef: lesson.verseRef, verseText: verse?.text ?? null, steps: lesson.steps,
  });
  await setServicesLesson(viewer.churchId, ids, row.id);
  // `fixture`: the draft was the e2e test seam's recording, not a model call (the desk says so).
  return NextResponse.json({ id: row.id, lesson, verse, replaced, ...(testFixtureMode() ? { fixture: true } : {}) });
}

/** The lesson linked to a service (director desk). */
export async function GET(req: Request) {
  const viewer = await requireViewer(['director']);
  if (viewer instanceof NextResponse) return viewer;
  const serviceId = new URL(req.url).searchParams.get('service');
  if (!serviceId || !UUID.test(serviceId)) return fail('not_found', 404);
  const service = await getServiceInChurch(viewer.churchId, serviceId);
  if (!service?.lessonId) return fail('not_found', 404);
  const l = await getLessonInChurch(viewer.churchId, service.lessonId);
  if (!l) return fail('not_found', 404);
  return NextResponse.json({
    id: l.id, title: l.title, bigIdeaQuote: l.bigIdeaQuote, verseRef: l.verseRef, verseText: l.verseText, steps: l.steps,
  });
}
