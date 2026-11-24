// Records what the end-to-end test replays (tests/e2e/fixtures/enclave-recording.json): one real enclave
// exchange per purpose on the fixture story, through the same pipelines the browser uses (attestation, quote
// binding and Intel's signature checked here before anything is encrypted). Only the DECRYPTED model text is kept;
// per-run ids become placeholders ({{item:N}}, {{moment:N}}). The lesson draft is written by hand to the real
// LessonDraft shape (no model call). Costs three small e2ee calls.
// Run: pnpm tsx --env-file=.env.local scripts/record-e2e-fixture.ts [--force]
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { draftCard, translateCard } from '../src/lib/card/pipeline';
import type { AttestationSummary } from '../src/lib/crypto/attestation';
import { draftParentNote } from '../src/lib/note/pipeline';
import type { MomentView } from '../src/lib/note/schema';
import { LessonDraft, verifyLesson } from '../src/lib/schedule/lesson';
import { SAMPLE_LESSON } from '../src/lib/desk/sampleLesson';
import { RECORDING_PATH, type EnclaveRecording } from '../src/lib/testing/fixtureMode';
import { enclaveChat, type EnclaveChat, type Purpose } from '../src/lib/venice/enclaveClient';
import { fixtureChat } from '../src/lib/venice/fixtureChat';
import { E2EE_MODEL, type Usage } from '../src/lib/venice/prices';

const KEY = process.env.VENICE_API_KEY;
if (!KEY) throw new Error('VENICE_API_KEY missing');
const OUT = join(process.cwd(), RECORDING_PATH);
if (existsSync(OUT) && !process.argv.includes('--force')) throw new Error(`${RECORDING_PATH} exists; pass --force to record again`);

const CHILD = 'Sam';
/** Synthetic, as a parent in the demo church would write it. The e2e types exactly this. */
const STORY = [
  'Sam is 6 and in 1st grade.',
  'Sam loves building with blocks and anything about the ocean, especially octopuses.',
  'Big, loud groups are hard, and Sam may freeze and stop talking.',
  'A heads-up before each change helps, and so does holding the small stuffed octopus from home.',
  'When Sam starts rocking or covers both ears, a quiet corner helps.',
  'Sam is allergic to tree nuts and has an EpiPen in the front pocket of the backpack.',
  'Only me (Jordan) or Aunt Lena may pick Sam up.',
].join(' ');
/** What the e2e's buddy logs: a good moment during worship. */
const MOMENT = { step: 'Worship', kind: 'good' as const, helped: [] as string[] };

/** The lesson as the real call returns it for the sandbox's sample lesson (labels as the live call returned them). */
const LESSON_DRAFT: LessonDraft = {
  title: 'Advent, week 1: Waiting with hope',
  steps: [
    { key: 'arrive', label: 'Arrive and settle on rug', labelEs: 'Llegar y sentarse en la alfombra', segment: 'arrive', sensoryLoad: 'low', minutes: 5 },
    { key: 'worship', label: 'Sing with the band', labelEs: 'Cantar con la banda', segment: 'worship', sensoryLoad: 'high', minutes: 15 },
    { key: 'bible_story', label: 'Bible story and talk', labelEs: 'Historia bíblica y charla', segment: 'story', sensoryLoad: 'med', minutes: 15 },
    { key: 'snack', label: 'Snack at the tables', labelEs: 'Merienda en las mesas', segment: 'snack', sensoryLoad: 'med', minutes: 10 },
    { key: 'craft', label: 'Make a hope star', labelEs: 'Hacer una estrella de esperanza', segment: 'craft', sensoryLoad: 'med', minutes: 15 },
    { key: 'pickup', label: 'Tidy up and wait', labelEs: 'Ordenar y esperar', segment: 'pickup', sensoryLoad: 'low', minutes: 5 },
  ],
  bigIdeaQuote: 'Waiting is easier when we know someone good is coming.',
  verseRef: 'Isaiah 9:6',
};

const node = { apiKey: KEY };
const texts: Partial<Record<Purpose, string>> = {};
const usage: Partial<Record<Purpose, Usage | null>> = {};
let attestation: AttestationSummary | null = null;
/** The real enclave call; keeps the decrypted text of the last call per purpose (the one the pipeline used). */
const recording: EnclaveChat = async (o) => {
  const r = await enclaveChat(o);
  texts[o.purpose] = r.text;
  usage[o.purpose] = r.usage;
  attestation = r.attestation;
  return r;
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const placehold = (text: string, ids: string[], kind: 'item' | 'moment') =>
  ids.reduce((t, id, n) => t.replace(new RegExp(escapeRe(id), 'g'), `{{${kind}:${n}}}`), text);

async function main() {
  const lessonCheck = verifyLesson(SAMPLE_LESSON, LessonDraft.parse(LESSON_DRAFT));
  if (!lessonCheck.ok) throw new Error(`hand-written lesson does not verify: ${lessonCheck.errors.join(',')}`);

  const { card } = await draftCard(STORY, CHILD, { model: E2EE_MODEL, node, chat: recording });
  console.log(`card: ${card.items.length} lines (${card.items.filter((i) => i.section === 'safety').length} safety), ${card.dropped.length} left out, ${card.safetyPrompts.length} prompts`);
  for (const i of card.items) console.log(`  [${i.section}/${i.kind}] ${i.text}`);

  await translateCard(card, { model: E2EE_MODEL, node, chat: recording, childName: CHILD });
  const momentId = randomUUID();
  const moments: MomentView[] = [{ id: momentId, ...MOMENT }];
  const { note } = await draftParentNote(moments, 'en', { model: E2EE_MODEL, node, chat: recording, childName: CHILD });
  console.log(`note: ${note.sentences.map((s) => s.text).join(' | ')} (${note.dropped.length} dropped)`);

  const a = attestation as AttestationSummary | null;
  if (!a || a.quote.signature !== 'verified') throw new Error('no verified attestation');
  const out: EnclaveRecording = {
    provenance: {
      recordedAt: new Date().toISOString(),
      how: 'scripts/record-e2e-fixture.ts: real e2ee calls through the browser pipelines (Node variant); decrypted model text only',
      model: E2EE_MODEL,
      provider: a.provider,
      hardware: a.hardware,
      mrtdShort: a.quote.mrtdShort,
      intelSignature: a.quote.signature,
      signatureCheckedIn: a.quote.signatureCheckedIn,
      tcbStatus: a.quote.tcbStatus,
      usage,
      lesson: 'hand-written to the LessonDraft shape for the sandbox sample lesson; no model call',
    },
    card: { childName: CHILD, story: STORY, text: texts.card! },
    translate: { text: placehold(texts.translate!, card.items.map((i) => i.id), 'item') },
    note: { lang: 'en', moments: [MOMENT], text: placehold(texts.note!, [momentId], 'moment') },
    lesson: { draft: LESSON_DRAFT },
  };

  // The replay has to give the same card and note the real run gave.
  const replay = fixtureChat({ card: out.card.text, translate: out.translate!.text, note: out.note.text });
  const again = await draftCard(STORY, CHILD, { model: E2EE_MODEL, chat: replay });
  if (JSON.stringify(again.card.items.map((i) => [i.section, i.text])) !== JSON.stringify(card.items.map((i) => [i.section, i.text]))) {
    throw new Error('replayed card differs from the recorded one');
  }
  const replayedNote = await draftParentNote([{ id: randomUUID(), ...MOMENT }], 'en', { chat: replay, childName: CHILD });
  if (replayedNote.note.sentences.length !== note.sentences.length) throw new Error('replayed note differs from the recorded one');

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote ${RECORDING_PATH}`, usage);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'failed');
  process.exit(1);
});
