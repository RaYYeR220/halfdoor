// SERVER-ONLY. Validation and ciphertext relay for the Venice TEE proxy. Never logs bodies.
import { z } from 'zod';
import { looksEncrypted } from '@/lib/crypto/e2ee';
import { recordAiCall } from './budget';
import { CAPS, PRICES, type Usage } from './prices';

export const VENICE_BASE = 'https://api.venice.ai/api/v1';

const HEX = /^[0-9a-f]+$/i;
export const pubKeyHex = z.string().min(128).max(130).regex(HEX);
export const modelId = z.string().refine((m) => m.startsWith('e2ee-') && m in PRICES, 'unsupported model');
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
    .array(z.object({ role: z.enum(['system', 'user']), content: z.string().refine(looksEncrypted, 'plaintext rejected') }))
    .min(1)
    .max(4),
  clientPubKey: pubKeyHex,
  modelPubKey: pubKeyHex,
  maxTokens: z.number().int().positive().optional(),
  attestation: AttestationSummarySchema.optional(),
});
export type ChatBody = z.infer<typeof ChatBody>;

/** The upstream body is rebuilt from validated fields only. */
export function buildUpstreamBody(b: ChatBody) {
  return {
    model: b.model,
    messages: b.messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
    max_tokens: Math.min(b.maxTokens ?? CAPS.maxTokens, CAPS.maxTokens),
    venice_parameters: { include_venice_system_prompt: false, disable_thinking: true },
  };
}

export function upstreamHeaders(apiKey: string, b: Pick<ChatBody, 'clientPubKey' | 'modelPubKey'>): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-Venice-TEE-Client-Pub-Key': b.clientPubKey,
    'X-Venice-TEE-Model-Pub-Key': b.modelPubKey,
    'X-Venice-TEE-Signing-Algo': 'ecdsa',
  };
}

export type LedgerBase = { churchId: string; purpose: ChatBody['purpose']; model: string; attestation: unknown };

/** Passes the SSE bytes through unchanged; records exactly one ai_calls row at the end. */
export function relayAndRecord(upstream: ReadableStream<Uint8Array>, base: LedgerBase): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let usage: Usage | null = null;
  let recorded = false;

  const scan = (final: boolean) => {
    const lines = buf.split('\n');
    buf = final ? '' : (lines.pop() ?? '');
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
  const record = async (ok: boolean) => {
    if (recorded) return;
    recorded = true;
    try {
      await recordAiCall({ ...base, attestation: base.attestation ?? null, e2ee: true, ok, usage });
    } catch { /* ledger failure must not break the stream; nothing logged */ }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          buf += dec.decode();
          scan(true);
          await record(true);
          controller.close();
          return;
        }
        buf += dec.decode(value, { stream: true });
        scan(false);
        controller.enqueue(value);
      } catch {
        await record(false);
        controller.error(new Error('upstream stream failed'));
      }
    },
    async cancel() {
      await record(false);
      await reader.cancel().catch(() => undefined);
    },
  });
}

export async function recordFailure(base: LedgerBase): Promise<void> {
  try {
    await recordAiCall({ ...base, attestation: base.attestation ?? null, e2ee: true, ok: false });
  } catch { /* ignore */ }
}
