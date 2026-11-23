import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { setDbForTests, type Db } from '@/db/client';
import * as schema from '@/db/schema';
import { createSandbox } from '@/db/sandbox';
import { listPeople } from '@/db/repo/people';
import { signLink, signValue, verifyValue } from '@/lib/auth/tokens';
import { resolveViewer } from '@/lib/auth/viewer';

beforeAll(async () => {
  process.env.MASTER_KEY = randomBytes(32).toString('base64');
  process.env.LINK_SECRET = randomBytes(32).toString('base64url');
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  setDbForTests(db as unknown as Db);
});

async function personOf(churchId: string, name: string) {
  return (await listPeople(churchId)).find((p) => p.firstName === name)!;
}

describe('signValue', () => {
  it('round-trips and rejects tampering', () => {
    const s = signValue('abc-123');
    expect(verifyValue(s)).toBe('abc-123');
    expect(verifyValue(s.replace('abc', 'abd'))).toBeNull();
    expect(verifyValue('abc-123')).toBeNull();
    expect(verifyValue('')).toBeNull();
  });
});

describe('resolveViewer', () => {
  it('resolves a sandbox persona from hd_sbx + hd_as', async () => {
    const a = await createSandbox();
    const maria = await personOf(a.churchId, 'Maria');
    const v = await resolveViewer({ sbx: signValue(a.churchId), as: maria.id });
    expect(v).toEqual({ churchId: a.churchId, personId: maria.id, role: 'parent', sandbox: true });
    const priya = await personOf(a.churchId, 'Priya');
    expect((await resolveViewer({ sbx: signValue(a.churchId), as: priya.id }))?.role).toBe('buddy');
    const hannah = await personOf(a.churchId, 'Hannah');
    expect((await resolveViewer({ sbx: signValue(a.churchId), as: hannah.id }))?.role).toBe('director');
  });

  it('room leader persona is a buddy flagged :leader', async () => {
    const a = await createSandbox();
    const tom = await personOf(a.churchId, 'Tom');
    const v = await resolveViewer({ sbx: signValue(a.churchId), as: `${tom.id}:leader` });
    expect(v).toEqual({ churchId: a.churchId, personId: tom.id, role: 'leader', sandbox: true });
    const maria = await personOf(a.churchId, 'Maria');
    expect(await resolveViewer({ sbx: signValue(a.churchId), as: `${maria.id}:leader` })).toBeNull();
  });

  it('a sandbox cookie for church A cannot act as a person of church B', async () => {
    const a = await createSandbox();
    const b = await createSandbox();
    const mariaB = await personOf(b.churchId, 'Maria');
    expect(await resolveViewer({ sbx: signValue(a.churchId), as: mariaB.id })).toBeNull();
  });

  it('children and garbage person ids are not viewers', async () => {
    const a = await createSandbox();
    const leo = await personOf(a.churchId, 'Leo');
    expect(await resolveViewer({ sbx: signValue(a.churchId), as: leo.id })).toBeNull();
    expect(await resolveViewer({ sbx: signValue(a.churchId), as: 'not-a-uuid' })).toBeNull();
    expect(await resolveViewer({ sbx: signValue(a.churchId) })).toBeNull();
  });

  it('tampered or unsigned hd_sbx gives null', async () => {
    const a = await createSandbox();
    const maria = await personOf(a.churchId, 'Maria');
    expect(await resolveViewer({ sbx: a.churchId, as: maria.id })).toBeNull();
    expect(await resolveViewer({ sbx: signValue(a.churchId) + 'x', as: maria.id })).toBeNull();
  });

  it('a valid link resolves with the role from the claims', async () => {
    const a = await createSandbox();
    const priya = await personOf(a.churchId, 'Priya');
    const link = signLink({ c: a.churchId, p: priya.id, r: 'buddy', exp: Math.floor(Date.now() / 1000) + 600 });
    expect(await resolveViewer({ link })).toEqual({ churchId: a.churchId, personId: priya.id, role: 'buddy', sandbox: true });
  });

  it('an expired link gives null', async () => {
    const a = await createSandbox();
    const priya = await personOf(a.churchId, 'Priya');
    const link = signLink({ c: a.churchId, p: priya.id, r: 'buddy', exp: Math.floor(Date.now() / 1000) - 10 });
    expect(await resolveViewer({ link })).toBeNull();
  });

  it('a link whose person is not in its church gives null', async () => {
    const a = await createSandbox();
    const b = await createSandbox();
    const priyaB = await personOf(b.churchId, 'Priya');
    const link = signLink({ c: a.churchId, p: priyaB.id, r: 'buddy', exp: Math.floor(Date.now() / 1000) + 600 });
    expect(await resolveViewer({ link })).toBeNull();
  });
});
