import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDbForTests, type Db } from '@/db/client';
import * as schema from '@/db/schema';
import { createSandbox } from '@/db/sandbox';
import { LESSON } from '@/db/seed/fernbrook';
import { insertAssignments } from '@/db/repo/assignments';
import { listAiCalls } from '@/db/repo/aiCalls';
import { listAccess } from '@/db/repo/access';
import { getCardForChild } from '@/db/repo/cards';
import { getLessonInChurch, updateLesson } from '@/db/repo/lessons';
import { listLessons } from '@/db/repo/lessons';
import { listPeople } from '@/db/repo/people';
import { listServices } from '@/db/repo/services';
import { stepsFor } from '@/lib/note/server';
import { SEGMENT_PICTOGRAM, SEGMENTS } from '@/lib/schedule/segments';
import { lessonToDraft, LessonDraftError } from '@/lib/schedule/lesson';
import type { Viewer } from '@/lib/auth/viewer';

const h = vi.hoisted(() => ({ viewer: null as unknown }));
vi.mock('@/lib/auth/viewer', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/viewer')>()), getViewer: async () => h.viewer }));
const verseMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/schedule/bible', async (orig) => ({ ...(await orig<typeof import('@/lib/schedule/bible')>()), getVerse: verseMock }));

import * as lessonsRoute from '@/app/api/lessons/route';
import * as packRoute from '@/app/api/pack/route';
import * as pictogramRoute from '@/app/api/pictogram/[id]/route';
import * as stationRoute from '@/app/api/station/route';

beforeAll(async () => {
  process.env.MASTER_KEY = randomBytes(32).toString('base64');
  process.env.LINK_SECRET = randomBytes(32).toString('base64url');
  process.env.VENICE_API_KEY = 'test-key';
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  setDbForTests(db as unknown as Db);
});
beforeEach(() => { h.viewer = null; verseMock.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

const GOOD = {
  title: 'Waiting with hope',
  steps: LESSON.steps,
  bigIdeaQuote: LESSON.bigIdea,
  verseRef: 'Isaiah 9:6',
};
/** A Venice chat-completions reply carrying `content`. */
const veniceReply = (content: string, usage = { prompt_tokens: 600, completion_tokens: 300 }) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status: 200, headers: { 'content-type': 'application/json' } });
const stubVenice = (...replies: (() => Response)[]) => {
  const f = vi.fn(async () => (replies.shift() ?? (() => new Response('x', { status: 500 })))());
  vi.stubGlobal('fetch', f);
  return f;
};

async function world() {
  const { churchId } = await createSandbox();
  const people = await listPeople(churchId);
  const p = (name: string) => people.find((x) => x.firstName === name)!;
  const services = await listServices(churchId);
  const now = Date.now();
  const service = services.find((s) => s.startsAt.getTime() <= now && s.endsAt.getTime() >= now)!;
  const as = (name: string, role: Viewer['role']): Viewer => ({ churchId, personId: p(name).id, role, sandbox: true });
  return { churchId, p, service, services, as };
}
type World = Awaited<ReturnType<typeof world>>;
const post = (url: string, body: unknown) =>
  new Request(`http://x${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const get = (url: string) => new Request(`http://x${url}`);
const checkIn = async (w: World, childName: string, action: 'in' | 'out') => {
  h.viewer = w.as(childName === 'Ana' ? 'Lucía' : 'Maria', 'parent');
  await stationRoute.POST(post('/api/station', { serviceId: w.service.id, childId: w.p(childName).id, action }));
};
const pack = (w: World, child: string, lang = '') => packRoute.GET(get(`/api/pack?service=${w.service.id}&child=${w.p(child).id}${lang}`));

describe('stepsFor reads the linked lesson', () => {
  it('current services get this week\'s lesson, past ones the past lesson, an unlinked one nothing', async () => {
    const w = await world();
    const lessons = await listLessons(w.churchId);
    const current = stepsFor(lessons, w.service);
    expect(current.map((s) => s.key)).toEqual(['arrive', 'worship', 'story', 'snack', 'craft', 'pickup']);
    expect(current.find((s) => s.key === 'story')?.segment).toBe('story');
    const past = w.services.find((s) => s.endsAt.getTime() < Date.now() - 86400_000)!;
    expect(stepsFor(lessons, past)).toHaveLength(6);
    expect(stepsFor(lessons, { lessonId: null })).toEqual([]);
  });
});

describe('lessonToDraft', () => {
  it('reserves then settles the ledger (purpose lesson, not e2ee) and returns the parsed draft', async () => {
    const w = await world();
    const f = stubVenice(() => veniceReply(JSON.stringify(GOOD)));
    const d = await lessonToDraft(LESSON.sourceText, { churchId: w.churchId });
    expect(d.steps).toHaveLength(6);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.venice.ai/api/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.max_tokens).toBe(1200);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    const calls = (await listAiCalls(w.churchId)).filter((c) => c.purpose === 'lesson');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ e2ee: false, ok: true, tokensIn: 600, tokensOut: 300, model: 'claude-sonnet-5-5' });
    expect(Number(calls[0].costUsd)).toBeCloseTo((600 * 2 + 300 * 10) / 1e6, 6);
  });
  it('retries once on invalid JSON, then gives up', async () => {
    const w = await world();
    const f = stubVenice(() => veniceReply('not json'), () => veniceReply(JSON.stringify(GOOD)));
    expect((await lessonToDraft(LESSON.sourceText, { churchId: w.churchId })).title).toBe('Waiting with hope');
    expect(f).toHaveBeenCalledTimes(2);
    const f2 = stubVenice(() => veniceReply('{"title":1}'), () => veniceReply('{}'));
    await expect(lessonToDraft(LESSON.sourceText, { churchId: w.churchId })).rejects.toMatchObject({ code: 'invalid_output' });
    expect(f2).toHaveBeenCalledTimes(2);
  });
  it('refuses oversize input without calling out; an upstream error is free', async () => {
    const w = await world();
    const f = stubVenice();
    await expect(lessonToDraft('x'.repeat(8001), { churchId: w.churchId })).rejects.toBeInstanceOf(LessonDraftError);
    expect(f).not.toHaveBeenCalled();
    await expect(lessonToDraft(LESSON.sourceText, { churchId: w.churchId })).rejects.toMatchObject({ code: 'upstream' });
    const calls = await listAiCalls(w.churchId);
    expect(calls[0]).toMatchObject({ ok: false });
    expect(Number(calls[0].costUsd)).toBe(0);
  });
});

describe('POST /api/lessons', () => {
  const text = LESSON.sourceText;
  it('director only; drafts, verifies, fetches the verse, stores and links the services', async () => {
    const w = await world();
    verseMock.mockResolvedValue({ ref: 'Isaiah 9:6', text: 'For unto us a child is born', attribution: 'x' });
    stubVenice(() => veniceReply(JSON.stringify(GOOD)));
    h.viewer = w.as('Priya', 'buddy');
    expect((await lessonsRoute.POST(post('/api/lessons', { serviceIds: [w.service.id], text }))).status).toBe(403);
    h.viewer = w.as('Hannah', 'director');
    const ids = [w.service.id, w.services.find((s) => s.id !== w.service.id)!.id];
    const res = await lessonsRoute.POST(post('/api/lessons', { serviceIds: ids, text }));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.lesson.steps).toHaveLength(6);
    expect(out.lesson.bigIdeaQuote).toBe(LESSON.bigIdea);
    expect(out.verse.text).toBe('For unto us a child is born');
    expect([...out.replaced].sort()).toEqual([...ids].sort()); // both already had the fixture lesson
    const services = await listServices(w.churchId);
    expect(services.filter((s) => s.lessonId === out.id).map((s) => s.id).sort()).toEqual([...ids].sort());
    const g = await lessonsRoute.GET(get(`/api/lessons?service=${w.service.id}`));
    expect(g.status).toBe(200);
    expect(await g.json()).toMatchObject({ id: out.id, verseText: 'For unto us a child is born' });
  });
  it('422 when the big idea is not in the lesson; nothing is stored or linked', async () => {
    const w = await world();
    stubVenice(() => veniceReply(JSON.stringify({ ...GOOD, bigIdeaQuote: 'Hope always wins.' })));
    h.viewer = w.as('Hannah', 'director');
    const res = await lessonsRoute.POST(post('/api/lessons', { serviceIds: [w.service.id], text }));
    expect(res.status).toBe(422);
    expect((await res.json()).errors).toEqual(['big_idea_not_in_lesson']);
    expect((await listLessons(w.churchId))).toHaveLength(2);
    expect((await listServices(w.churchId)).find((s) => s.id === w.service.id)!.lessonId).not.toBeNull();
  });
  it('422 bad_label when a step label is not plain short words; nothing stored', async () => {
    const w = await world();
    const steps = LESSON.steps.map((x, i) => (i === 0 ? { ...x, label: 'visit www.evil.com today please now' } : x));
    stubVenice(() => veniceReply(JSON.stringify({ ...GOOD, steps })));
    h.viewer = w.as('Hannah', 'director');
    const res = await lessonsRoute.POST(post('/api/lessons', { serviceIds: [w.service.id], text }));
    expect(res.status).toBe(422);
    expect((await res.json()).errors).toContain('bad_label');
    expect(await listLessons(w.churchId)).toHaveLength(2);
  });
  it('replaced is empty for a service with no lesson yet', async () => {
    const w = await world();
    const { setServicesLesson } = await import('@/db/repo/services');
    await setServicesLesson(w.churchId, [w.service.id], null);
    stubVenice(() => veniceReply(JSON.stringify(GOOD)));
    h.viewer = w.as('Hannah', 'director');
    expect((await (await lessonsRoute.POST(post('/api/lessons', { serviceIds: [w.service.id], text }))).json()).replaced).toEqual([]);
  });
  it('validates the body and keeps it inside the church', async () => {
    const w = await world();
    const other = await world();
    h.viewer = w.as('Hannah', 'director');
    const f = stubVenice();
    expect((await lessonsRoute.POST(post('/api/lessons', { serviceIds: [w.service.id], text: 'short' }))).status).toBe(400);
    expect((await lessonsRoute.POST(post('/api/lessons', { serviceIds: [w.service.id], text: 'x'.repeat(8001) }))).status).toBe(400);
    expect((await lessonsRoute.POST(post('/api/lessons', { serviceIds: [], text }))).status).toBe(400);
    expect((await lessonsRoute.POST(post('/api/lessons', { serviceIds: ['nope'], text }))).status).toBe(400);
    expect((await lessonsRoute.POST(post('/api/lessons', { serviceIds: [other.service.id], text }))).status).toBe(404);
    expect(f).not.toHaveBeenCalled();
    h.viewer = null;
    expect((await lessonsRoute.POST(post('/api/lessons', { serviceIds: [w.service.id], text }))).status).toBe(401);
  });
  it('GET is tenant-scoped', async () => {
    const w = await world();
    const other = await world();
    h.viewer = w.as('Hannah', 'director');
    expect((await lessonsRoute.GET(get(`/api/lessons?service=${other.service.id}`))).status).toBe(404);
  });
});

describe('GET /api/pack', () => {
  it('director gets Leo\'s steps with headphones on worship, a social story, and the verse', async () => {
    const w = await world();
    h.viewer = w.as('Hannah', 'director');
    const res = await pack(w, 'Leo');
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.lang).toBe('en');
    expect(out.steps.map((s: { key: string }) => s.key)).toEqual(['arrive', 'worship', 'story', 'snack', 'craft', 'pickup']);
    const worship = out.steps.find((s: { key: string }) => s.key === 'worship');
    expect(worship.pictogramUrl).toBe(`/api/pictogram/${SEGMENT_PICTOGRAM.worship}`);
    expect(worship.chips.map((c: { chip: string }) => c.chip)).toContain('headphones');
    expect(out.steps.find((s: { key: string }) => s.key === 'craft').chips.map((c: { chip: string }) => c.chip)).not.toContain('headphones');
    expect(out.socialStory[0]).toBe('First, we walk into church.');
    expect(out.socialStory.at(-1)).toBe('Then my grown-up picks me up.');
    expect(out.verse).toEqual({ ref: 'Isaiah 9:6', text: LESSON.verseText, attribution: 'Berean Standard Bible (BSB), public domain.' });
    expect(JSON.stringify(out)).not.toContain('Leo');
  });
  it('lang=es switches chip labels and the story', async () => {
    const w = await world();
    h.viewer = w.as('Hannah', 'director');
    const out = await (await pack(w, 'Leo', '&lang=es')).json();
    expect(out.lang).toBe('es');
    expect(out.socialStory[0]).toBe('Primero, entramos a la iglesia.');
    expect(out.steps.find((s: { key: string }) => s.key === 'worship').chips[0].label).toBe('Ofrece audífonos');
    expect(out.steps.map((s: { label: string }) => s.label)).toEqual(['Llegada', 'Alabanza', 'Historia bíblica', 'Merienda', 'Manualidad', 'Hora de irse']);
    const en = await (await pack(w, 'Leo')).json();
    expect(en.steps.map((s: { label: string }) => s.label)).toEqual(['Arrive', 'Worship', 'Bible story', 'Snack', 'Craft', 'Pickup']);
    expect((await (await pack(w, 'Leo', '&lang=fr')).json()).lang).toBe('en');
  });
  it('a lesson stored without Spanish labels shows the English ones on a Spanish page', async () => {
    const w = await world();
    h.viewer = w.as('Hannah', 'director');
    const lesson = (await getLessonInChurch(w.churchId, w.service.lessonId!))!;
    await updateLesson(lesson.id, { steps: (lesson.steps as { labelEs?: string }[]).map(({ labelEs: _es, ...x }) => (void _es, x)) });
    const out = await (await pack(w, 'Leo', '&lang=es')).json();
    expect(out.steps.map((s: { label: string }) => s.label)).toEqual(['Arrive', 'Worship', 'Bible story', 'Snack', 'Craft', 'Pickup']);
    expect(out.socialStory[0]).toBe('Primero, entramos a la iglesia.');
  });
  it('a buddy needs the gate: 403 until the child is checked in, then 200, then 403 after check-out', async () => {
    const w = await world();
    await insertAssignments([{ serviceId: w.service.id, childId: w.p('Leo').id, buddyId: w.p('Priya').id, status: 'approved' }]);
    h.viewer = w.as('Priya', 'buddy');
    expect((await pack(w, 'Leo')).status).toBe(403);
    await checkIn(w, 'Leo', 'in');
    h.viewer = w.as('Priya', 'buddy');
    expect((await pack(w, 'Leo')).status).toBe(200);
    h.viewer = w.as('Marco', 'buddy'); // not assigned to Leo
    expect((await pack(w, 'Leo')).status).toBe(403);
    await checkIn(w, 'Leo', 'out');
    h.viewer = w.as('Priya', 'buddy');
    expect((await pack(w, 'Leo')).status).toBe(403);
  });
  it('parents, anonymous and other churches are refused; no linked lesson is 404', async () => {
    const w = await world();
    const other = await world();
    h.viewer = w.as('Maria', 'parent');
    expect((await pack(w, 'Leo')).status).toBe(403);
    h.viewer = null;
    expect((await pack(w, 'Leo')).status).toBe(401);
    h.viewer = other.as('Hannah', 'director');
    expect((await pack(w, 'Leo')).status).toBe(404);
    h.viewer = w.as('Hannah', 'director');
    expect((await packRoute.GET(get(`/api/pack?service=nope&child=${w.p('Leo').id}`))).status).toBe(404);
    const lessonless = w.services.find((s) => s.id !== w.service.id)!;
    const { setServicesLesson } = await import('@/db/repo/services');
    await setServicesLesson(w.churchId, [lessonless.id], null);
    expect((await packRoute.GET(get(`/api/pack?service=${lessonless.id}&child=${w.p('Leo').id}`))).status).toBe(404);
  });
});

describe('pack audit and unknown segments', () => {
  it('a buddy pack read is written to the card access log', async () => {
    const w = await world();
    await insertAssignments([{ serviceId: w.service.id, childId: w.p('Leo').id, buddyId: w.p('Priya').id, status: 'approved' }]);
    await checkIn(w, 'Leo', 'in');
    const card = (await getCardForChild(w.churchId, w.p('Leo').id))!;
    const before = (await listAccess(card.id)).length;
    h.viewer = w.as('Priya', 'buddy');
    expect((await pack(w, 'Leo')).status).toBe(200);
    const rows = await listAccess(card.id);
    expect(rows).toHaveLength(before + 1);
    expect(rows.at(-1)).toMatchObject({ viewerId: w.p('Priya').id, role: 'buddy', reason: 'checked_in', serviceId: w.service.id, closedAt: null });
    h.viewer = w.as('Marco', 'buddy'); // denied reads are not logged as openings
    expect((await pack(w, 'Leo')).status).toBe(403);
    expect(await listAccess(card.id)).toHaveLength(before + 1);
  });
  it('a step with an unknown segment stays in the pack as a transition', async () => {
    const w = await world();
    const lesson = (await listLessons(w.churchId)).find((l) => l.id === w.service.lessonId)!;
    await updateLesson(lesson.id, { steps: [...(lesson.steps as object[]), { key: 'weird', label: 'Parachute game', segment: 'parachute', sensoryLoad: 'high', minutes: 5 }] });
    h.viewer = w.as('Hannah', 'director');
    const out = await (await pack(w, 'Leo')).json();
    const weird = out.steps.find((s: { key: string }) => s.key === 'weird');
    expect(weird).toMatchObject({ label: 'Parachute game', segment: 'transition', pictogramUrl: `/api/pictogram/${SEGMENT_PICTOGRAM.transition}` });
    expect(stepsFor(await listLessons(w.churchId), { lessonId: lesson.id }).find((s) => s.key === 'weird')?.segment).toBe('transition');
  });
});

describe('GET /api/pictogram/:id', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
  it('serves only pinned ids, with immutable caching', async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const f = vi.fn(async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', f);
    const ok = await pictogramRoute.GET(get('/x'), ctx(String(SEGMENT_PICTOGRAM.worship)));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(ok.headers.get('content-type')).toBe('image/png');
    expect(f).toHaveBeenCalledWith(
      `https://static.arasaac.org/pictograms/${SEGMENT_PICTOGRAM.worship}/${SEGMENT_PICTOGRAM.worship}_300.png`,
      expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }),
    );
    for (const bad of ['1', '6960.5', '-6960', 'abc', '6960/../x', '0x1b30']) {
      expect((await pictogramRoute.GET(get('/x'), ctx(bad))).status).toBe(404);
    }
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('502 when upstream fails or is not a PNG', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    expect((await pictogramRoute.GET(get('/x'), ctx(String(SEGMENT_PICTOGRAM.arrive)))).status).toBe(502);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })));
    expect((await pictogramRoute.GET(get('/x'), ctx(String(SEGMENT_PICTOGRAM.arrive)))).status).toBe(502);
    expect(SEGMENTS.length).toBe(9);
  });
});
