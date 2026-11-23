// Isomorphic enclave client: attest, encrypt, stream, decrypt. No server-only imports.
import { checkAttestation, type AttestationSummary } from '@/lib/crypto/attestation';
import { decryptFromEnclave, encryptForEnclave, looksEncrypted, newClientKeys } from '@/lib/crypto/e2ee';
import type { Usage } from './prices';
import { VENICE_BASE, buildUpstreamBody, upstreamHeaders } from './request';

export type Purpose = 'card' | 'translate' | 'note';
export type NodeAccess = { apiKey: string; baseUrl?: string };

export type EnclaveChatOpts = {
  model: string;
  purpose: Purpose;
  system: string;
  user: string;
  maxTokens?: number;
  signal?: AbortSignal;
  onAttestation?: (a: AttestationSummary) => void;
  /** Node variant (eval): call Venice directly with this key. Absent = browser, via our two routes. */
  node?: NodeAccess;
  fetchImpl?: typeof fetch;
};

export type EnclaveResult = { text: string; attestation: AttestationSummary; usage: Usage | null };

export type EnclaveChat = (opts: EnclaveChatOpts) => Promise<EnclaveResult>;

export class EnclaveError extends Error {
  constructor(readonly code: string) {
    super(`enclave error: ${code}`);
    this.name = 'EnclaveError';
  }
}

/** Our own 429 from /api/tee/chat. */
export class BudgetError extends Error {
  constructor(readonly reason: 'sandbox_cap' | 'daily_cap') {
    super(`budget exceeded: ${reason}`);
    this.name = 'BudgetError';
  }
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Shared SSE reader: decrypts every encrypted delta, captures the plaintext usage chunk. */
export async function readEnclaveStream(
  body: ReadableStream<Uint8Array>,
  privateKey: Uint8Array,
): Promise<{ text: string; usage: Usage | null }> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let text = '';
  let usage: Usage | null = null;

  const handle = (line: string) => {
    if (!line.startsWith('data:')) return;
    const d = line.slice(5).trim();
    if (!d || d === '[DONE]') return;
    let j: { usage?: Partial<Usage>; choices?: { delta?: { content?: string } }[] };
    try {
      j = JSON.parse(d);
    } catch {
      return;
    }
    if (j.usage && typeof j.usage.prompt_tokens === 'number' && typeof j.usage.completion_tokens === 'number') {
      usage = { prompt_tokens: j.usage.prompt_tokens, completion_tokens: j.usage.completion_tokens };
    }
    const c = j.choices?.[0]?.delta?.content;
    if (c) {
      if (!looksEncrypted(c)) throw new EnclaveError('plaintext_in_e2ee_stream');
      text += decryptFromEnclave(c, privateKey);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      lines.forEach(handle);
    }
    buf += dec.decode();
    buf.split('\n').forEach(handle);
  } catch (e) {
    await reader.cancel().catch(() => undefined);
    throw e;
  }
  return { text, usage };
}

export const enclaveChat: EnclaveChat = async (opts) => {
  const f = opts.fetchImpl ?? fetch;
  const base = opts.node ? (opts.node.baseUrl ?? VENICE_BASE) : '';
  const nonce = randomHex(32);
  const authHeaders: Record<string, string> = opts.node ? { Authorization: `Bearer ${opts.node.apiKey}` } : {};

  const attUrl = opts.node
    ? `${base}/tee/attestation?model=${opts.model}&nonce=${nonce}`
    : `/api/tee/attestation?model=${encodeURIComponent(opts.model)}&nonce=${nonce}`;
  const attRes = await f(attUrl, { headers: authHeaders, signal: opts.signal });
  if (!attRes.ok) throw new EnclaveError(`attestation_request_failed_${attRes.status}`);
  const attestation = checkAttestation(await attRes.json(), nonce, opts.model);
  opts.onAttestation?.(attestation);

  const keys = newClientKeys();
  try {
    const messages = [
      { role: 'system' as const, content: encryptForEnclave(opts.system, attestation.modelPublicKey) },
      { role: 'user' as const, content: encryptForEnclave(opts.user, attestation.modelPublicKey) },
    ];
    const res = opts.node
      ? await f(`${base}/chat/completions`, {
          method: 'POST',
          headers: upstreamHeaders(opts.node.apiKey, keys.publicKeyHex, attestation.modelPublicKey),
          body: JSON.stringify(buildUpstreamBody(opts.model, messages, opts.maxTokens)),
          signal: opts.signal,
        })
      : await f('/api/tee/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: opts.model,
            purpose: opts.purpose,
            messages,
            clientPubKey: keys.publicKeyHex,
            modelPubKey: attestation.modelPublicKey,
            maxTokens: opts.maxTokens,
            attestation,
          }),
          signal: opts.signal,
        });
    if (res.status === 429 && !opts.node) {
      const j = (await res.json().catch(() => null)) as { reason?: string } | null;
      if (j?.reason === 'sandbox_cap' || j?.reason === 'daily_cap') throw new BudgetError(j.reason);
    }
    if (!res.ok || !res.body) throw new EnclaveError(`request_failed_${res.status}`);
    const { text, usage } = await readEnclaveStream(res.body, keys.privateKey);
    return { text, attestation, usage };
  } finally {
    keys.privateKey.fill(0);
  }
};
