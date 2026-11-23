// Isomorphic (browser + Node) checks on the Intel TDX quote inside a Venice attestation.
//
// Both checks gate encryption (enclaveClient): nothing is encrypted or sent unless both pass.
//
// Binding: the quote's REPORTDATA must hold the address of the very key we encrypt to and OUR fresh
// nonce, the TD must not be in debug mode, and the quote must be a TDX (v4, TEE type 0x81) quote. This is
// plain parsing, so on its own it proves nothing about who produced the quote (anyone can build one).
//
// Signature: @phala/dcap-qvl verifies Intel's DCAP chain (PCK certificate chain to Intel's root CA, CRLs,
// TCB info, QE identity, quote signature), which is what makes the binding mean something. It needs Intel
// collateral (public data) from a PCCS, with a bundled snapshot as fallback; any failure is reported as
// `unverified` with a reason, never as verified.
//
// Not checked: the enclave's software measurement (MRTD/RTMRs) against a published list (see HONEST_LIMITS).
import { keccak_256 } from '@noble/hashes/sha3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

export class QuoteParseError extends Error {
  constructor(message: string) {
    super(`quote parse failed: ${message}`);
    this.name = 'QuoteParseError';
  }
}

export const TDX_TEE_TYPE = 0x81;
const HEADER_LEN = 48;
const TD_REPORT_LEN = 584; // TD 1.0 report body (quote v4)
const TD_ATTRIBUTES = 120; // offsets inside the TD report body
const MRTD = 136;
const REPORT_DATA = 520;

export type TdxQuote = {
  version: number;
  teeType: number;
  /** TD_ATTRIBUTES byte 0 bit 0. */
  debug: boolean;
  /** TD_ATTRIBUTES, 8 bytes as hex. */
  tdAttributes: string;
  /** 64 bytes: signing address (20) | zero padding (12) | client nonce (32), as Venice lays it out. */
  reportData: Uint8Array;
  /** Measurement of the initial TD contents, 48 bytes as hex. */
  mrtd: string;
};

const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32le = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

export function parseTdxQuote(quote: Uint8Array): TdxQuote {
  if (quote.length < HEADER_LEN + TD_REPORT_LEN) throw new QuoteParseError('too short');
  const version = u16le(quote, 0);
  const teeType = u32le(quote, 4);
  if (version !== 4) throw new QuoteParseError(`unsupported version ${version}`);
  if (teeType !== TDX_TEE_TYPE) throw new QuoteParseError(`not a TDX quote (tee type ${teeType.toString(16)})`);
  const body = quote.subarray(HEADER_LEN, HEADER_LEN + TD_REPORT_LEN);
  const attrs = body.slice(TD_ATTRIBUTES, TD_ATTRIBUTES + 8);
  return {
    version,
    teeType,
    debug: (attrs[0] & 1) === 1,
    tdAttributes: bytesToHex(attrs),
    reportData: body.slice(REPORT_DATA, REPORT_DATA + 64),
    mrtd: bytesToHex(body.slice(MRTD, MRTD + 48)),
  };
}

/** Venice sends `intel_quote` as hex; base64 is accepted too. */
export function quoteBytesFrom(v: unknown): Uint8Array {
  if (typeof v !== 'string' || v.length === 0) throw new QuoteParseError('no quote');
  if (/^[0-9a-f]+$/i.test(v) && v.length % 2 === 0) return hexToBytes(v.toLowerCase());
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(v) && v.length % 4 === 0) {
    const bin = atob(v);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }
  throw new QuoteParseError('quote is neither hex nor base64');
}

/** Ethereum-style address of a secp256k1 key: last 20 bytes of keccak-256(X || Y). Lowercase hex, no 0x. */
export function addressFromPublicKey(pubHex: string): string {
  const k = pubHex.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]+$/.test(k)) throw new Error('public key is not hex');
  let xy: string;
  if (k.length === 130 && k.startsWith('04')) xy = k.slice(2);
  else if (k.length === 128) xy = k;
  else throw new Error('public key must be 64 bytes (X||Y) or 65 bytes with the 04 prefix');
  return bytesToHex(keccak_256(hexToBytes(xy)).slice(12));
}

/** The key we encrypt to: `signing_key`, else `signing_public_key` (the same choice checkAttestation makes). */
export function enclaveKeyOf(att: unknown): string | null {
  const a = (att && typeof att === 'object' ? att : {}) as Record<string, unknown>;
  for (const k of [a.signing_key, a.signing_public_key]) if (typeof k === 'string' && k.length > 0) return k;
  return null;
}

export type QuoteBinding = {
  addressMatches: boolean;
  nonceMatches: boolean;
  paddingZero: boolean;
  debug: boolean;
  teeType: number;
  mrtd: string;
};

/** Throws QuoteParseError when the quote is missing or unparseable. */
export function checkQuoteBinding(att: unknown, nonce: string): QuoteBinding {
  const a = (att && typeof att === 'object' ? att : {}) as Record<string, unknown>;
  const q = parseTdxQuote(quoteBytesFrom(a.intel_quote));
  const rd = bytesToHex(q.reportData);
  const key = enclaveKeyOf(a);
  let address: string | null = null;
  try {
    address = key ? addressFromPublicKey(key) : null;
  } catch {
    address = null;
  }
  return {
    addressMatches: address !== null && rd.slice(0, 40) === address,
    nonceMatches: /^[0-9a-f]{64}$/i.test(nonce) && rd.slice(64, 128) === nonce.toLowerCase(),
    paddingZero: /^0{24}$/.test(rd.slice(40, 64)),
    debug: q.debug,
    teeType: q.teeType,
    mrtd: q.mrtd,
  };
}

/// ---------------------------------------------------------------- Intel signature chain

export type SignatureReasonCode = 'collateral_unavailable' | 'verification_failed' | 'verifier_unavailable';
export type CheckedIn = 'browser' | 'node';
/** Where the Intel collateral came from: fetched live from the PCCS, or the bundled snapshot (with its capture date). */
export type CollateralSource = 'live' | `snapshot ${string}`;

export type QuoteSignatureResult = {
  status: 'verified' | 'unverified';
  /** Intel TCB status of the platform, e.g. UpToDate / OutOfDate (only when verified; any status is accepted but shown). */
  tcbStatus?: string;
  advisoryIds?: string[];
  reasonCode?: SignatureReasonCode;
  /** Technical reason (no user data), only when unverified. */
  reason?: string;
  /** Where this check actually ran. */
  checkedIn: CheckedIn;
  /** Which collateral the chain was checked against (absent when none could be obtained). */
  collateral?: CollateralSource;
};

/** Collateral as @phala/dcap-qvl expects it (public Intel data). */
export type Collateral = Record<string, unknown>;

/** Bundled fallback (scripts/capture-collateral.ts), keyed by `${FMSPC}:${ca}`; PCK chains come from each quote. */
export type CollateralSnapshot = { capturedAt: string; source?: string; validUntil?: string; entries: Record<string, Collateral> };

export type VerifyQuoteOpts = {
  /** Live collateral. Default: the library's fetcher against the public PCCS (CORS-enabled, so it runs in the browser). */
  getCollateral?: (quote: Uint8Array) => Promise<Collateral>;
  /** Fallback when the live fetch fails. Default: the bundled snapshot (loaded lazily). */
  snapshot?: () => Promise<CollateralSnapshot | null>;
  /** Verification time; default now. */
  nowSecs?: number;
  /** Deadline for the live PCCS fetch before falling back to the snapshot (default 4 s). */
  liveTimeoutMs?: number;
};

export const PCCS_URL = 'https://pccs.phala.network';
const LIVE_TIMEOUT_MS = 4_000;
const COLLATERAL_TTL_MS = 60 * 60_000;
const MAX_REASON = 200;

export const runtimeName = (): CheckedIn => (typeof window !== 'undefined' && typeof document !== 'undefined' ? 'browser' : 'node');

type Dcap = typeof import('@phala/dcap-qvl');
let dcap: Promise<Dcap> | null = null;
/** Loaded on first use so the verifier stays out of the initial browser bundle. */
function loadDcap(): Promise<Dcap> {
  dcap ??= import('@phala/dcap-qvl')
    .then((m) => ((m as { default?: Dcap }).default ?? m) as Dcap)
    .catch((e) => {
      dcap = null;
      throw e;
    });
  return dcap;
}

/** Start loading the verifier early (e.g. when an enclave form opens) so the gated call is quicker. */
export function preloadQuoteVerifier(): void {
  loadDcap().catch(() => undefined);
}

/** The bundled collateral snapshot (its own lazy chunk), or null if it cannot be loaded. */
export async function loadCollateralSnapshot(): Promise<CollateralSnapshot | null> {
  try {
    const m = await import('./collateral-snapshot.json');
    return ((m as { default?: unknown }).default ?? m) as CollateralSnapshot;
  } catch {
    return null;
  }
}

/** Live collateral per PCK certificate chain (i.e. per machine), successful fetches only. */
const collateralCache = new Map<string, { at: number; collateral: Collateral }>();
export function clearCollateralCache(): void {
  collateralCache.clear();
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, MAX_REASON);

/**
 * Full DCAP check of the quote. Live collateral first; only if it cannot be FETCHED is the bundled snapshot
 * used (still a full chain check, labelled with its date). A verification failure never falls back.
 */
export async function verifyQuoteSignature(quote: Uint8Array, opts: VerifyQuoteOpts = {}): Promise<QuoteSignatureResult> {
  const checkedIn = runtimeName();
  let lib: Dcap;
  try {
    lib = await loadDcap();
  } catch (e) {
    return { status: 'unverified', reasonCode: 'verifier_unavailable', reason: msg(e), checkedIn };
  }

  let collateral: Collateral;
  let source: CollateralSource;
  try {
    const parsed = lib.Quote.parse(quote);
    const machine = bytesToHex(sha256(parsed.rawCertChain()));
    const hit = collateralCache.get(machine);
    if (hit && Date.now() - hit.at < COLLATERAL_TTL_MS) {
      collateral = hit.collateral;
      source = 'live';
    } else {
      const live =
        opts.getCollateral ??
        (async (q: Uint8Array) =>
          (await lib.getCollateral(PCCS_URL, q, { timeoutMs: opts.liveTimeoutMs ?? LIVE_TIMEOUT_MS })) as unknown as Collateral);
      try {
        collateral = await live(quote);
        source = 'live';
        collateralCache.set(machine, { at: Date.now(), collateral });
      } catch (liveErr) {
        const snap = await (opts.snapshot ?? loadCollateralSnapshot)().catch(() => null);
        const platform = `${bytesToHex(lib.intel.getFmspc(parsed)).toUpperCase()}:${lib.intel.getCa(parsed)}`;
        const entry = snap?.entries[platform];
        if (!snap || !entry) {
          throw new Error(`live PCCS: ${msg(liveErr)}; snapshot: ${snap ? `no entry for ${platform}` : 'unavailable'}`);
        }
        collateral = entry;
        source = `snapshot ${snap.capturedAt.slice(0, 10)}`;
      }
    }
  } catch (e) {
    return { status: 'unverified', reasonCode: 'collateral_unavailable', reason: msg(e), checkedIn };
  }

  try {
    const now = opts.nowSecs ?? Math.floor(Date.now() / 1000);
    const r = lib.verify(quote, collateral as unknown as Parameters<Dcap['verify']>[1], now);
    return { status: 'verified', tcbStatus: String(r.status), advisoryIds: [...(r.advisory_ids ?? [])], checkedIn, collateral: source };
  } catch (e) {
    return { status: 'unverified', reasonCode: 'verification_failed', reason: msg(e), checkedIn, collateral: source };
  }
}
