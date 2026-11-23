// SERVER-ONLY: uses node:crypto and LINK_SECRET. Never import from client code.
//
// Token format: base64url(JSON claims) + '.' + base64url(HMAC-SHA256(payload_b64)).
import { createHmac, timingSafeEqual } from 'node:crypto';

export type Role = 'parent' | 'director' | 'buddy' | 'leader';
/** c = church id, p = person/subject id, r = role, exp = expiry in unix seconds. */
export type LinkClaims = { c: string; p: string; r: Role; exp: number };

const ROLES: readonly string[] = ['parent', 'director', 'buddy', 'leader'];

function secret(): Buffer {
  const raw = process.env.LINK_SECRET;
  if (!raw) throw new Error('LINK_SECRET is not set');
  const key = Buffer.from(raw, 'base64url');
  if (key.length < 16) throw new Error('LINK_SECRET is too short');
  return key;
}

function mac(payloadB64: string): Buffer {
  return createHmac('sha256', secret()).update(payloadB64).digest();
}

export function signLink(claims: LinkClaims): string {
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return `${payload}.${mac(payload).toString('base64url')}`;
}

export function verifyLink(token: string, now: number = Date.now()): LinkClaims | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, sig] = parts;

  const given = Buffer.from(sig, 'base64url');
  const expected = mac(payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!claims || typeof claims !== 'object') return null;
  const { c, p, r, exp } = claims as Record<string, unknown>;
  if (typeof c !== 'string' || typeof p !== 'string' || typeof exp !== 'number') return null;
  if (typeof r !== 'string' || !ROLES.includes(r)) return null;
  if (exp * 1000 <= now) return null;
  return { c, p, r: r as Role, exp };
}

/** Sign an opaque string (e.g. a sandbox church id): `value.base64url(HMAC)`. Distinct domain from link tokens. */
export function signValue(value: string): string {
  const sig = createHmac('sha256', secret()).update(`v1:${value}`).digest();
  return `${value}.${sig.toString('base64url')}`;
}

/** Returns the original value, or null if the signature is missing or wrong. */
export function verifyValue(signed: string): string | null {
  if (typeof signed !== 'string') return null;
  const i = signed.lastIndexOf('.');
  if (i <= 0) return null;
  const value = signed.slice(0, i);
  const given = Buffer.from(signed.slice(i + 1), 'base64url');
  const expected = createHmac('sha256', secret()).update(`v1:${value}`).digest();
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return value;
}

/** Salted (LINK_SECRET-keyed) hash of a client IP; the raw IP is never stored. */
export function hashClient(ip: string): string {
  return createHmac('sha256', secret()).update(`creator:${ip}`).digest('hex');
}
