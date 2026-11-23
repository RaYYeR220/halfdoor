import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { newClientKeys } from '@/lib/crypto/e2ee';
import {
  QuoteParseError, addressFromPublicKey, checkQuoteBinding, clearCollateralCache, hasModernAbortSignal, loadCollateralSnapshot,
  parseTdxQuote, quoteBytesFrom, verifyQuoteSignature, withDeadline, type CollateralSnapshot,
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
  const DAY = 86400;

  test.each(cases)('%s: Intel signature chain verifies with live collateral', async (_n, f) => {
    const r = await verifyQuoteSignature(quoteBytesOf(f), { getCollateral: async () => f.collateral, nowSecs: capturedSecs(f), snapshot: noSnapshot });
    expect(r).toMatchObject({ status: 'verified', tcbStatus: 'UpToDate', advisoryIds: [], checkedIn: 'node', source: 'live' });
    expect(r.reason).toBeUndefined();
    expect(r.snapshotCapturedAt).toBeUndefined();
  });
  test('a quote whose REPORTDATA was rewritten is unverified (signature no longer matches)', async () => {
    const key = newClientKeys().publicKeyHex;
    const forged = withReportData(near.attestation.intel_quote, addressFromPublicKey(key), near.requestNonce);
    const r = await verifyQuoteSignature(hexToBytes(forged), { getCollateral: async () => near.collateral, nowSecs: capturedSecs(near) });
    expect(r).toMatchObject({ status: 'unverified', reasonCode: 'verification_failed', source: 'live' });
    expect(r.reason).toMatch(/signature is invalid/i);
  });
  test('a malformed quote is reported as quote_malformed, not as a collateral problem', async () => {
    const getCollateral = vi.fn(async () => near.collateral);
    const r = await verifyQuoteSignature(quoteBytesOf(near).slice(0, 700), { getCollateral, snapshot: noSnapshot });
    expect(r).toMatchObject({ status: 'unverified', reasonCode: 'quote_malformed' });
    expect(getCollateral).not.toHaveBeenCalled();
  });
  test('a verification failure on live collateral never falls back to the snapshot', async () => {
    const snapshot = vi.fn(async () => snapshotOf('near-ai'));
    const r = await verifyQuoteSignature(quoteBytesOf(near), { getCollateral: async () => FIXTURES.phala.collateral, nowSecs: capturedSecs(near), snapshot });
    expect(r.status).toBe('unverified');
    expect(snapshot).not.toHaveBeenCalled();
  });
  test('the live fetch is retried once before any fallback; a retry that works stays live', async () => {
    const snapshot = vi.fn(async () => snapshotOf('near-ai'));
    let n = 0;
    const flaky = vi.fn(async () => {
      if (n++ === 0) throw new Error('stall');
      return near.collateral;
    });
    const r = await verifyQuoteSignature(quoteBytesOf(near), { getCollateral: flaky, snapshot, nowSecs: capturedSecs(near) });
    expect(r).toMatchObject({ status: 'verified', source: 'live' });
    expect(flaky).toHaveBeenCalledTimes(2);
    expect(snapshot).not.toHaveBeenCalled();
  });
  test('PCCS failing twice -> snapshot used -> full chain check -> verified, labelled as the weaker snapshot source', async () => {
    const live = vi.fn(down);
    const r = await verifyQuoteSignature(quoteBytesOf(near), { getCollateral: live, snapshot: async () => snapshotOf('near-ai'), nowSecs: capturedSecs(near) });
    expect(live).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ status: 'verified', tcbStatus: 'UpToDate', source: 'snapshot', snapshotCapturedAt: near.capturedAt });
  });
  test('a snapshot up to 14 days old is accepted; older fails closed with snapshot_too_old', async () => {
    const opts = (days: number) => ({ getCollateral: down, snapshot: async () => snapshotOf('near-ai'), nowSecs: capturedSecs(near) + days * DAY });
    expect(await verifyQuoteSignature(quoteBytesOf(near), opts(13.9))).toMatchObject({ status: 'verified', source: 'snapshot' });
    const old = await verifyQuoteSignature(quoteBytesOf(near), opts(15));
    expect(old).toMatchObject({ status: 'unverified', reasonCode: 'snapshot_too_old' });
    expect(old.reason).toMatch(/pccs down/);
    expect(await verifyQuoteSignature(quoteBytesOf(near), opts(400))).toMatchObject({ status: 'unverified', reasonCode: 'snapshot_too_old' });
  });
  test('a forged quote is still unverified against the snapshot', async () => {
    const forged = withReportData(near.attestation.intel_quote, addressFromPublicKey(newClientKeys().publicKeyHex), near.requestNonce);
    const r = await verifyQuoteSignature(hexToBytes(forged), { getCollateral: down, snapshot: async () => snapshotOf('near-ai'), nowSecs: capturedSecs(near) });
    expect(r).toMatchObject({ status: 'unverified', reasonCode: 'verification_failed', source: 'snapshot' });
  });
  test('PCCS failure and no snapshot entry for this platform -> unverified with both reasons', async () => {
    const r = await verifyQuoteSignature(quoteBytesOf(near), { getCollateral: down, snapshot: async () => snapshotOf('phala') });
    expect(r).toMatchObject({ status: 'unverified', reasonCode: 'collateral_unavailable', checkedIn: 'node' });
    expect(r.reason).toMatch(/pccs down/);
    expect(r.reason).toMatch(/snapshot/);
    expect(r.source).toBeUndefined();
    const r2 = await verifyQuoteSignature(quoteBytesOf(near), { getCollateral: down, snapshot: noSnapshot });
    expect(r2).toMatchObject({ status: 'unverified', reasonCode: 'collateral_unavailable' });
  });
  test('real path: PCCS fetch failing -> two live attempts, then the bundled snapshot verifies the fixtures', async () => {
    const pccs = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', pccs);
    const capturedAt = (await loadCollateralSnapshot())!.capturedAt;
    const at = Math.floor(Date.parse(capturedAt) / 1000); // the bundled snapshot ages out; verify as of its capture
    for (const f of [near, FIXTURES.phala]) {
      clearCollateralCache();
      const r = await verifyQuoteSignature(quoteBytesOf(f), { nowSecs: at });
      expect(r).toMatchObject({ status: 'verified', source: 'snapshot', snapshotCapturedAt: capturedAt });
    }
    expect(pccs).toHaveBeenCalledTimes(4);
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
      expect(failing).toHaveBeenCalledTimes(4); // 2 attempts per call, nothing cached
    } finally {
      vi.useRealTimers();
    }
  });
  test('network: live collateral from the public PCCS verifies the fixture (skipped offline)', async (ctx) => {
    const r = await verifyQuoteSignature(quoteBytesOf(near), { liveTimeoutMs: 15_000, snapshot: noSnapshot });
    if (r.status === 'unverified' && r.reasonCode === 'collateral_unavailable') ctx.skip();
    expect(r).toMatchObject({ status: 'verified', source: 'live' });
  });
});

describe('withDeadline (live collateral deadline, incl. browsers without AbortSignal.any/timeout)', () => {
  afterEach(() => vi.useRealTimers());

  test('modern runtimes hand the deadline to the library', async () => {
    const run = vi.fn(async (o: { timeoutMs: number }) => o.timeoutMs);
    expect(await withDeadline(run, 8000, true)).toBe(8000);
  });
  test('old runtimes: the library gets no deadline of its own (it would call AbortSignal.any); a manual timer enforces it', async () => {
    vi.useFakeTimers();
    const run = vi.fn<(o: { timeoutMs: number }) => Promise<never>>(() => new Promise<never>(() => undefined));
    const p = withDeadline(run, 8000, false);
    const settled = vi.fn();
    p.catch(settled);
    expect(run).toHaveBeenCalledWith({ timeoutMs: 0 });
    await vi.advanceTimersByTimeAsync(7999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).rejects.toThrow(/timed out after 8000 ms/);
  });
  test('old runtimes: a result in time wins and the timer is cleared', async () => {
    vi.useFakeTimers();
    const p = withDeadline(async () => 'ok', 8000, false);
    await expect(p).resolves.toBe('ok');
    expect(vi.getTimerCount()).toBe(0);
  });
  test('feature detection', () => {
    expect(hasModernAbortSignal()).toBe(typeof AbortSignal.any === 'function' && typeof AbortSignal.timeout === 'function');
  });
});

describe('old runtime end to end', () => {
  test('network: with AbortSignal.any/timeout missing (iOS 16 Safari), live collateral still verifies (skipped offline)', async (ctx) => {
    const S = AbortSignal as unknown as Record<string, unknown>;
    const saved = { any: S.any, timeout: S.timeout };
    S.any = undefined;
    S.timeout = undefined;
    try {
      clearCollateralCache();
      expect(hasModernAbortSignal()).toBe(false);
      const r = await verifyQuoteSignature(quoteBytesOf(near), { snapshot: async () => null });
      if (r.reasonCode === 'collateral_unavailable' && !/AbortSignal/.test(r.reason ?? '')) ctx.skip();
      expect(r).toMatchObject({ status: 'verified', source: 'live' });
    } finally {
      S.any = saved.any;
      S.timeout = saved.timeout;
      clearCollateralCache();
    }
  });
});
