// What a failed draft or translation means for the parent. Built from error classes and codes only: no story
// text, no model output, nothing a server returned ever reaches the message.
import type { EnclaveFailure } from '@/components/enclave/EnclaveStatus';
import { StoryLengthError } from '@/lib/card/pipeline';
import type { MessageKey } from '@/lib/i18n';
import { BudgetError, EnclaveError } from '@/lib/venice/enclaveClient';

export type DraftFailure =
  /** The enclave check failed: nothing was encrypted or sent (EnclaveStatus says so in ENCLAVE_COPY words). */
  | { kind: 'enclave'; status: EnclaveFailure }
  | { kind: 'message'; key: MessageKey };

const name = (e: unknown) => (e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '');

export const isAbort = (e: unknown) => name(e) === 'AbortError';

export function describeDraftError(e: unknown): DraftFailure {
  if (e instanceof EnclaveError) {
    if (e.code === 'quote_unverified') {
      const q = e.attestation?.quote;
      return { kind: 'enclave', status: { error: 'signature', reason: q?.reasonCode ?? 'unknown' } };
    }
    // 429 is Halfdoor's own per-minute limit on enclave checks (Venice's are retried server-side): wait and retry.
    if (e.code === 'attestation_request_failed_429') return { kind: 'message', key: 'parent.error.busy' };
    if (e.code.startsWith('attestation_request_failed')) return { kind: 'enclave', status: { error: 'unavailable' } };
    if (e.code === 'plaintext_in_e2ee_stream') return { kind: 'message', key: 'parent.error.unsealed' };
    return { kind: 'message', key: 'parent.error.noAnswer' };
  }
  // checkAttestation's own error: Venice's answer did not bind the key and our one-time code.
  if (name(e) === 'AttestationError') {
    const code = (e as { code?: unknown }).code;
    return { kind: 'enclave', status: { error: code === 'not_verified' || code === 'model_mismatch' ? 'unavailable' : 'binding' } };
  }
  if (e instanceof BudgetError) return { kind: 'message', key: e.reason === 'sandbox_cap' ? 'parent.error.budgetSandbox' : 'parent.error.budgetDaily' };
  if (e instanceof StoryLengthError) return { kind: 'message', key: 'parent.error.length' };
  // fetch() rejects with a TypeError when the network is down.
  if (e instanceof TypeError) return { kind: 'message', key: 'parent.error.network' };
  return { kind: 'message', key: 'parent.error.unusable' };
}
