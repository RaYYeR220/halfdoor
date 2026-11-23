import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { newWrappedDek, openJson, sealJson, SealError } from '@/lib/crypto/atrest';
import { signLink, verifyLink, type LinkClaims } from '@/lib/auth/tokens';

const b64 = (n: number) => randomBytes(n).toString('base64');

beforeEach(() => {
  process.env.MASTER_KEY = b64(32);
  process.env.LINK_SECRET = randomBytes(32).toString('base64url');
});

describe('at-rest sealing', () => {
  it('round-trips JSON', () => {
    const dek = newWrappedDek();
    expect(openJson(dek, sealJson(dek, { a: 1 }))).toEqual({ a: 1 });
  });

  it('uses a fresh IV per seal', () => {
    const dek = newWrappedDek();
    expect(sealJson(dek, { a: 1 })).not.toBe(sealJson(dek, { a: 1 }));
  });

  it('throws SealError when a byte is flipped', () => {
    const dek = newWrappedDek();
    const buf = Buffer.from(sealJson(dek, { a: 1 }), 'base64url');
    buf[14] ^= 1;
    expect(() => openJson(dek, buf.toString('base64url'))).toThrow(SealError);
  });

  it('throws SealError on truncated input', () => {
    const dek = newWrappedDek();
    expect(() => openJson(dek, 'AAAA')).toThrow(SealError);
  });

  it('wrong master key cannot open', () => {
    const dek = newWrappedDek();
    const sealed = sealJson(dek, { a: 1 });
    process.env.MASTER_KEY = b64(32);
    expect(() => openJson(dek, sealed)).toThrow(SealError);
  });

  it("another church's DEK cannot open", () => {
    const a = newWrappedDek();
    const b = newWrappedDek();
    expect(() => openJson(b, sealJson(a, { a: 1 }))).toThrow(SealError);
  });

  it('missing or malformed MASTER_KEY gives a clear error without key material', () => {
    delete process.env.MASTER_KEY;
    expect(() => newWrappedDek()).toThrow(/MASTER_KEY/);
    const bad = b64(16);
    process.env.MASTER_KEY = bad;
    try {
      newWrappedDek();
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).toMatch(/MASTER_KEY/);
      expect((e as Error).message).not.toContain(bad);
    }
  });
});

describe('link tokens', () => {
  const claims: LinkClaims = { c: 'church1', p: 'person1', r: 'buddy', exp: 2_000_000_000 };

  it('round-trips claims', () => {
    expect(verifyLink(signLink(claims), 1_000_000_000_000)).toEqual(claims);
  });

  it('rejects expired tokens', () => {
    expect(verifyLink(signLink(claims), claims.exp * 1000)).toBeNull();
    expect(verifyLink(signLink(claims), claims.exp * 1000 + 1)).toBeNull();
  });

  it('rejects tampered payload', () => {
    const [, sig] = signLink(claims).split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, r: 'director' })).toString('base64url');
    expect(verifyLink(`${forged}.${sig}`, 1_000_000_000_000)).toBeNull();
  });

  it('rejects a token signed with another secret', () => {
    const t = signLink(claims);
    process.env.LINK_SECRET = randomBytes(32).toString('base64url');
    expect(verifyLink(t, 1_000_000_000_000)).toBeNull();
  });

  it('rejects bad shapes', () => {
    for (const t of ['', 'abc', 'a.b.c', '.', 'a.']) expect(verifyLink(t)).toBeNull();
  });

  it('rejects unknown roles even if correctly signed', () => {
    const t = signLink({ ...claims, r: 'root' as never });
    expect(verifyLink(t, 1_000_000_000_000)).toBeNull();
  });

  it('missing LINK_SECRET gives a clear error', () => {
    delete process.env.LINK_SECRET;
    expect(() => signLink(claims)).toThrow(/LINK_SECRET/);
  });
});
