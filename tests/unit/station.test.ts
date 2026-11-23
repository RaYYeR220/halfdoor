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
import { listServices } from '@/db/repo/services';
import { newSecurityCode, stationAction } from '@/lib/checkins/station';
import { CODE_ALPHABET } from '@/lib/checkins/types';

beforeAll(async () => {
  process.env.MASTER_KEY = randomBytes(32).toString('base64');
  process.env.LINK_SECRET = randomBytes(32).toString('base64url');
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  setDbForTests(db as unknown as Db);
});

describe('station', () => {
  it('security code alphabet excludes 0,O,1,I', () => {
    expect(CODE_ALPHABET).not.toMatch(/[0O1I]/);
    for (let k = 0; k < 500; k++) expect(newSecurityCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
  });

  it('in creates a check-in, in again is 409, out closes it, out again is 409', async () => {
    const { churchId } = await createSandbox();
    const [service] = await listServices(churchId);
    const leo = (await listPeople(churchId)).find((p) => p.firstName === 'Leo')!;
    const now = new Date();
    const first = await stationAction(service.id, leo.id, 'in', now);
    expect(first).toMatchObject({ ok: true, in: true });
    expect(first.ok && first.securityCode).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(await stationAction(service.id, leo.id, 'in', now)).toEqual({ ok: false, error: 'already_in' });
    expect(await stationAction(service.id, leo.id, 'out', now)).toMatchObject({ ok: true, in: false });
    expect(await stationAction(service.id, leo.id, 'out', now)).toEqual({ ok: false, error: 'not_in' });
    expect(await stationAction(service.id, leo.id, 'in', now)).toMatchObject({ ok: true, in: true });
  });

  it('out without in is 409', async () => {
    const { churchId } = await createSandbox();
    const [service] = await listServices(churchId);
    const ana = (await listPeople(churchId)).find((p) => p.firstName === 'Ana')!;
    expect(await stationAction(service.id, ana.id, 'out', new Date())).toEqual({ ok: false, error: 'not_in' });
  });
});
