import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDbForTests, type Db } from '@/db/client';
import * as schema from '@/db/schema';
import { createSandbox } from '@/db/sandbox';
import { listAssignments } from '@/db/repo/assignments';
import { getCardForChild, updateCard } from '@/db/repo/cards';
import { listPeople } from '@/db/repo/people';
import { listServices } from '@/db/repo/services';
import type { Viewer } from '@/lib/auth/viewer';

const h = vi.hoisted(() => ({ viewer: null as unknown, approved: [] as string[] }));
vi.mock('@/lib/auth/viewer', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/viewer')>()), getViewer: async () => h.viewer }));
vi.mock('@/lib/pco/hooks', async (orig) => ({
  ...(await orig<typeof import('@/lib/pco/hooks')>()),
  onAssignmentApproved: async (_c: string, id: string) => { h.approved.push(id); },
}));

import * as listRoute from '@/app/api/assignments/route';
import * as solveRoute from '@/app/api/assignments/solve/route';
import * as approveRoute from '@/app/api/assignments/approve/route';

beforeAll(async () => {
  process.env.MASTER_KEY = randomBytes(32).toString('base64');
  process.env.LINK_SECRET = randomBytes(32).toString('base64url');
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  setDbForTests(db as unknown as Db);
});
beforeEach(() => { h.viewer = null; h.approved = []; });

async function world() {
  const { churchId } = await createSandbox();
  const people = await listPeople(churchId);
  const p = (name: string) => people.find((x) => x.firstName === name)!;
  const services = await listServices(churchId);
  const nine = services.find((s) => s.label === '9:00 service' && s.startsAt.getTime() > Date.now() - 3600_000 && s.startsAt.getTime() < Date.now() + 3600_000)!;
  const eleven = services.find((s) => s.label === '11:00 service')!;
  const director: Viewer = { churchId, personId: p('Hannah').id, role: 'director', sandbox: true };
  return { churchId, p, nine, eleven, director };
}
const post = (route: { POST: (r: Request) => Promise<Response> }, url: string, body: unknown) =>
  route.POST(new Request(`http://x${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
type Solved = {
  assignments: { id: string; childName: string; buddyName: string; reasons: string[]; status: string }[];
  unassigned: { childName: string; hints: string[] }[];
  waitingForReview: { name: string }[];
};
const solved = async (res: Response) => (await res.json()) as Solved;
const by = (r: Solved, child: string) => r.assignments.find((a) => a.childName === child)!;

describe('POST /api/assignments/solve', () => {
  it('needs a director', async () => {
    const w = await world();
    expect((await post(solveRoute, '/api/assignments/solve', { serviceId: w.nine.id })).status).toBe(401);
    h.viewer = { ...w.director, personId: w.p('Priya').id, role: 'buddy' };
    expect((await post(solveRoute, '/api/assignments/solve', { serviceId: w.nine.id })).status).toBe(403);
  });

  it('solves the Fernbrook 9:00 service', async () => {
    const w = await world();
    h.viewer = w.director;
    const res = await post(solveRoute, '/api/assignments/solve', { serviceId: w.nine.id });
    expect(res.status).toBe(200);
    const r = await solved(res);
    // Ivy (AAC, bathroom help, needs a woman) can only be Priya; Leo's usual buddy yields and Grace is first by name among the rest.
    expect(by(r, 'Ivy').buddyName).toBe('Priya');
    expect(by(r, 'Ivy').reasons).toEqual(['AAC experience']);
    expect(by(r, 'Leo').buddyName).toBe('Grace');
    expect(by(r, 'Leo').reasons).toEqual([]);
    // Ana: Spanish-speaking, and her usual buddy.
    expect(by(r, 'Ana').buddyName).toBe('Marco');
    expect(by(r, 'Ana').reasons).toEqual(['Same buddy as the last 3 Sundays', 'Speaks Spanish']);
    // Malik is only parent-approved, Theo needs no buddy, Sam has no card.
    expect(r.waitingForReview.map((x) => x.name)).toEqual(['Malik']);
    expect(r.assignments.map((a) => a.childName).sort()).toEqual(['Ana', 'Ivy', 'Leo']);
    expect(r.unassigned).toEqual([]);
    expect(r.assignments.every((a) => a.status === 'proposed')).toBe(true);
  });

  it('Ana and Malik share a buddy once Malik is acknowledged and buddies run short', async () => {
    const w = await world();
    h.viewer = w.director;
    const card = (await getCardForChild(w.churchId, w.p('Malik').id))!;
    await updateCard(card.id, { status: 'acknowledged' });
    const r = await solved(await post(solveRoute, '/api/assignments/solve', { serviceId: w.nine.id }));
    expect(r.waitingForReview).toEqual([]);
    expect(by(r, 'Malik').buddyName).not.toBe(by(r, 'Leo').buddyName);
    expect(by(r, 'Malik').buddyName).not.toBe(by(r, 'Ivy').buddyName);

    // Only Priya, Marco and Grace are left standing: Leo, Ivy take two, so Ana + Malik share the third.
    const people = await listPeople(w.churchId);
    const { updatePerson } = await import('@/db/repo/people');
    for (const x of people.filter((q) => q.role === 'buddy' && !['Priya', 'Marco', 'Grace'].includes(q.firstName))) {
      await updatePerson(x.id, { backgroundExpiresAt: new Date('2020-01-01') });
    }
    const t = await solved(await post(solveRoute, '/api/assignments/solve', { serviceId: w.nine.id }));
    expect(by(t, 'Ana').buddyName).toBe('Marco');
    expect(by(t, 'Malik').buddyName).toBe('Marco');
    expect(by(t, 'Ana').reasons).toContain('Shares with Malik (both part of the morning)');
    expect(by(t, 'Malik').reasons).toEqual(['Shares with Ana (both part of the morning)']);
  });

  it('re-solving replaces proposed rows and leaves approved ones alone', async () => {
    const w = await world();
    h.viewer = w.director;
    const first = await solved(await post(solveRoute, '/api/assignments/solve', { serviceId: w.nine.id }));
    const ivyRow = by(first, 'Ivy');
    expect((await post(approveRoute, '/api/assignments/approve', { assignmentIds: [ivyRow.id] })).status).toBe(200);
    const second = await solved(await post(solveRoute, '/api/assignments/solve', { serviceId: w.nine.id }));
    expect(second.assignments.map((a) => a.childName).sort()).toEqual(['Ana', 'Leo']); // Ivy is already decided
    const rows = await listAssignments(w.nine.id);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.id === ivyRow.id)!.status).toBe('approved');
    // Priya is Ivy's approved buddy now, so nobody else gets her.
    expect(second.assignments.some((a) => a.buddyName === 'Priya')).toBe(false);
  });

  it('explains the AAC gap at 11:00 when Priya is already committed (Dana lapsed)', async () => {
    const w = await world();
    h.viewer = w.director;
    const { insertAssignments } = await import('@/db/repo/assignments');
    const { insertPeople } = await import('@/db/repo/people');
    // Priya is approved for another child at the overlapping 11:00 service.
    const [kid] = await insertPeople([{ churchId: w.churchId, role: 'child', firstName: 'Kai', gender: 'm' }]);
    await insertAssignments([{ serviceId: w.eleven.id, childId: kid.id, buddyId: w.p('Priya').id, status: 'approved' }]);
    const r = await solved(await post(solveRoute, '/api/assignments/solve', { serviceId: w.eleven.id }));
    expect(r.assignments.find((a) => a.childName === 'Ivy')).toBeUndefined();
    expect(r.unassigned.find((u) => u.childName === 'Ivy')!.hints).toEqual([
      "Ivy needs a buddy with AAC experience at 11:00 service — Dana's inclusion training expired 2 Oct",
    ]);
  });

  it('is tenant-scoped', async () => {
    const a = await world();
    const b = await world();
    h.viewer = a.director;
    expect((await post(solveRoute, '/api/assignments/solve', { serviceId: b.nine.id })).status).toBe(404);
    expect((await post(solveRoute, '/api/assignments/solve', { serviceId: 'nope' })).status).toBe(400);
  });
});

describe('POST /api/assignments/approve and GET /api/assignments', () => {
  it('flips proposed to approved, calls the hook, lists with names', async () => {
    const w = await world();
    h.viewer = w.director;
    const r = await solved(await post(solveRoute, '/api/assignments/solve', { serviceId: w.nine.id }));
    const ids = r.assignments.map((a) => a.id);
    const res = await post(approveRoute, '/api/assignments/approve', { assignmentIds: ids });
    expect(res.status).toBe(200);
    expect((await res.json()).approved.sort()).toEqual([...ids].sort());
    expect(h.approved.sort()).toEqual([...ids].sort());
    // Idempotent: nothing left to flip, no second hook call.
    h.approved = [];
    expect((await (await post(approveRoute, '/api/assignments/approve', { assignmentIds: ids })).json()).approved).toEqual([]);
    expect(h.approved).toEqual([]);

    const list = await (await listRoute.GET(new Request(`http://x/api/assignments?service=${w.nine.id}`))).json();
    expect(list.assignments).toHaveLength(3);
    expect(list.assignments.every((a: { status: string; childName: string }) => a.status === 'approved' && a.childName)).toBe(true);
  });

  it('404s on another church and on bad input, writes nothing', async () => {
    const a = await world();
    const b = await world();
    h.viewer = b.director;
    const theirs = await solved(await post(solveRoute, '/api/assignments/solve', { serviceId: b.nine.id }));
    const mine = await solved(await (async () => { h.viewer = a.director; return post(solveRoute, '/api/assignments/solve', { serviceId: a.nine.id }); })());
    const res = await post(approveRoute, '/api/assignments/approve', { assignmentIds: [mine.assignments[0].id, theirs.assignments[0].id] });
    expect(res.status).toBe(404);
    expect((await listAssignments(a.nine.id)).filter((x) => x.status === 'approved')).toHaveLength(0);
    expect((await post(approveRoute, '/api/assignments/approve', { assignmentIds: [] })).status).toBe(400);
    expect((await post(approveRoute, '/api/assignments/approve', { assignmentIds: ['x'] })).status).toBe(400);
    h.viewer = a.director;
    expect((await listRoute.GET(new Request(`http://x/api/assignments?service=${b.nine.id}`))).status).toBe(404);
  });
});
