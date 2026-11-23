import { describe, expect, test } from 'vitest';
import { decryptFromEnclave, encryptForEnclave, looksEncrypted, newClientKeys } from '@/lib/crypto/e2ee';
import { AttestationError, checkAttestation } from '@/lib/crypto/attestation';

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
  const good = {
    verified: true, nonce: 'a', model: 'm', tee_provider: 'phala', tee_hardware: 'intel-tdx',
    signing_public_key: 'ab'.repeat(64), signing_address: '0xabc',
  };
  test('rejects attestation with nonce mismatch', () => {
    expect(() => checkAttestation({ ...good, nonce: 'b' }, 'a', 'm')).toThrow(/nonce_mismatch/);
  });
  test('rejects unverified attestation', () => {
    expect(() => checkAttestation({ ...good, verified: false }, 'a', 'm')).toThrow(/not_verified/);
  });
  test('rejects model mismatch', () => {
    expect(() => checkAttestation(good, 'a', 'other')).toThrow(/model_mismatch/);
  });
  test('rejects missing key', () => {
    const { signing_public_key: _k, ...rest } = good;
    void _k;
    expect(() => checkAttestation(rest, 'a', 'm')).toThrow(/no_key/);
  });
  test('error carries a code', () => {
    try { checkAttestation({ ...good, nonce: 'z' }, 'a', 'm'); } catch (e) {
      expect(e).toBeInstanceOf(AttestationError);
      expect((e as AttestationError).code).toBe('nonce_mismatch');
    }
  });
  test('returns summary for valid fixture', () => {
    const s = checkAttestation(good, 'a', 'm');
    expect(s).toMatchObject({
      verified: true, nonceOk: true, provider: 'phala', hardware: 'intel-tdx',
      model: 'm', signingAddress: '0xabc', modelPublicKey: 'ab'.repeat(64),
    });
    expect(new Date(s.checkedAt).toISOString()).toBe(s.checkedAt);
  });
  test('prefers signing_key and tolerates non-objects', () => {
    expect(checkAttestation({ ...good, signing_key: 'cd' }, 'a', 'm').modelPublicKey).toBe('cd');
    expect(() => checkAttestation(null, 'a', 'm')).toThrow(/not_verified/);
  });
});
