// SERVER-ONLY. Validation and ciphertext relay for the Venice TEE proxy. Never logs bodies.
import { z } from 'zod';
import { looksEncrypted } from '@/lib/crypto/e2ee';
import { finalizeAiCall } from './budget';
import { ALLOWED_BROWSER_MODELS, PRICES, type Usage } from './prices';
import { isPubKeyHex, normalizePubKey } from './request';

export { VENICE_BASE, buildUpstreamBody, upstreamHeaders } from './request';

const HEX = /^[0-9a-f]+$/i;
export const pubKeyHex = z.string().refine(isPubKeyHex, 'bad public key');
/** Browser routes only accept the allowlisted model(s), which must also be priced e2ee models. */
export const modelId = z.string().refine((m) => m.startsWith('e2ee-') && m in PRICES && ALLOWED_BROWSER_MODELS.includes(m), 'unsupported model');
export const nonceHex = z.string().length(64).regex(HEX);

export const AttestationSummarySchema = z.object({
  verified: z.boolean(),
  nonceOk: z.boolean(),
  provider: z.string().max(100),
  hardware: z.string().max(100).nullable(),
  model: z.string().max(100),
  signingAddress: z.string().max(100).nullable(),
  modelPublicKey: z.string().max(200),
  checkedAt: z.string().max(40),
});

export const ChatBody = z.object({
  model: modelId,
  purpose: z.enum(['card', 'translate', 'note']),
  messages: z
    .array(z.object({ role: z.enum(['system', 'user']), content: z.string().max(100_000).refine(looksEncrypted, 'plaintext rejected') }))
    .min(1)
    .max(4),
  clientPubKey: pubKeyHex,
  modelPubKey: pubKeyHex,
  maxTokens: z.number().int().positive().optional(),
  attestation: AttestationSummarySchema.optional(),
});
export type ChatBody = z.infer<typeof ChatBody>;

/** Client-supplied attestation is stored only if it matches this request's model and enclave key. */
export function attestationForLedger(b: ChatBody): { attestation: unknown; mismatch: boolean } {
  const a = b.attestation;
  if (!a) return { attestation: null, mismatch: false };
  const ok = a.model === b.model && normalizePubKey(a.modelPublicKey) === normalizePubKey(b.modelPubKey);
  return ok ? { attestation: a, mismatch: false } : { attestation: null, mismatch: true };
}

/** Passes the SSE bytes through unchanged; finalises the reserved ledger row at the end. */
export function relayAndRecord(upstream: ReadableStream<Uint8Array>, row: { id: string; model: string }): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let usage: Usage | null = null;
  let finished = false;

  const scan = (rest: boolean) => {
    const lines = buf.split('\n');
    buf = rest ? '' : (lines.pop() ?? '');
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim();
      if (!d || d === '[DONE]') continue;
      try {
        const u = (JSON.parse(d) as { usage?: Partial<Usage> }).usage;
        if (u && typeof u.prompt_tokens === 'number' && typeof u.completion_tokens === 'number') {
          usage = { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens };
        }
      } catch { /* not JSON */ }
    }
  };
  const finish = async (ok: boolean) => {
    if (finished) return;
    finished = true;
    try {
      await finalizeAiCall(row.id, { ok, model: row.model, usage });
    } catch { /* the reservation (estimate) stays; nothing logged */ }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          buf += dec.decode();
          scan(true);
          await finish(true);
          controller.close();
          return;
        }
        buf += dec.decode(value, { stream: true });
        scan(false);
        controller.enqueue(value);
      } catch {
        await finish(false);
        controller.error(new Error('upstream stream failed'));
      }
    },
    async cancel() {
      await finish(false);
      await reader.cancel().catch(() => undefined);
    },
  });
}

/** `free` only for a real non-200 upstream status (not billed); otherwise the estimate stays. */
export async function failReserved(row: { id: string; model: string }, free: boolean): Promise<void> {
  try {
    await finalizeAiCall(row.id, { ok: false, model: row.model, free });
  } catch { /* ignore */ }
}
