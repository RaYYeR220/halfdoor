// Isomorphic (browser + Node) E2EE to a Venice TEE enclave.
// secp256k1 ECDH (x-coordinate) -> HKDF-SHA256 -> AES-256-GCM.
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

export type ClientKeys = { privateKey: Uint8Array; publicKeyHex: string };

const INFO = new TextEncoder().encode('ecdsa_encryption');
const PUB_LEN = 65;
const NONCE_LEN = 12;

export function newClientKeys(): ClientKeys {
  const privateKey = secp256k1.utils.randomSecretKey();
  return { privateKey, publicKeyHex: bytesToHex(secp256k1.getPublicKey(privateKey, false)) };
}

function aesKey(priv: Uint8Array, pub: Uint8Array): Uint8Array {
  const shared = secp256k1.getSharedSecret(priv, pub, true).slice(1); // x coordinate
  return hkdf(sha256, shared, undefined, INFO, 32);
}

export function encryptForEnclave(plaintext: string, modelPublicKeyHex: string): string {
  const k = modelPublicKeyHex.length === 128 ? '04' + modelPublicKeyHex : modelPublicKeyHex;
  const eph = secp256k1.utils.randomSecretKey();
  const ephPub = secp256k1.getPublicKey(eph, false);
  const key = aesKey(eph, hexToBytes(k));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN));
  const ct = gcm(key, nonce).encrypt(new TextEncoder().encode(plaintext));
  return bytesToHex(ephPub) + bytesToHex(nonce) + bytesToHex(ct);
}

export function decryptFromEnclave(cipherHex: string, privateKey: Uint8Array): string {
  const b = hexToBytes(cipherHex);
  const ephPub = b.slice(0, PUB_LEN);
  const nonce = b.slice(PUB_LEN, PUB_LEN + NONCE_LEN);
  const ct = b.slice(PUB_LEN + NONCE_LEN);
  const key = aesKey(privateKey, ephPub);
  return new TextDecoder().decode(gcm(key, nonce).decrypt(ct));
}

/** Encrypted stream chunks are hex longer than pub(65)+nonce(12)+tag(16) bytes = 154 hex chars. */
export function looksEncrypted(chunk: string): boolean {
  return chunk.length > 154 && /^[0-9a-f]+$/i.test(chunk);
}
