import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { newClientKeys } from '@/lib/crypto/e2ee';
import {
  QuoteParseError, addressFromPublicKey, checkQuoteBinding, clearCollateralCache, loadCollateralSnapshot,
  parseTdxQuote, quoteBytesFrom, verifyQuoteSignature, type CollateralSnapshot,
} from '@/lib/crypto/tdxQuote';
import { FIXTURES, capturedSecs, quoteBytesOf, withDebugBit, withReportData } from '../fixtures/attestation';

const cases = Object.entries(FIXTURES);
const near = FIXTURES['near-ai'];
type Sv = { tdx: { reportData: string; measurements: { mrtd: string; tdAttributes: string } } };
const sv = (a: Record<string, unknown>) => a.server_verification as Sv;

describe('parseTdxQuote', () => {
  test.each(cases)('%s: reads the TD report fields Venice reports', (_n, f) => {
    const q = parseTdxQuote(quoteBytesOf(f));
    expect(q.version).toBe(4);
    expect(q.teeType).toBe(0x81);
    expect(q.debug).toBe(false);
    expect(q.tdAttributes).toBe(sv(f.attestation).tdx.measurements.tdAttributes);
    expect(q.mrtd).toBe(sv(f.attestation).tdx.measurements.mrtd);
    expect(bytesToHex(q.reportData)).toBe(sv(f.attestation).tdx.reportData);
  });
  test('debug bit is read from TD_ATTRIBUTES byte 0 bit 0', () => {
    expect(parseTdxQuote(hexToBytes(withDebugBit(near.attestation.intel_quote))).debug).toBe(true);
  });
  test('truncated, wrong-version and non-TDX quotes throw QuoteParseError', () => {
    const q = quoteBytesOf(near);
    expect(() => parseTdxQuote(q.slice(0, 600))).toThrow(QuoteParseError);
    expect(() => parseTdxQuote(new Uint8Array())).toThrow(QuoteParseError);
    const v3 = q.slice();
    v3[0] = 3;
    expect(() => parseTdxQuote(v3)).toThrow(QuoteParseError);
    const sgx = q.slice();
    sgx[4] = 0;
    expect(() => parseTdxQuote(sgx)).toThrow(QuoteParseError);
  });
});

describe('quoteBytesFrom', () => {
  test('accepts hex and base64, rejects junk', () => {
    const hex = near.attestation.intel_quote;
    const b64 = Buffer.from(hex, 'hex').toString('base64');
    expect(bytesToHex(quoteBytesFrom(hex))).toBe(hex);
    expect(bytesToHex(quoteBytesFrom(b64))).toBe(hex);
    expect(() => quoteBytesFrom('')).toThrow(QuoteParseError);
    expect(() => quoteBytesFrom('not a quote!')).toThrow(QuoteParseError);
    expect(() => quoteBytesFrom(42)).toThrow(QuoteParseError);
  });
});

describe('addressFromPublicKey', () => {
  test.each(cases)('%s: matches the enclave signing address', (_n, f) => {
    const want = f.attestation.signing_address.replace(/^0x/, '').toLowerCase();
    expect(addressFromPublicKey(f.attestation.signing_public_key)).toBe(want);
    expect(addressFromPublicKey(f.attestation.signing_public_key.slice(2))).toBe(want);
  });
  test('rejects malformed keys', () => {
    expect(() => addressFromPublicKey('abcd')).toThrow();
    expect(() => addressFromPublicKey('05' + 'ab'.repeat(64))).toThrow();
  });
});

describe('checkQuoteBinding', () => {
  test.each(cases)('%s: real fixture binds key + our nonce, non-debug TDX', (_n, f) => {
    expect(checkQuoteBinding(f.attestation, f.requestNonce)).toEqual({
      addressMatches: true, nonceMatches: true, paddingZero: true, debug: false, teeType: 0x81, mrtd: sv(f.attestation).tdx.measurements.mrtd,
    });
  });
  test('another nonce does not match', () => {
    const other = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    expect(checkQuoteBinding(near.attestation, other).nonceMatches).toBe(false);
  });
  test('a swapped (valid) public key does not match', () => {
    const b = checkQuoteBinding({ ...near.attestation, signing_key: newClientKeys().publicKeyHex }, near.requestNonce);
    expect(b.addressMatches).toBe(false);
    expect(b.nonceMatches).toBe(true);
  });
  test('uses signing_key over signing_public_key (the key we encrypt to)', () => {
    const b = checkQuoteBinding({ ...near.attestation, signing_public_key: newClientKeys().publicKeyHex }, near.requestNonce);
    expect(b.addressMatches).toBe(true);
  });
  test('non-zero padding and the debug bit are reported', () => {
    const addr = addressFromPublicKey(near.attestation.signing_public_key);
    const padded = withReportData(near.attestation.intel_quote, addr, near.requestNonce, '01' + '00'.repeat(11));
    expect(checkQuoteBinding({ ...near.attestation, intel_quote: padded }, near.requestNonce).paddingZero).toBe(false);
    expect(checkQuoteBinding({ ...near.attestation, intel_quote: withDebugBit(near.attestation.intel_quote) }, near.requestNonce).debug).toBe(true);
  });
  test('missing quote throws QuoteParseError', () => {
    const { intel_quote: _q, ...rest } = near.attestation;
    void _q;
    expect(() => checkQuoteBinding(rest, near.requestNonce)).toThrow(QuoteParseError);
  });
});

describe('verifyQuoteSignature', () => {
  beforeEach(() => clearCollateralCache());
  afterEach(() => vi.unstubAllGlobals());

  const PLATFORM = { 'near-ai': '90C06F000000:platform', phala: '20A06F000000:platform' } as const;
  /** A snapshot built from a fixture's own captured collateral. */
  const snapshotOf = (name: keyof typeof PLATFORM): CollateralSnapshot => ({
    capturedAt: FIXTURES[name].capturedAt,
    entries: { [PLATFORM[name]]: FIXTURES[name].collateral },
  });
  const down = async (): Promise<never> => {
    throw new Error('pccs down');
  };
  const noSnapshot = async () => null;

  test.each(cases)('%s: Intel signature chain verifies with live collateral', async (_n, f) => {
    const r = await verifyQuoteSignature(quoteBytesOf(f), { getCollateral: async () => f.collateral, nowSecs: capturedSecs(f), snapshot: noSnapshot });
    expect(r).toMatchObject({ status: 'verified', tcbStatus: 'UpToDate', advisoryIds: [], checkedIn: 'node', collateral: 'live' });
    expect(r.reason).toBeUndefined();
  });
  test('a quote whose REPORTDATA was rewritten is unverified (signature no longer matches)', async () => {
    const key = newClientKeys().publicKeyHex;
    const forged = withReportData(near.attestation.intel_quote, addressFromPublicKey(key), near.requestNonce);
    const r = await verifyQuoteSignature(hexToBytes(forged), { getCollateral: async () => near.collateral, nowSecs: capturedSecs(near) });
    expect(r).toMatchObject({ status: 'unverified', reasonCode: 'verification_failed', collateral: 'live' });
    expect(r.reason).toMatch(/signature is invalid/i);
  });
  test('a verification failure on live collateral never falls back to the snapshot', async () => {
    const snapshot = vi.fn(async () => snapshotOf('near-ai'));
    const r = await verifyQuoteSignature(quoteBytesOf(near), { getCollateral: async () => FIXTURES.phala.collateral, nowSecs: capturedSecs(near), snapshot });
    expect(r.status).toBe('unverified');
    expect(snapshot).not.toHaveBeenCalled();
  });
  test('PCCS failure -> snapshot used -> still a full chain check -> verified, labelled with its date', async () => {
    const r = await verifyQuoteSignature(quoteBytesOf(near), { getCollateral: down, snapshot: async () => snapshotOf('near-ai'), nowSecs: capturedSecs(near) });
    expect(r).toMatchObject({ status: 'verified', tcbStatus: 'UpToDate', collateral: `snapshot ${near.capturedAt.slice(0, 10)}` });
  });
  test('a forged quote is still unverified against the snapshot', async () => {
    const forged = withReportData(near.attestation.intel_quote, addressFromPublicKey(newClientKeys().publicKeyHex), near.requestNonce);
    const r = await verifyQuoteSignature(hexToBytes(forged), { getCollateral: down, snapshot: async () => snapshotOf('near-ai'), nowSecs: capturedSecs(near) });
    expect(r).toMatchObject({ status: 'unverified', reasonCode: 'verification_failed' });
  });
  test('an expired snapshot gives whatever the verifier says (unverified), never a fake verified', async () => {
    const r = await verifyQuoteSignature(quoteBytesOf(near), {
      getCollateral: down, snapshot: async () => snapshotOf('near-ai'), nowSecs: capturedSecs(near) + 400 * 86400,
    });
    expect(r).toMatchObject({ status: 'unverified', reasonCode: 'verification_failed', reason: expect.stringMatching(/expired/) });
  });
  test('PCCS failure and no snapshot entry for this platform -> unverified with both reasons', async () => {
    const r = await verifyQuoteSignature(quoteBytesOf(near), { getCollateral: down, snapshot: async () => snapshotOf('phala') });
    expect(r).toMatchObject({ status: 'unverified', reasonCode: 'collateral_unavailable', checkedIn: 'node' });
    expect(r.reason).toMatch(/pccs down/);
    expect(r.reason).toMatch(/snapshot/);
    expect(r.collateral).toBeUndefined();
    const r2 = await verifyQuoteSignature(quoteBytesOf(near), { getCollateral: down, snapshot: noSnapshot });
    expect(r2).toMatchObject({ status: 'unverified', reasonCode: 'collateral_unavailable' });
  });
  test('real path: PCCS fetch failing -> the bundled snapshot verifies the fixtures (one live attempt, no retry)', async () => {
    const pccs = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', pccs);
    const capturedAt = (await loadCollateralSnapshot())!.capturedAt;
    const at = Math.floor(Date.parse(capturedAt) / 1000); // the bundled snapshot expires; verify as of its capture
    for (const f of [near, FIXTURES.phala]) {
      clearCollateralCache();
      const r = await verifyQuoteSignature(quoteBytesOf(f), { nowSecs: at });
      expect(r).toMatchObject({ status: 'verified', collateral: `snapshot ${capturedAt.slice(0, 10)}` });
    }
    expect(pccs).toHaveBeenCalledTimes(2);
    expect(String((pccs.mock.calls[0] as unknown[])[0])).toMatch(/^https:\/\/pccs\.phala\.network\//);
  });
  test('the bundled snapshot covers both Venice TDX platforms seen today', async () => {
    const snap = await loadCollateralSnapshot();
    expect(Object.keys(snap!.entries).sort()).toEqual([PLATFORM.phala, PLATFORM['near-ai']].sort());
    expect(new Date(snap!.capturedAt).toISOString()).toBe(snap!.capturedAt);
    for (const c of Object.values(snap!.entries)) expect(c.pck_certificate_chain).toBeUndefined(); // per machine: taken from each quote
  });
  test('live collateral is cached per platform for an hour; failures are not cached', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const opts = { getCollateral: vi.fn(async () => near.collateral), nowSecs: capturedSecs(near) };
      expect((await verifyQuoteSignature(quoteBytesOf(near), opts)).status).toBe('verified');
      expect((await verifyQuoteSignature(quoteBytesOf(near), opts)).status).toBe('verified');
      expect(opts.getCollateral).toHaveBeenCalledTimes(1);
      vi.setSystemTime(Date.now() + 61 * 60_000);
      await verifyQuoteSignature(quoteBytesOf(near), opts);
      expect(opts.getCollateral).toHaveBeenCalledTimes(2);

      clearCollateralCache();
      const failing = vi.fn(down);
      await verifyQuoteSignature(quoteBytesOf(near), { getCollateral: failing, snapshot: noSnapshot });
      await verifyQuoteSignature(quoteBytesOf(near), { getCollateral: failing, snapshot: noSnapshot });
      expect(failing).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  test('network: live collateral from the public PCCS verifies the fixture (skipped offline)', async (ctx) => {
    const r = await verifyQuoteSignature(quoteBytesOf(near), { liveTimeoutMs: 15_000, snapshot: noSnapshot });
    if (r.status === 'unverified' && r.reasonCode === 'collateral_unavailable') ctx.skip();
    expect(r).toMatchObject({ status: 'verified', collateral: 'live' });
  });
});
