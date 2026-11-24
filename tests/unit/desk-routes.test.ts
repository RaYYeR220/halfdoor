import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDbForTests, type Db } from '@/db/client';
import * as schema from '@/db/schema';
import { createSandbox } from '@/db/sandbox';
import { insertAiCall } from '@/db/repo/aiCalls';
import { insertAssignments } from '@/db/repo/assignments';
import { getChurch } from '@/db/repo/churches';
import { listAccessForChild } from '@/db/repo/access';
import { getCardForChild, updateCard } from '@/db/repo/cards';
import { insertMoments } from '@/db/repo/moments';
import { listPeople } from '@/db/repo/people';
import { listServices } from '@/db/repo/services';
import type { Viewer } from '@/lib/auth/viewer';
import { AttestationSummarySchema } from '@/lib/venice/teeProxy';
import { loadPatternsBoard } from '@/lib/desk/patterns';
import { loadNotesBoard, loadPackChildren, loadUpcoming } from '@/lib/desk/server';
import type { ChildRow, Ledger } from '@/lib/desk/types';

const h = vi.hoisted(() => ({ viewer: null as unknown }));
vi.mock('@/lib/auth/viewer', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/viewer')>()), getViewer: async () => h.viewer }));

import * as childrenRoute from '@/app/api/children/route';
import * as ledgerRoute from '@/app/api/ledger/route';

beforeAll(async () => {
  process.env.MASTER_KEY = randomBytes(32).toString('base64');
  process.env.LINK_SECRET = randomBytes(32).toString('base64url');
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  setDbForTests(db as unknown as Db);
});
beforeEach(() => {
  h.viewer = null;
});

async function world() {
  const { churchId } = await createSandbox();
  const people = await listPeople(churchId);
  const p = (name: string) => people.find((x) => x.firstName === name)!;
  const as = (name: string, role: Viewer['role']): Viewer => ({ churchId, personId: p(name).id, role, sandbox: true });
  return { churchId, p, as };
}

const children = async () => {
  const res = await childrenRoute.GET();
  return { status: res.status, body: (await res.json()) as { children?: ChildRow[]; error?: string }, cache: res.headers.get('cache-control') };
};
const ledger = async () => {
  const res = await ledgerRoute.GET();
  return { status: res.status, body: (await res.json()) as Ledger & { error?: string }, cache: res.headers.get('cache-control') };
};

describe('GET /api/children', () => {
  it('is for the director only', async () => {
    const w = await world();
    expect((await children()).status).toBe(401);
    for (const [name, role] of [['Maria', 'parent'], ['Priya', 'buddy'], ['Tom', 'leader']] as const) {
      h.viewer = w.as(name, role);
      expect((await children()).status).toBe(403);
    }
  });

  it("lists the church's children with card state, parents and support level, never card content", async () => {
    const w = await world();
    h.viewer = w.as('Hannah', 'director');
    const { status, body, cache } = await children();
    expect(status).toBe(200);
    expect(cache).toBe('no-store');
    const rows = body.children!;
    expect(rows.map((r) => r.firstName)).toEqual(['Malik', 'Ana', 'Ivy', 'Leo', 'Theo', 'Sam']); // review first, then by name
    expect(rows.find((r) => r.firstName === 'Malik')).toMatchObject({ status: 'parent_approved', supportLevel: 'parts', grade: '4th grade', lang: 'en' });
    expect(rows.find((r) => r.firstName === 'Leo')).toMatchObject({ status: 'acknowledged', supportLevel: 'all_morning', parents: ['Maria'] });
    expect(rows.find((r) => r.firstName === 'Ana')).toMatchObject({ lang: 'es', parents: ['Lucía'] });
    expect(rows.find((r) => r.firstName === 'Sam')).toMatchObject({ status: 'none', supportLevel: null, updatedAt: null, parents: ['Jordan'] });
    const leo = rows.find((r) => r.firstName === 'Leo')!;
    expect(Date.parse(leo.updatedAt!)).toBeGreaterThan(0);
    const json = JSON.stringify(body);
    for (const word of ['peanuts', 'EpiPen', 'trains', 'cantar', 'diabetes']) expect(json).not.toContain(word);
  });

  it('is tenant-scoped', async () => {
    const a = await world();
    const b = await world();
    h.viewer = a.as('Hannah', 'director');
    const ids = new Set((await children()).body.children!.map((r) => r.id));
    expect(ids.has(a.p('Leo').id)).toBe(true);
    expect(ids.has(b.p('Leo').id)).toBe(false);
  });
});

describe('GET /api/ledger', () => {
  const attestation = {
    verified: true, provider: 'near-ai', hardware: 'intel-tdx', model: 'e2ee-deepseek-v4-flash', checkedAt: '2026-11-24T10:00:00.000Z',
    quote: { mrtd: 'a'.repeat(96), mrtdShort: `${'a'.repeat(16)}…`, signature: 'verified', signatureSource: 'live', signatureCheckedIn: 'browser', tcbStatus: 'UpToDate' },
  };

  it('is for the director only', async () => {
    const w = await world();
    expect((await ledger()).status).toBe(401);
    h.viewer = w.as('Maria', 'parent');
    expect((await ledger()).status).toBe(403);
    h.viewer = w.as('Priya', 'buddy');
    expect((await ledger()).status).toBe(403);
  });

  it("an empty church has an empty ledger with the sandbox's call allowance", async () => {
    const w = await world();
    h.viewer = w.as('Hannah', 'director');
    const { status, body, cache } = await ledger();
    expect(status).toBe(200);
    expect(cache).toBe('no-store');
    expect(body.rows).toEqual([]);
    expect(body.totals).toMatchObject({ calls: 0, costUsd: 0 });
    expect(body.cap).toEqual({ calls: 15 });
  });

  it("lists this church's calls newest first with the attestation record and totals, and nobody else's", async () => {
    const a = await world();
    const b = await world();
    const t0 = Date.now() - 60_000;
    await insertAiCall({ churchId: a.churchId, purpose: 'lesson', model: 'claude-sonnet-5-5', e2ee: false, tokensIn: 900, tokensOut: 400, costUsd: '0.005800', ok: true, at: new Date(t0) });
    await insertAiCall({ churchId: a.churchId, purpose: 'note', model: 'e2ee-deepseek-v4-flash', e2ee: true, attestation, tokensIn: 700, tokensOut: 120, costUsd: '0.000172', ok: true, at: new Date(t0 + 30_000) });
    await insertAiCall({ churchId: b.churchId, purpose: 'card', model: 'e2ee-deepseek-v4-flash', e2ee: true, costUsd: '0.000900', ok: true, at: new Date(t0 + 40_000) });
    h.viewer = a.as('Hannah', 'director');
    const { body } = await ledger();
    expect(body.rows.map((r) => r.purpose)).toEqual(['note', 'lesson']);
    expect(body.rows[0]).toMatchObject({
      e2ee: true, model: 'e2ee-deepseek-v4-flash', tokensIn: 700, tokensOut: 120, costUsd: 0.000172, ok: true,
      attestation: { provider: 'near-ai', signature: 'verified', source: 'live', checkedIn: 'browser', mrtdShort: `${'a'.repeat(16)}…` },
      attestationRaw: attestation,
    });
    expect(body.rows[1]).toMatchObject({ e2ee: false, attestation: null, attestationRaw: null });
    expect(body.totals).toMatchObject({ calls: 2, e2ee: 1, plain: 1, tokensIn: 1600, tokensOut: 520, costUsd: 0.005972, running: 0, failed: 0 });
  });
});

describe('GET /api/ledger: the attestation record holds public facts only', () => {
  it('whatever a browser sends, only the schema\'s public fields are stored and shown; no key material beyond the enclave public key', async () => {
    const w = await world();
    const reported = {
      verified: true, nonceOk: true, provider: 'near-ai', hardware: 'intel-tdx', model: 'e2ee-deepseek-v4-flash',
      signingAddress: '0xabc', modelPublicKey: '04' + 'b'.repeat(128), checkedAt: '2026-11-24T10:00:00.000Z', reused: false, ageMs: 0,
      binding: { addressMatches: true, nonceMatches: true, paddingZero: true, debug: false, teeType: 129, mrtd: 'c'.repeat(96) },
      quote: {
        mrtd: 'c'.repeat(96), mrtdShort: `${'c'.repeat(16)}…`, tdAttributes: '0'.repeat(16), signature: 'verified',
        signatureSource: 'live', signatureCheckedIn: 'browser', tcbStatus: 'UpToDate', clientPrivateKey: 'leak',
      },
      // A tampered or buggy client could add anything; none of it may reach the ledger.
      privateKey: 'deadbeef', clientPrivateKey: 'deadbeef', apiKey: 'sk-test', secret: 'x', story: 'Leo is allergic to peanuts',
    };
    // /api/tee/chat stores the attestation as ChatBody parsed it (attestationForLedger), i.e. through this schema.
    const stored = AttestationSummarySchema.parse(reported);
    await insertAiCall({ churchId: w.churchId, purpose: 'note', model: 'e2ee-deepseek-v4-flash', e2ee: true, attestation: stored, costUsd: '0.0001', ok: true });
    h.viewer = w.as('Hannah', 'director');
    const { body } = await ledger();
    const raw = body.rows[0].attestationRaw as Record<string, unknown> & { quote: Record<string, unknown> };
    expect(Object.keys(raw).every((k) => k in AttestationSummarySchema.shape)).toBe(true);
    expect(Object.keys(raw.quote).every((k) => k in AttestationSummarySchema.shape.quote.shape)).toBe(true);
    const json = JSON.stringify(body);
    for (const bad of ['privateKey', 'PrivateKey', 'apiKey', 'secret', 'sk-test', 'deadbeef', 'peanuts']) expect(json).not.toContain(bad);
    expect(raw.modelPublicKey).toBe(reported.modelPublicKey); // the enclave's public key is a public fact
  });
});

describe('desk loaders', () => {
  it('the Sunday pack expects the regulars of each service plus the new family once their card is approved', async () => {
    const w = await world();
    const church = (await getChurch(w.churchId))!;
    const { raw, services } = await loadUpcoming(church, new Date());
    expect(services.map((s) => s.label)).toEqual(['9:00 service', '11:00 service']);
    expect(services.every((s) => s.lessonTitle === 'Waiting with hope')).toBe(true);
    const kids = await loadPackChildren(w.churchId, raw);
    const names = (i: number) => kids[raw[i].id].map((k) => k.firstName);
    expect(names(0)).toEqual(['Ana', 'Leo', 'Malik', 'Theo']); // Sam has no card yet
    expect(names(1)).toEqual(['Ivy']);
    expect(kids[raw[0].id].find((k) => k.firstName === 'Ana')!.lang).toBe('es');
  });

  it('notes list the children with moments at a service, with counts and the note state', async () => {
    const w = await world();
    const church = (await getChurch(w.churchId))!;
    const { services } = await loadUpcoming(church, new Date());
    await insertAssignments([{ serviceId: services[0].id, childId: w.p('Leo').id, buddyId: w.p('Priya').id, status: 'approved' }]);
    await insertMoments([
      { serviceId: services[0].id, childId: w.p('Leo').id, buddyId: w.p('Priya').id, stepKey: 'worship', kind: 'hard', at: new Date() },
      { serviceId: services[0].id, childId: w.p('Leo').id, buddyId: w.p('Priya').id, stepKey: 'craft', kind: 'good', at: new Date() },
    ]);
    const board = await loadNotesBoard(w.churchId, services);
    expect(board[0].children).toEqual([
      expect.objectContaining({ firstName: 'Leo', parents: ['Maria'], counts: { good: 1, hard: 1, break: 0, bathroom: 0, note: 0 }, note: null }),
    ]);
    expect(board[1].children).toEqual([]);
  });

  it("patterns show Leo's 4 of 5 worship times, every Sunday behind it, and what helped the good one", async () => {
    const w = await world();
    const church = (await getChurch(w.churchId))!;
    const boards = await loadPatternsBoard(church, new Date(), w.p('Hannah').id);
    expect(boards.map((b) => b.firstName)).toEqual(['Leo']);
    const [p] = boards[0].patterns;
    expect(p).toMatchObject({ segment: 'worship', kind: 'hard', count: 4, outOf: 5 });
    expect(p.services).toHaveLength(5);
    const starts = p.services.map((s) => Date.parse(s.startsAt));
    expect([...starts].sort((x, y) => x - y)).toEqual(starts); // oldest first
    const good = p.services.flatMap((s) => s.moments).filter((m) => m.kind === 'good');
    expect(good).toEqual([expect.objectContaining({ step: 'Worship', helped: ['Blue headphones during worship'] })]);
    // Only this church's services, all finished.
    const own = new Set((await listServices(w.churchId)).map((s) => s.id));
    expect(p.services.every((s) => own.has(s.serviceId) && Date.parse(s.startsAt) < Date.now())).toBe(true);
  });

  it("the patterns board decrypts card lines, so it logs a director read: once per director, child and day", async () => {
    const w = await world();
    const church = (await getChurch(w.churchId))!;
    const hannah = w.p('Hannah').id;
    const t0 = new Date();
    const reads = async () => (await listAccessForChild(w.p('Leo').id)).filter((e) => e.reason === 'director' && e.viewerId === hannah && e.openedAt >= t0);
    await loadPatternsBoard(church, new Date(), hannah);
    await loadPatternsBoard(church, new Date(), hannah);
    const rows = await reads();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: 'director', serviceId: null, cardId: (await getCardForChild(w.churchId, w.p('Leo').id))!.id });
    expect(rows[0].closedAt?.getTime()).toBe(rows[0].openedAt.getTime());
    // Another director's read is their own row.
    await loadPatternsBoard(church, new Date(), w.p('Maria').id);
    expect((await listAccessForChild(w.p('Leo').id)).filter((e) => e.reason === 'director' && e.openedAt >= t0)).toHaveLength(2);
  });

  it("a draft card stays with the parent: the patterns board neither reads nor logs it", async () => {
    const w = await world();
    const church = (await getChurch(w.churchId))!;
    const card = (await getCardForChild(w.churchId, w.p('Leo').id))!;
    await updateCard(card.id, { status: 'draft' });
    const t0 = new Date();
    const boards = await loadPatternsBoard(church, new Date(), w.p('Hannah').id);
    expect(boards[0].patterns[0].services.flatMap((s) => s.moments).flatMap((m) => m.helped)).toEqual([]);
    expect((await listAccessForChild(w.p('Leo').id)).filter((e) => e.reason === 'director' && e.openedAt >= t0)).toEqual([]);
  });
});
