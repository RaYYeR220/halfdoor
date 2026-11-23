// Live check: attestation (quote binding + Intel signature) + one tiny encrypted call.
// Run: pnpm tsx --env-file=.env.local scripts/e2ee-smoke.ts   (or --pipeline for a full card draft)
import { signatureText } from '../src/lib/crypto/attestation';
import { draftCard } from '../src/lib/card/pipeline';
import { enclaveChat } from '../src/lib/venice/enclaveClient';

const KEY = process.env.VENICE_API_KEY;
if (!KEY) throw new Error('VENICE_API_KEY missing');
const MODEL = 'e2ee-deepseek-v4-flash';
const BASE = 'https://api.venice.ai/api/v1';

const story = `Leo is 7. He loves trains and the color yellow. Loud music hurts his ears so he wears his blue headphones during worship. When he starts humming loudly and covering his face he needs a quiet break. He used to be allergic to eggs but he outgrew it last year. He IS allergic to peanuts - he has an EpiPen in his backpack. His dad is NOT allowed to pick him up, only me (Maria) or his grandma Rosa.`;
async function pipeline() {
  const { card, attestation } = await draftCard(story, 'Leo', { model: MODEL, node: { apiKey: KEY!, baseUrl: BASE } });
  console.log('attestation:', { veniceVerified: attestation.verified, provider: attestation.provider, binding: attestation.binding, signature: attestation.quote.signature });
  console.log('lang:', card.lang, 'dropped:', card.dropped.length, 'tags:', card.tags.join(','), 'safetyPrompts:', card.safetyPrompts.length);
  for (const it of card.items) console.log(`[${it.section}/${it.kind}] ${it.text}`);
  for (const d of card.dropped) console.log('DROPPED', d.reason, d.text);
}

async function main() {
  if (process.argv.includes('--pipeline')) return pipeline();
  // One attestation (binding + Intel signature checked here, both before encrypting) + one tiny encrypted call.
  const r = await enclaveChat({
    model: MODEL,
    purpose: 'card',
    system: 'Reply with one short sentence.',
    user: 'Say hello to a child named Leo.',
    maxTokens: 40,
    node: { apiKey: KEY!, baseUrl: BASE },
  });
  const a = r.attestation;
  console.log('attestation:', { veniceVerified: a.verified, provider: a.provider, hardware: a.hardware, signingAddress: a.signingAddress });
  console.log('binding (checked by this process):', a.binding);
  console.log('intel signature (checked before encrypting):', a.quote);
  console.log(signatureText(a));
  console.log('reply:', JSON.stringify(r.text), 'usage:', r.usage);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : 'failed'); process.exit(1); });
