// SERVER-ONLY. The end-to-end test seam's one switch. When it is on, the two model calls (the browser's enclave
// call and the server's lesson call) replay recorded outputs, the TEE proxy routes refuse to reach Venice, and
// /demo skips its per-connection limit. It is off unless BOTH hold:
//   - NODE_ENV is not 'production' (`next build` inlines NODE_ENV, so every production build has it off), and
//   - PLAYWRIGHT_ENCLAVE_FIXTURE is exactly '1' (playwright.config.ts sets it for the dev server it starts).
// The browser never reads this flag itself: the server passes the recorded outputs down as a prop, or nothing.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EnclaveReplay } from '@/lib/venice/fixtureChat';

export const FIXTURE_ENV = 'PLAYWRIGHT_ENCLAVE_FIXTURE';

export function testFixtureMode(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.PLAYWRIGHT_ENCLAVE_FIXTURE === '1';
}

/** The recorded exchange (see scripts/record-e2e-fixture.ts). Read only while the seam is on. */
export type EnclaveRecording = {
  provenance: Record<string, unknown>;
  card: { childName: string; story: string; text: string };
  translate?: { text: string };
  note: { lang: 'en' | 'es'; moments: { step: string; kind: string; helped: string[] }[]; text: string };
  lesson: { draft: unknown };
};

export const RECORDING_PATH = join('tests', 'e2e', 'fixtures', 'enclave-recording.json');

let cached: EnclaveRecording | null = null;
function recording(): EnclaveRecording {
  // Fails loudly: with the seam on, a missing recording must stop the test, never fall through to a real call.
  cached ??= JSON.parse(readFileSync(join(process.cwd(), RECORDING_PATH), 'utf8')) as EnclaveRecording;
  return cached;
}

/** What the browser's enclave call replays, per purpose; null (the real enclave) unless the seam is on. */
export function enclaveReplay(): EnclaveReplay | null {
  if (!testFixtureMode()) return null;
  const r = recording();
  return { card: r.card.text, note: r.note.text, ...(r.translate ? { translate: r.translate.text } : {}) };
}

/** The recorded lesson draft (unparsed); null (the real model call) unless the seam is on. */
export function lessonRecording(): unknown {
  if (!testFixtureMode()) return null;
  return recording().lesson.draft;
}
