// Real Venice attestation responses (scripts/capture-attestation.ts) and helpers that tamper with copies.
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import nearAi from './attestation-near-ai.json';
import phala from './attestation-phala.json';

export type AttestationFixture = {
  capturedAt: string;
  requestNonce: string;
  model: string;
  attestation: Record<string, unknown> & { intel_quote: string; signing_public_key: string; signing_address: string };
  collateral: Record<string, unknown>;
};

export const FIXTURES: Record<'near-ai' | 'phala', AttestationFixture> = {
  'near-ai': nearAi as AttestationFixture,
  phala: phala as AttestationFixture,
};

const HEADER = 48;
const TD_ATTRIBUTES = HEADER + 120;
const REPORT_DATA = HEADER + 520;

export const quoteBytesOf = (f: AttestationFixture) => hexToBytes(f.attestation.intel_quote);
/** Capture time in seconds: the collateral's validity window is checked against this. */
export const capturedSecs = (f: AttestationFixture) => Math.floor(Date.parse(f.capturedAt) / 1000);

/** A copy of the quote with REPORTDATA overwritten (this breaks Intel's signature on purpose). */
export function withReportData(quoteHex: string, addressHex: string, nonceHex: string, paddingHex = '00'.repeat(12)): string {
  const q = hexToBytes(quoteHex);
  q.set(hexToBytes(addressHex.replace(/^0x/, '') + paddingHex + nonceHex), REPORT_DATA);
  return bytesToHex(q);
}

/** A copy of the quote with the TD DEBUG attribute bit set. */
export function withDebugBit(quoteHex: string): string {
  const q = hexToBytes(quoteHex);
  q[TD_ATTRIBUTES] |= 1;
  return bytesToHex(q);
}
