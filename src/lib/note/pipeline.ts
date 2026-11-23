// Browser-side (director) note pipeline: redact -> enclave -> parse -> verify -> restore the name.
import type { AttestationSummary } from '@/lib/crypto/attestation';
import { enclaveChat, type EnclaveChat, type NodeAccess } from '@/lib/venice/enclaveClient';
import { E2EE_MODEL } from '@/lib/venice/prices';
import { buildNotePrompt, restoreName } from './prompts';
import { MAX_NOTE_SENTENCES, NoteSentence, type MomentView, type NoteDraft, type VerifiedNote } from './schema';
import { verifyNote } from './verify';

export type NoteOpts = {
  model?: string;
  childName?: string;
  /** Injectable for tests; production default is enclaveChat. */
  chat?: EnclaveChat;
  onAttestation?: (a: AttestationSummary) => void;
  signal?: AbortSignal;
  node?: NodeAccess;
};

function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  return JSON.parse(a >= 0 && b > a ? t.slice(a, b + 1) : t);
}

/** Tolerant: bad sentences are skipped; null when the text is not JSON or no sentence survives (caller retries). */
export function parseNoteDraft(text: string): NoteDraft | null {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch {
    return null;
  }
  const list = (raw as { sentences?: unknown } | null)?.sentences;
  if (!Array.isArray(list)) return null;
  const sentences: NoteDraft['sentences'] = [];
  for (const s of list) {
    const p = NoteSentence.safeParse(s);
    if (p.success && sentences.length < MAX_NOTE_SENTENCES) sentences.push(p.data);
  }
  return sentences.length > 0 ? { sentences } : null;
}

export async function draftParentNote(
  moments: MomentView[], lang: 'en' | 'es', opts: NoteOpts = {},
): Promise<{ note: VerifiedNote; attestation: AttestationSummary }> {
  const chat = opts.chat ?? enclaveChat;
  const childName = opts.childName ?? '';
  const { system, user } = buildNotePrompt(moments, lang, childName);
  const call = (u: string) =>
    chat({ model: opts.model ?? E2EE_MODEL, purpose: 'note', system, user: u, signal: opts.signal, onAttestation: opts.onAttestation, node: opts.node });

  let res = await call(user);
  let draft = parseNoteDraft(res.text);
  if (!draft) {
    res = await call(`${user}\n\nReturn only JSON of the shape {"sentences":[{"text","evidence":["<moment id>"]}]} and nothing else.`);
    draft = parseNoteDraft(res.text);
  }
  if (!draft) throw new Error('the model did not return a usable note');

  const v = verifyNote(draft, new Set(moments.map((m) => m.id)), lang);
  const note: VerifiedNote = {
    sentences: v.sentences.map((s) => ({ ...s, text: restoreName(s.text, childName) })),
    dropped: v.dropped.map((d) => ({ ...d, text: restoreName(d.text, childName) })),
  };
  return { note, attestation: res.attestation };
}
