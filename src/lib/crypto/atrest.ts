// SERVER-ONLY: uses node:crypto and secret env vars. Never import from client code.
//
// Envelope encryption: each church has a random 32-byte data key (DEK), stored
// wrapped (sealed) under MASTER_KEY. Card data is sealed under the DEK.
// Wire format everywhere: base64url( iv(12) | ciphertext | tag(16) ).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

export class SealError extends Error {
  constructor() {
    super('Sealed data could not be opened');
    this.name = 'SealError';
  }
}

function masterKey(): Buffer {
  const raw = process.env.MASTER_KEY;
  if (!raw) throw new Error('MASTER_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LEN) throw new Error(`MASTER_KEY must be ${KEY_LEN} bytes, base64-encoded`);
  return key;
}

function seal(key: Buffer, plaintext: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, ct, cipher.getAuthTag()]).toString('base64url');
}

function open(key: Buffer, sealed: string): Buffer {
  try {
    const buf = Buffer.from(sealed, 'base64url');
    if (buf.length < IV_LEN + TAG_LEN) throw new SealError();
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(buf.length - TAG_LEN);
    const ct = buf.subarray(IV_LEN, buf.length - TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new SealError();
  }
}

function unwrapDek(wrappedDek: string): Buffer {
  const dek = open(masterKey(), wrappedDek);
  if (dek.length !== KEY_LEN) throw new SealError();
  return dek;
}

/** New random per-church DEK, wrapped under MASTER_KEY. Store this string. */
export function newWrappedDek(): string {
  return seal(masterKey(), randomBytes(KEY_LEN));
}

export function sealJson(wrappedDek: string, value: unknown): string {
  return seal(unwrapDek(wrappedDek), Buffer.from(JSON.stringify(value), 'utf8'));
}

export function openJson<T>(wrappedDek: string, sealed: string): T {
  const plain = open(unwrapDek(wrappedDek), sealed);
  try {
    return JSON.parse(plain.toString('utf8')) as T;
  } catch {
    throw new SealError();
  }
}
