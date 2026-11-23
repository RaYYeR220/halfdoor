// Captures real Venice attestation responses (no chat calls) plus the public Intel collateral
// for their quotes, as offline test fixtures.
// Run: pnpm tsx --env-file=.env.local scripts/capture-attestation.ts <model> [<model> ...]
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PHALA_PCCS_URL, getCollateral } from '@phala/dcap-qvl';

const KEY = process.env.VENICE_API_KEY;
if (!KEY) throw new Error('VENICE_API_KEY missing');
const BASE = 'https://api.venice.ai/api/v1';
/** Bulky fields the quote checks never read. */
const DROP = new Set(['event_log', 'nvidia_payload', 'info', 'compose_manager_attestation', 'attestation']);

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

async function main() {
  for (const model of process.argv.slice(2)) {
    const nonce = hex(crypto.getRandomValues(new Uint8Array(32)));
    const res = await fetch(`${BASE}/tee/attestation?model=${encodeURIComponent(model)}&nonce=${nonce}`, {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    if (!res.ok) throw new Error(`${model}: attestation ${res.status}`);
    const att = (await res.json()) as Record<string, unknown>;
    const kept = Object.fromEntries(Object.entries(att).filter(([k]) => !DROP.has(k)));
    const raw = await getCollateral(PHALA_PCCS_URL, Buffer.from(String(att.intel_quote), 'hex'));
    // Byte arrays as hex strings (a form verify() accepts) to keep the fixture compact.
    const collateral = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? hex(Uint8Array.from(v)) : v]));
    const file = join('tests', 'fixtures', `attestation-${String(att.tee_provider ?? 'unknown')}.json`);
    const capturedAt = new Date().toISOString();
    writeFileSync(file, JSON.stringify({ capturedAt, requestNonce: nonce, model, attestation: kept, collateral }, null, 1) + '\n');
    console.log(model, '->', file, 'provider', att.tee_provider);
    console.log('  fields:', Object.entries(att).map(([k, v]) => `${k}${DROP.has(k) ? '(dropped)' : ''}:${JSON.stringify(v)?.length ?? 0}`).join(' '));
    await new Promise((r) => setTimeout(r, 5000)); // Venice rate-limits attestation per key+model
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'failed');
  process.exit(1);
});
