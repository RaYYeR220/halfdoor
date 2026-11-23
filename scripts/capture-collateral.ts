// Captures a snapshot of Intel collateral (public data) for the TDX platforms currently serving Venice's
// e2ee models. verifyQuoteSignature falls back to it when the live PCCS fetch fails; verification against
// it is still the full cryptographic chain check, and it simply fails once the snapshot expires.
// Attestation calls only (no chat). Run: pnpm tsx --env-file=.env.local scripts/capture-collateral.ts [tries-per-model]
import { writeFileSync } from 'node:fs';
import { PHALA_PCCS_URL, Quote, getCollateral, intel } from '@phala/dcap-qvl';
import { PRICES } from '../src/lib/venice/prices';

const KEY = process.env.VENICE_API_KEY;
if (!KEY) throw new Error('VENICE_API_KEY missing');
const BASE = 'https://api.venice.ai/api/v1';
const OUT = 'src/lib/crypto/collateral-snapshot.json';
const tries = Number(process.argv[2] ?? 2);

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const entries: Record<string, Record<string, unknown>> = {};
  let validUntil = Infinity;
  for (const model of Object.keys(PRICES).filter((m) => m.startsWith('e2ee-'))) {
    for (let i = 0; i < tries; i++) {
      await sleep(5000); // Venice rate-limits attestation per key+model
      const nonce = hex(crypto.getRandomValues(new Uint8Array(32)));
      const res = await fetch(`${BASE}/tee/attestation?model=${encodeURIComponent(model)}&nonce=${nonce}`, {
        headers: { Authorization: `Bearer ${KEY}` },
      });
      if (!res.ok) {
        console.log(model, 'attestation', res.status);
        continue;
      }
      const att = (await res.json()) as { intel_quote?: string; tee_provider?: string };
      if (!att.intel_quote) continue;
      const quote = Buffer.from(att.intel_quote, 'hex');
      const q = Quote.parse(quote);
      const key = `${Buffer.from(intel.getFmspc(q)).toString('hex').toUpperCase()}:${intel.getCa(q)}`;
      console.log(model, att.tee_provider, key, entries[key] ? '(have)' : '(new)');
      if (entries[key]) continue;
      const raw = (await getCollateral(PHALA_PCCS_URL, quote)) as unknown as Record<string, unknown>;
      const { pck_certificate_chain: _chain, ...rest } = raw; // per-machine; verify() takes it from the quote
      void _chain;
      entries[key] = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, Array.isArray(v) ? hex(Uint8Array.from(v)) : v]));
      for (const doc of [rest.tcb_info, rest.qe_identity]) {
        const next = Date.parse((JSON.parse(String(doc)) as { nextUpdate: string }).nextUpdate);
        if (next < validUntil) validUntil = next;
      }
    }
  }
  if (Object.keys(entries).length === 0) throw new Error('no collateral captured');
  const snapshot = { capturedAt: new Date().toISOString(), source: PHALA_PCCS_URL, validUntil: new Date(validUntil).toISOString(), entries };
  writeFileSync(OUT, JSON.stringify(snapshot, null, 1) + '\n');
  console.log('->', OUT, Object.keys(entries).join(', '), 'validUntil', snapshot.validUntil);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'failed');
  process.exit(1);
});
