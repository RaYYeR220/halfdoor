// Isomorphic (browser + Node) checks on the Intel TDX quote inside a Venice attestation.
//
// Binding (synchronous, mandatory before encrypting): the quote's REPORTDATA must hold the address of
// the very key we encrypt to and OUR fresh nonce, the TD must not be in debug mode, and the quote must
// be a TDX (v4, TEE type 0x81) quote. This is plain parsing, so on its own it proves nothing about who
// produced the quote.
//
// Signature (asynchronous, best effort): @phala/dcap-qvl verifies Intel's DCAP chain (PCK certificate
// chain to Intel's root CA, CRLs, TCB info, QE identity, quote signature). It needs Intel collateral
// (public data) from a PCCS; any failure is reported as `unverified` with a reason, never as verified.
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

// ---------------------------------------------------------------- Intel signature chain

export type SignatureReasonCode = 'collateral_unavailable' | 'verification_failed' | 'verifier_unavailable';
export type CheckedIn = 'browser' | 'node';

export type QuoteSignatureResult = {
  status: 'verified' | 'unverified';
  /** Intel TCB status of the platform, e.g. UpToDate / OutOfDate (only when verified). */
  tcbStatus?: string;
  advisoryIds?: string[];
  reasonCode?: SignatureReasonCode;
  /** Technical reason (no user data), only when unverified. */
  reason?: string;
  /** Where this check actually ran. */
  checkedIn: CheckedIn;
};

/** Collateral as @phala/dcap-qvl expects it (public Intel data). */
export type Collateral = Record<string, unknown>;

export type VerifyQuoteOpts = {
  /** Default: the library's fetcher against the public PCCS (CORS-enabled, so it runs from the browser too). */
  getCollateral?: (quote: Uint8Array) => Promise<Collateral>;
  /** Verification time; default now. */
  nowSecs?: number;
  /** Deadline per PCCS attempt (default 10 s; the default fetcher retries once). */
  timeoutMs?: number;
};

export const PCCS_URL = 'https://pccs.phala.network';
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

/** Per platform (PCK certificate chain inside the quote), successful fetches only. */
const collateralCache = new Map<string, { at: number; collateral: Collateral }>();
export function clearCollateralCache(): void {
  collateralCache.clear();
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, MAX_REASON);

export async function verifyQuoteSignature(quote: Uint8Array, opts: VerifyQuoteOpts = {}): Promise<QuoteSignatureResult> {
  const checkedIn = runtimeName();
  let lib: Dcap;
  try {
    lib = await loadDcap();
  } catch (e) {
    return { status: 'unverified', reasonCode: 'verifier_unavailable', reason: msg(e), checkedIn };
  }

  let collateral: Collateral;
  try {
    const key = bytesToHex(sha256(lib.Quote.parse(quote).rawCertChain()));
    const hit = collateralCache.get(key);
    if (hit && Date.now() - hit.at < COLLATERAL_TTL_MS) {
      collateral = hit.collateral;
    } else {
      const fromPccs = async (q: Uint8Array) =>
        (await lib.getCollateral(PCCS_URL, q, { timeoutMs: opts.timeoutMs ?? 10_000 })) as unknown as Collateral;
      // One retry: a first connection to the PCCS occasionally stalls (seen once in a headless browser).
      const fetchIt = opts.getCollateral ?? ((q: Uint8Array) => fromPccs(q).catch(() => fromPccs(q)));
      collateral = await fetchIt(quote);
      collateralCache.set(key, { at: Date.now(), collateral });
    }
  } catch (e) {
    return { status: 'unverified', reasonCode: 'collateral_unavailable', reason: msg(e), checkedIn };
  }

  try {
    const now = opts.nowSecs ?? Math.floor(Date.now() / 1000);
    const r = lib.verify(quote, collateral as unknown as Parameters<Dcap['verify']>[1], now);
    return { status: 'verified', tcbStatus: String(r.status), advisoryIds: [...(r.advisory_ids ?? [])], checkedIn };
  } catch (e) {
    return { status: 'unverified', reasonCode: 'verification_failed', reason: msg(e), checkedIn };
  }
}
