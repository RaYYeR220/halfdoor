// Isomorphic enclave client: attest, encrypt, stream, decrypt. No server-only imports.
import { checkAttestation, withSignature, type AttestationSummary } from '@/lib/crypto/attestation';
import { decryptFromEnclave, encryptForEnclave, looksEncrypted, newClientKeys } from '@/lib/crypto/e2ee';
import { quoteBytesFrom, runtimeName, verifyQuoteSignature, type QuoteSignatureResult } from '@/lib/crypto/tdxQuote';
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
  /** Called once the quote binding AND Intel's signature passed, right before encrypting (quote.signature === 'verified'). */
  onAttestation?: (a: AttestationSummary) => void;
  /** Node variant (eval): call Venice directly with this key. Absent = browser, via our two routes. */
  node?: NodeAccess;
  fetchImpl?: typeof fetch;
  /** Injectable for tests; default verifyQuoteSignature (@phala/dcap-qvl, runs where this code runs). */
  verifyQuote?: (quote: Uint8Array) => Promise<QuoteSignatureResult>;
};

export type EnclaveResult = { text: string; attestation: AttestationSummary; usage: Usage | null };

export type EnclaveChat = (opts: EnclaveChatOpts) => Promise<EnclaveResult>;

export class EnclaveError extends Error {
  /** For 'quote_unverified': what was checked and why the signature failed (no user data). */
  constructor(
    readonly code: string,
    readonly attestation?: AttestationSummary,
  ) {
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

/** An attestation whose quote binding AND Intel signature both passed. Only these are ever used or cached. */
type Attested = { summary: AttestationSummary; expiresAt: number };

/**
 * Browser only: Venice rate-limits attestation per key+model (~4 s), so a verified attestation is reused per
 * model for 10 minutes. Our fresh nonce proves freshness when the session's check ran (summary.checkedAt);
 * later calls in the window encrypt to that same checked key. Only verified attestations are cached (an
 * in-flight check is shared but never used before it verifies; a failure is dropped). The Node (eval) path
 * always attests fresh.
 */
export const ATTESTATION_TTL_MS = 10 * 60_000;
const browserAttestations = new Map<string, Promise<Attested>>();

/** Forget cached attestations (tests, or a UI "check again" action). */
export function clearAttestationCache(): void {
  browserAttestations.clear();
}

/** Fetch, bind, then verify Intel's signature. Throws unless all pass: nothing is encrypted before this returns. */
async function attestFresh(opts: EnclaveChatOpts, f: typeof fetch, base: string): Promise<Attested> {
  const nonce = randomHex(32);
  const authHeaders: Record<string, string> = opts.node ? { Authorization: `Bearer ${opts.node.apiKey}` } : {};
  const attUrl = opts.node
    ? `${base}/tee/attestation?model=${opts.model}&nonce=${nonce}`
    : `/api/tee/attestation?model=${encodeURIComponent(opts.model)}&nonce=${nonce}`;
  const attRes = await f(attUrl, { headers: authHeaders, signal: opts.signal });
  if (!attRes.ok) throw new EnclaveError(`attestation_request_failed_${attRes.status}`);
  const raw = (await attRes.json()) as Record<string, unknown>;
  const bound = checkAttestation(raw, nonce, opts.model); // binding; throws on mismatch

  // Binding alone is forgeable (anyone can build a quote with our nonce and their key): fail closed on the signature.
  const verify = opts.verifyQuote ?? verifyQuoteSignature;
  let r: QuoteSignatureResult;
  try {
    r = await verify(quoteBytesFrom(raw.intel_quote));
  } catch (e) {
    r = { status: 'unverified', reasonCode: 'verifier_unavailable', reason: (e instanceof Error ? e.message : 'verifier failed').slice(0, 200), checkedIn: runtimeName() };
  }
  const summary = withSignature(bound, r);
  if (r.status !== 'verified') throw new EnclaveError('quote_unverified', summary);
  return { summary, expiresAt: Date.now() + ATTESTATION_TTL_MS };
}

async function attested(opts: EnclaveChatOpts, f: typeof fetch, base: string): Promise<Attested> {
  if (opts.node) return attestFresh(opts, f, base);
  const hit = browserAttestations.get(opts.model);
  if (hit) {
    const e = await hit.catch(() => null);
    if (e && Date.now() < e.expiresAt) return e;
    if (browserAttestations.get(opts.model) === hit) browserAttestations.delete(opts.model);
    else return attested(opts, f, base); // someone else already refreshed it
  }
  const p = attestFresh(opts, f, base);
  browserAttestations.set(opts.model, p);
  p.catch(() => {
    if (browserAttestations.get(opts.model) === p) browserAttestations.delete(opts.model);
  });
  return p;
}

function dropCached(model: string, entry: Attested): void {
  const p = browserAttestations.get(model);
  if (p) void p.then((e) => e === entry && browserAttestations.get(model) === p && browserAttestations.delete(model), () => undefined);
}

export const enclaveChat: EnclaveChat = async (opts) => {
  const f = opts.fetchImpl ?? fetch;
  const base = opts.node ? (opts.node.baseUrl ?? VENICE_BASE) : '';

  const entry = await attested(opts, f, base);
  const attestation = entry.summary;
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
    if (!res.ok || !res.body) {
      if (!opts.node) dropCached(opts.model, entry); // the enclave key may have rotated: re-attest next time
      throw new EnclaveError(`request_failed_${res.status}`);
    }
    const { text, usage } = await readEnclaveStream(res.body, keys.privateKey);
    return { text, attestation, usage };
  } finally {
    keys.privateKey.fill(0);
  }
};
