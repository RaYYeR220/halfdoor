// The end-to-end test seam (lib/testing/fixtureMode + lib/venice/fixtureChat): on only outside production with the
// flag set, and then it replays recorded outputs without reaching Venice. In production it is off whatever the env.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/auth/viewer', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/viewer')>()),
  getViewer: vi.fn(async () => ({ churchId: 'c', personId: 'p', role: 'parent', sandbox: true })),
}));

import { setDbForTests, type Db } from '@/db/client';
import * as schema from '@/db/schema';
import { createSandboxReserved } from '@/db/sandbox';
import { GET as attestationGET } from '@/app/api/tee/attestation/route';
import { POST as chatPOST } from '@/app/api/tee/chat/route';
import { draftCard } from '@/lib/card/pipeline';
import { signatureText } from '@/lib/crypto/attestation';
import { draftParentNote } from '@/lib/note/pipeline';
import { lessonToDraft, verifyLesson } from '@/lib/schedule/lesson';
import { SAMPLE_LESSON } from '@/lib/desk/sampleLesson';
import { RECORDING_PATH, enclaveReplay, lessonRecording, testFixtureMode, type EnclaveRecording } from '@/lib/testing/fixtureMode';
import { EnclaveError } from '@/lib/venice/enclaveClient';
import { fillIds, fixtureAttestation, fixtureChat, isFixture } from '@/lib/venice/fixtureChat';
import { E2EE_MODEL } from '@/lib/venice/prices';
import { AttestationSummarySchema } from '@/lib/venice/teeProxy';

const recording = JSON.parse(readFileSync(resolve(__dirname, '../..', RECORDING_PATH), 'utf8')) as EnclaveRecording;

/** NODE_ENV and the flag, as a deployment would have them. */
function env(nodeEnv: string, flag: string | undefined) {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('PLAYWRIGHT_ENCLAVE_FIXTURE', flag);
}

let db: ReturnType<typeof drizzle>;
beforeAll(async () => {
  process.env.MASTER_KEY = randomBytes(32).toString('base64');
  process.env.LINK_SECRET = randomBytes(32).toString('base64url');
  db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  setDbForTests(db as unknown as Db);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('the switch', () => {
  test('on only when NODE_ENV is not production AND the flag is exactly "1"', () => {
    const cases: [string, string | undefined, boolean][] = [
      ['production', '1', false],
      ['production', undefined, false],
      ['development', '1', true],
      ['test', '1', true],
      ['development', undefined, false],
      ['development', '0', false],
      ['development', 'true', false],
    ];
    for (const [nodeEnv, flag, on] of cases) {
      env(nodeEnv, flag);
      expect(testFixtureMode(), `${nodeEnv} + ${flag}`).toBe(on);
    }
  });

  test('production: the layout passes no replay and the lesson has no recording, even with the flag', () => {
    env('production', '1');
    expect(enclaveReplay()).toBeNull();
    expect(lessonRecording()).toBeNull();
  });

  test('outside production with the flag: the recorded outputs, per purpose', () => {
    env('development', '1');
    expect(enclaveReplay()).toEqual({ card: recording.card.text, note: recording.note.text, translate: recording.translate!.text });
    expect(lessonRecording()).toEqual(recording.lesson.draft);
  });
});

describe('the TEE proxy routes', () => {
  const attReq = () => new Request(`http://x/api/tee/attestation?model=${E2EE_MODEL}&nonce=${'ab'.repeat(32)}`);
  const chatReq = () => new Request('http://x/api/tee/chat', { method: 'POST', body: '{}' });

  test('with the seam on, they refuse and never reach Venice', async () => {
    env('development', '1');
    vi.stubEnv('VENICE_API_KEY', 'test-key');
    const f = vi.fn(async () => Response.json({ verified: true }));
    vi.stubGlobal('fetch', f);
    expect((await attestationGET(attReq())).status).toBe(409);
    expect((await chatPOST(chatReq())).status).toBe(409);
    expect(f).not.toHaveBeenCalled();
  });

  test('in production the flag changes nothing: the attestation goes upstream, the chat body is checked', async () => {
    env('production', '1');
    vi.stubEnv('VENICE_API_KEY', 'test-key');
    const f = vi.fn(async () => new Response('x', { status: 500 }));
    vi.stubGlobal('fetch', f);
    expect((await attestationGET(attReq())).status).toBe(502);
    expect(f).toHaveBeenCalledTimes(1);
    expect((await chatPOST(chatReq())).status).toBe(400);
  });

  test('a fixture summary is never accepted as an attestation by the real chat route', () => {
    const a = fixtureAttestation(E2EE_MODEL);
    expect(AttestationSummarySchema.safeParse(a).success).toBe(false);
    // ...and only because of the signature: the same shape marked verified would pass the schema.
    expect(AttestationSummarySchema.safeParse({ ...a, quote: { ...a.quote, signature: 'verified' } }).success).toBe(true);
  });
});

describe('the lesson call', () => {
  test('in production the flag changes nothing: the real call path runs (here: no key)', async () => {
    env('production', '1');
    vi.stubEnv('VENICE_API_KEY', '');
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(lessonToDraft(SAMPLE_LESSON, { churchId: randomUUID() })).rejects.toMatchObject({ code: 'no_key' });
  });

  test('with the seam on: the recorded draft, no model call, and it verifies against the sample lesson', async () => {
    env('development', '1');
    vi.stubEnv('VENICE_API_KEY', '');
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const draft = await lessonToDraft(SAMPLE_LESSON, { churchId: randomUUID() });
    expect(f).not.toHaveBeenCalled();
    expect(draft.title).toBe('Advent, week 1: Waiting with hope');
    expect(verifyLesson(SAMPLE_LESSON, draft).ok).toBe(true);
    expect(await db.select().from(schema.aiCalls)).toHaveLength(0);
  });
});

describe('/demo per-connection limit', () => {
  const sixFrom = async (hash: string) => {
    const made = [];
    for (let i = 0; i < 6; i++) made.push(await createSandboxReserved(hash));
    return made;
  };

  test('in production the flag does not lift it: the 6th sandbox from one connection is refused', async () => {
    env('production', '1');
    const made = await sixFrom('e'.repeat(64));
    expect(made.slice(0, 5).every((m) => m !== null)).toBe(true);
    expect(made[5]).toBeNull();
  }, 120_000);

  test('with the seam on, one connection can make more than 5 (the daily cap still applies)', async () => {
    env('development', '1');
    const made = await sixFrom('f'.repeat(64));
    expect(made.every((m) => m !== null)).toBe(true);
  }, 120_000);
});

describe('the browser replay', () => {
  const replay = () => fixtureChat({ card: recording.card.text, note: recording.note.text, translate: recording.translate!.text });

  test('the recorded card goes through the real parse and verify: lines with quotes, safety word for word', async () => {
    let seen: unknown = null;
    const { card, attestation } = await draftCard(recording.card.story, recording.card.childName, {
      model: E2EE_MODEL, chat: replay(), onAttestation: (a) => (seen = a),
    });
    expect(card.items.length).toBeGreaterThanOrEqual(3);
    expect(card.items.every((i) => i.quotes.length > 0)).toBe(true);
    const safety = card.items.filter((i) => i.section === 'safety');
    expect(safety.length).toBeGreaterThan(0);
    expect(safety.every((i) => i.kind === 'verbatim')).toBe(true);
    expect(isFixture(attestation)).toBe(true);
    expect(seen).toBe(attestation);
  });

  test('the summary claims nothing and says it is a test fixture', () => {
    const a = fixtureAttestation(E2EE_MODEL);
    expect(a.quote.signature).toBe('fixture');
    expect(a.verified).toBe(false);
    expect(Object.values(a.binding).filter((v) => v === true)).toEqual([]);
    expect(signatureText(a)).toMatch(/^Test fixture — not a real enclave/);
    expect(signatureText(a, 'es')).toMatch(/^Datos de prueba/);
  });

  test("the note's evidence points at this run's moments", async () => {
    const id = randomUUID();
    const { note } = await draftParentNote([{ id, ...recording.note.moments[0], kind: 'good' }], 'en', { chat: replay(), childName: 'Sam' });
    expect(note.sentences.length).toBeGreaterThan(0);
    expect(note.sentences.every((s) => s.evidence.includes(id))).toBe(true);
    expect(note.sentences[0].text).toContain('Sam');
  });

  test('ids: filled in order, unknown placeholders left alone, the card prompt untouched', () => {
    const user = JSON.stringify({ moments: [{ id: 'm-a' }, { id: 'm-b' }] });
    expect(fillIds('{{moment:1}} {{moment:0}} {{moment:2}}', user)).toBe('m-b m-a {{moment:2}}');
    expect(fillIds('{{item:0}}', JSON.stringify({ items: [{ id: 'i-a' }] }))).toBe('i-a');
    expect(fillIds('{"items":[]}', 'Sam is 6.')).toBe('{"items":[]}');
  });

  test('a purpose with no recording fails closed; a cancelled run stays cancelled', async () => {
    const chat = fixtureChat({});
    await expect(chat({ model: E2EE_MODEL, purpose: 'note', system: '', user: '' })).rejects.toBeInstanceOf(EnclaveError);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(replay()({ model: E2EE_MODEL, purpose: 'card', system: '', user: '', signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
