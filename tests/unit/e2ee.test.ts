import { describe, expect, test } from 'vitest';
import { decryptFromEnclave, encryptForEnclave, looksEncrypted, newClientKeys } from '@/lib/crypto/e2ee';
import { bytesToHex } from '@noble/hashes/utils.js';
import { AttestationError, ENCLAVE_COPY, ENCLAVE_COPY_ES, checkAttestation, signatureText, withSignature } from '@/lib/crypto/attestation';
import { addressFromPublicKey, checkQuoteBinding } from '@/lib/crypto/tdxQuote';
import { FIXTURES, withDebugBit, withReportData } from '../fixtures/attestation';

describe('e2ee', () => {
  test('round-trips through a simulated enclave key', () => {
    const enclave = newClientKeys();
    const ct = encryptForEnclave('Leo loves trains', enclave.publicKeyHex);
    expect(looksEncrypted(ct)).toBe(true);
    expect(decryptFromEnclave(ct, enclave.privateKey)).toBe('Leo loves trains');
  });
  test('public key is uncompressed (130 hex)', () => {
    expect(newClientKeys().publicKeyHex).toMatch(/^04[0-9a-f]{128}$/);
  });
  test('accepts a model key without 04 prefix', () => {
    const k = newClientKeys();
    const ct = encryptForEnclave('x', k.publicKeyHex.slice(2));
    expect(decryptFromEnclave(ct, k.privateKey)).toBe('x');
  });
  test('wrong private key throws', () => {
    const a = newClientKeys();
    const b = newClientKeys();
    const ct = encryptForEnclave('secret', a.publicKeyHex);
    expect(() => decryptFromEnclave(ct, b.privateKey)).toThrow();
  });
  test('tampered ciphertext throws', () => {
    const a = newClientKeys();
    const ct = encryptForEnclave('secret', a.publicKeyHex);
    const last = ct.slice(-1) === '0' ? '1' : '0';
    expect(() => decryptFromEnclave(ct.slice(0, -1) + last, a.privateKey)).toThrow();
  });
  test('looksEncrypted rejects plain text and short hex', () => {
    expect(looksEncrypted('hello world')).toBe(false);
    expect(looksEncrypted('abcd')).toBe(false);
  });
});

describe('checkAttestation', () => {
  // A real Venice response (tests/fixtures), checked against the nonce it was requested with.
  const f = FIXTURES['near-ai'];
  const good = f.attestation;
  const nonce = f.requestNonce;
  const model = f.model;
  const bindingCode = (raw: unknown, n = nonce) => {
    try {
      checkAttestation(raw, n, model);
    } catch (e) {
      expect(e).toBeInstanceOf(AttestationError);
      return `${(e as AttestationError).code}:${(e as AttestationError).detail ?? ''}`;
    }
    return 'passed';
  };

  test('rejects attestation with nonce mismatch', () => {
    expect(() => checkAttestation({ ...good, nonce: 'b' }, nonce, model)).toThrow(/nonce_mismatch/);
  });
  test('rejects unverified attestation', () => {
    expect(() => checkAttestation({ ...good, verified: false }, nonce, model)).toThrow(/not_verified/);
  });
  test('rejects model mismatch', () => {
    expect(() => checkAttestation(good, nonce, 'other')).toThrow(/model_mismatch/);
  });
  test('rejects missing key', () => {
    const { signing_public_key: _k, signing_key: _s, ...rest } = good;
    void _k;
    void _s;
    expect(() => checkAttestation(rest, nonce, model)).toThrow(/no_key/);
  });
  test('error carries a code', () => {
    try { checkAttestation({ ...good, nonce: 'z' }, nonce, model); } catch (e) {
      expect(e).toBeInstanceOf(AttestationError);
      expect((e as AttestationError).code).toBe('nonce_mismatch');
    }
  });
  test('returns summary with the binding for a real fixture', () => {
    const s = checkAttestation(good, nonce, model);
    expect(s).toMatchObject({
      verified: true, nonceOk: true, provider: 'near-ai', hardware: 'intel-tdx', model,
      signingAddress: good.signing_address.toLowerCase(),
      modelPublicKey: good.signing_key,
      binding: { addressMatches: true, nonceMatches: true, paddingZero: true, debug: false, teeType: 0x81 },
      quote: { signature: 'pending', mrtd: checkQuoteBinding(good, nonce).mrtd, tdAttributes: '0000001000000000' },
    });
    expect(new Date(s.checkedAt).toISOString()).toBe(s.checkedAt);
  });
  test('tolerates non-objects', () => {
    expect(() => checkAttestation(null, nonce, model)).toThrow(/not_verified/);
  });
  test('the echoed nonce is not enough: REPORTDATA must hold OUR nonce', () => {
    const other = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    expect(bindingCode({ ...good, nonce: other, request_nonce: other }, other)).toBe('quote_binding_failed:nonce');
  });
  test('a swapped (valid) key fails: the key we encrypt to must be the one in REPORTDATA', () => {
    const k = newClientKeys().publicKeyHex;
    expect(bindingCode({ ...good, signing_key: k, signing_public_key: k })).toBe('quote_binding_failed:address');
  });
  test('debug bit flipped in a copied quote fails', () => {
    expect(bindingCode({ ...good, intel_quote: withDebugBit(good.intel_quote) })).toBe('quote_binding_failed:debug');
  });
  test('non-zero REPORTDATA padding fails', () => {
    const addr = addressFromPublicKey(good.signing_key as string);
    const q = withReportData(good.intel_quote, addr, nonce, 'ff'.repeat(12));
    expect(bindingCode({ ...good, intel_quote: q })).toBe('quote_binding_failed:padding');
  });
  test('missing or truncated quote fails', () => {
    const { intel_quote: _q, ...rest } = good;
    void _q;
    expect(bindingCode(rest)).toBe('quote_binding_failed:quote');
    expect(bindingCode({ ...good, intel_quote: good.intel_quote.slice(0, 1000) })).toBe('quote_binding_failed:quote');
  });
  test('a fresh key bound into a forged quote passes binding (the Intel signature check catches it)', () => {
    const k = newClientKeys().publicKeyHex;
    const q = withReportData(good.intel_quote, addressFromPublicKey(k), nonce);
    expect(bindingCode({ ...good, signing_key: k, intel_quote: q })).toBe('passed');
  });
});

describe('withSignature', () => {
  const f = FIXTURES['near-ai'];
  const s = checkAttestation(f.attestation, f.requestNonce, f.model);
  test('verified result records where it ran and the TCB status', () => {
    const v = withSignature(s, { status: 'verified', tcbStatus: 'UpToDate', advisoryIds: [], checkedIn: 'browser' });
    expect(v.quote).toMatchObject({ signature: 'verified', signatureCheckedIn: 'browser', tcbStatus: 'UpToDate', mrtd: s.quote.mrtd });
    expect(s.quote.signature).toBe('pending'); // original untouched
  });
  test('unverified result keeps the reason', () => {
    const v = withSignature(s, { status: 'unverified', reasonCode: 'collateral_unavailable', reason: 'pccs down', checkedIn: 'node' });
    expect(v.quote).toMatchObject({ signature: 'unverified', signatureCheckedIn: 'node', reasonCode: 'collateral_unavailable', reason: 'pccs down' });
  });
});

describe('ENCLAVE_COPY', () => {
  test('EN and ES carry the same keys; signature texts name where the check ran', () => {
    expect(Object.keys(ENCLAVE_COPY_ES).sort()).toEqual(Object.keys(ENCLAVE_COPY).sort());
    expect(ENCLAVE_COPY.bindingOk).toBe(
      "Your browser checked that this enclave's key and your one-time code are sealed in an Intel TDX report from a non-debug enclave.",
    );
    expect(ENCLAVE_COPY.signatureVerifiedInBrowser('UpToDate')).toMatch(/in your browser/);
    expect(ENCLAVE_COPY.signatureVerifiedOnServer('UpToDate')).toMatch(/not in your browser/);
    expect(ENCLAVE_COPY.signatureNotVerified('pccs down')).toMatch(/not verified.*pccs down/);
  });
  test('signatureText picks the right string for a summary', () => {
    const f = FIXTURES['near-ai'];
    const s = checkAttestation(f.attestation, f.requestNonce, f.model);
    expect(signatureText(s)).toBe(ENCLAVE_COPY.signaturePending);
    expect(signatureText(withSignature(s, { status: 'verified', tcbStatus: 'UpToDate', advisoryIds: [], checkedIn: 'browser' }))).toBe(
      ENCLAVE_COPY.signatureVerifiedInBrowser('UpToDate'),
    );
    expect(signatureText(withSignature(s, { status: 'unverified', reason: 'x', checkedIn: 'browser' }), 'es')).toBe(ENCLAVE_COPY_ES.signatureNotVerified('x'));
  });
});
