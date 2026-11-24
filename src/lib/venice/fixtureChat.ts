// The end-to-end test seam's stand-in for enclaveChat: recorded, already-decrypted model outputs, replayed in the
// browser. It sends nothing anywhere (no attestation, no prompt, no child data) and its summary says so:
// quote.signature 'fixture', which the UI shows as "Test fixture — not a real enclave". A page gets it only when
// the server passes a replay down (src/lib/testing/fixtureMode.ts: never in production).
import type { AttestationSummary } from '@/lib/crypto/attestation';
import { EnclaveError, type EnclaveChat, type Purpose } from './enclaveClient';

/** Recorded model text per purpose. Ids that change per sandbox are placeholders: {{moment:N}} and {{item:N}}. */
export type EnclaveReplay = Partial<Record<Purpose, string>>;

export const isFixture = (a: Pick<AttestationSummary, 'quote'> | null | undefined): boolean => a?.quote.signature === 'fixture';

/** A summary that claims nothing: no binding, no signature, no enclave. */
export function fixtureAttestation(model: string): AttestationSummary {
  return {
    verified: false,
    nonceOk: false,
    provider: 'test fixture',
    hardware: null,
    model,
    signingAddress: null,
    modelPublicKey: '',
    checkedAt: new Date().toISOString(),
    reused: false,
    ageMs: 0,
    binding: { addressMatches: false, nonceMatches: false, paddingZero: false, debug: false, teeType: 0, mrtd: '' },
    quote: { mrtd: '', mrtdShort: '—', tdAttributes: '', signature: 'fixture' },
  };
}

/** The ids the prompt carries, in order: the note's moments and the translation's items. */
function idsIn(user: string): { moment: string[]; item: string[] } {
  try {
    const j = JSON.parse(user) as { moments?: { id?: unknown }[]; items?: { id?: unknown }[] };
    const ids = (xs: { id?: unknown }[] | undefined) => (Array.isArray(xs) ? xs.map((x) => (typeof x?.id === 'string' ? x.id : '')) : []);
    return { moment: ids(j.moments), item: ids(j.items) };
  } catch {
    return { moment: [], item: [] }; // the card prompt is the story itself, not JSON
  }
}

/** Put this run's ids into the recorded text. A placeholder with no id left stays as it is (the verifier drops it). */
export function fillIds(text: string, user: string): string {
  const ids = idsIn(user);
  return text.replace(/\{\{(moment|item):(\d+)\}\}/g, (m, kind: 'moment' | 'item', n: string) => ids[kind][Number(n)] || m);
}

export function fixtureChat(replay: EnclaveReplay): EnclaveChat {
  return async (opts) => {
    opts.signal?.throwIfAborted();
    const recorded = replay[opts.purpose];
    if (recorded === undefined) throw new EnclaveError('fixture_missing');
    const attestation = fixtureAttestation(opts.model);
    opts.onAttestation?.(attestation);
    await new Promise((r) => setTimeout(r, 50));
    opts.signal?.throwIfAborted();
    return { text: fillIds(recorded, opts.user), attestation, usage: null };
  };
}
