// Live check: attestation + one encrypted call. Run: pnpm tsx --env-file=.env.local scripts/e2ee-smoke.ts
import { checkAttestation } from '../src/lib/crypto/attestation';
import { draftCard } from '../src/lib/card/pipeline';
import { decryptFromEnclave, encryptForEnclave, looksEncrypted, newClientKeys } from '../src/lib/crypto/e2ee';

const KEY = process.env.VENICE_API_KEY;
if (!KEY) throw new Error('VENICE_API_KEY missing');
const MODEL = 'e2ee-deepseek-v4-flash';
const BASE = 'https://api.venice.ai/api/v1';

const story = `Leo is 7. He loves trains and the color yellow. Loud music hurts his ears so he wears his blue headphones during worship. When he starts humming loudly and covering his face he needs a quiet break. He used to be allergic to eggs but he outgrew it last year. He IS allergic to peanuts - he has an EpiPen in his backpack. His dad is NOT allowed to pick him up, only me (Maria) or his grandma Rosa.`;
const sys = `Extract a support card. Return ONLY JSON of the exact shape {"items":[{"section":"loves|hard|helps|signs|safety","text":"...","quotes":["..."]}]}. Every item must include "quotes": exact substrings copied from the parent's text. Safety items (allergies, medical, pickup) must be verbatim sentences.`;

function bytesHex(b: Uint8Array) { return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); }

async function pipeline() {
  const { card, attestation } = await draftCard(story, 'Leo', { model: MODEL, node: { apiKey: KEY!, baseUrl: BASE } });
  console.log('attestation:', { verified: attestation.verified, provider: attestation.provider });
  console.log('lang:', card.lang, 'dropped:', card.dropped.length, 'tags:', card.tags.join(','), 'safetyPrompts:', card.safetyPrompts.length);
  for (const it of card.items) console.log(`[${it.section}/${it.kind}] ${it.text}`);
  for (const d of card.dropped) console.log('DROPPED', d.reason, d.text);
}

async function main() {
  if (process.argv.includes('--pipeline')) return pipeline();
  const nonce = bytesHex(crypto.getRandomValues(new Uint8Array(32)));

  const att = await (await fetch(`${BASE}/tee/attestation?model=${MODEL}&nonce=${nonce}`, { headers: { Authorization: `Bearer ${KEY}` } })).json();
  const summary = checkAttestation(att, nonce, MODEL);
  console.log('attestation:', { verified: summary.verified, nonceOk: summary.nonceOk, provider: summary.provider, hardware: summary.hardware, signingAddress: summary.signingAddress });

  const client = newClientKeys();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json',
      'X-Venice-TEE-Client-Pub-Key': client.publicKeyHex,
      'X-Venice-TEE-Model-Pub-Key': summary.modelPublicKey,
      'X-Venice-TEE-Signing-Algo': 'ecdsa',
    },
    body: JSON.stringify({
      model: MODEL, stream: true, max_tokens: 800,
      messages: [
        { role: 'system', content: encryptForEnclave(sys, summary.modelPublicKey) },
        { role: 'user', content: encryptForEnclave(story, summary.modelPublicKey) },
      ],
      venice_parameters: { include_venice_system_prompt: false, disable_thinking: true },
    }),
  });
  console.log('status', res.status);
  const raw = await res.text();
  if (res.status !== 200) { console.log(raw.slice(0, 500)); process.exit(1); }
  let out = '', enc = 0, usage: unknown = null;
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const d = line.slice(5).trim();
    if (d === '[DONE]') continue;
    try {
      const j = JSON.parse(d);
      if (j.usage) usage = j.usage;
      const c = j.choices?.[0]?.delta?.content;
      if (c) { if (looksEncrypted(c)) { out += decryptFromEnclave(c, client.privateKey); enc++; } else out += c; }
    } catch { /* skip non-JSON line */ }
  }
  console.log('encrypted chunks:', enc, 'usage:', usage);
  console.log(out);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : 'failed'); process.exit(1); });
