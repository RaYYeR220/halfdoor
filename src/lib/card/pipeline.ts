// Browser-side card pipeline: redact -> enclave -> parse -> verify -> restore the name for display.
import type { AttestationSummary } from '@/lib/crypto/attestation';
import { enclaveChat, type EnclaveChat, type NodeAccess } from '@/lib/venice/enclaveClient';
import { detectLang } from '@/lib/text/lang';
import { limiterTokens } from '@/lib/text/polarity';
import { sentenceContaining } from '@/lib/text/sentences';
import { buildCardPrompt, buildTranslatePrompt, redactName, restoreName, toOriginalOffset } from './prompts';
import { findSafetyPrompts } from './safetyNet';
import { DraftCard, type CardItem, type VerifiedCard } from './schema';
import { verifyCard } from './verify';

export const STORY_MIN = 40;
export const STORY_MAX = 6000;

export class StoryLengthError extends Error {
  constructor(readonly length: number) {
    super(`story must be ${STORY_MIN}-${STORY_MAX} characters`);
    this.name = 'StoryLengthError';
  }
}

export type PipelineOpts = {
  model: string;
  onAttestation?: (a: AttestationSummary) => void;
  signal?: AbortSignal;
  /** Injectable for tests; production default is enclaveChat. */
  chat?: EnclaveChat;
  node?: NodeAccess;
};

function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  return JSON.parse(a >= 0 && b > a ? t.slice(a, b + 1) : t);
}

function parseDraft(text: string): DraftCard | null {
  try {
    const r = DraftCard.safeParse(extractJson(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export async function draftCard(
  story: string,
  childName: string,
  opts: PipelineOpts,
): Promise<{ card: VerifiedCard; attestation: AttestationSummary }> {
  if (story.length < STORY_MIN || story.length > STORY_MAX) throw new StoryLengthError(story.length);
  const chat = opts.chat ?? enclaveChat;
  const { system, user } = buildCardPrompt(story, childName);
  const call = (u: string) =>
    chat({ model: opts.model, purpose: 'card', system, user: u, signal: opts.signal, onAttestation: opts.onAttestation, node: opts.node });

  let res = await call(user);
  let draft = parseDraft(res.text);
  if (!draft) {
    res = await call(`${user}\n\nReturn only JSON of the shape {"items":[{"section","text","quotes"}],"tags":[{"tag","item"}]} and nothing else.`);
    draft = parseDraft(res.text);
  }
  if (!draft) throw new Error('the model did not return a usable card');

  // The model saw the redacted story, so quotes are located there; then everything maps back.
  const red = redactName(story, childName);
  const v = verifyCard(red.text, draft);
  const back = (s: { start: number; end: number }) => ({
    start: toOriginalOffset(red, s.start, false),
    end: toOriginalOffset(red, s.end, true),
  });

  const items: CardItem[] = v.items.map((it) => {
    const quotes = it.quotes.map((q) => {
      const span = back(q.span);
      return { text: story.slice(span.start, span.end), span };
    });
    let text = restoreName(it.text, childName);
    if (it.kind === 'verbatim') {
      const at = red.text.indexOf(it.text);
      if (at >= 0) {
        const s = back({ start: at, end: at + it.text.length });
        text = story.slice(s.start, s.end);
      }
    }
    return { ...it, text, quotes };
  });

  const lang = detectLang(story);
  const covered = items.filter((i) => i.section === 'safety').flatMap((i) => i.quotes.map((q) => sentenceContaining(story, q.span)));
  const card: VerifiedCard = {
    lang,
    items,
    tags: v.tags,
    dropped: v.dropped.map((d) => ({ ...d, text: restoreName(d.text, childName) })),
    safetyPrompts: findSafetyPrompts(story, lang, covered),
  };
  return { card, attestation: res.attestation };
}

export async function translateCard(card: VerifiedCard, opts: PipelineOpts): Promise<VerifiedCard> {
  if (card.lang === 'other' || card.items.length === 0) return card;
  const target = card.lang === 'en' ? 'es' : 'en';
  const chat = opts.chat ?? enclaveChat;
  const { system, user } = buildTranslatePrompt(card.items);
  const res = await chat({
    model: opts.model, purpose: 'translate', system, user, signal: opts.signal, onAttestation: opts.onAttestation, node: opts.node,
  });

  let byId: Map<string, string>;
  try {
    const j = extractJson(res.text) as { translations?: { id?: unknown; text?: unknown }[] };
    byId = new Map(
      (j.translations ?? []).flatMap((t) => (typeof t.id === 'string' && typeof t.text === 'string' && t.text.trim() ? [[t.id, t.text] as const] : [])),
    );
  } catch {
    throw new Error('the model did not return usable translations');
  }

  return {
    ...card,
    items: card.items.map((it) => {
      const text = byId.get(it.id);
      if (text === undefined) return it;
      const withheld = limiterTokens(it.text, card.lang).length > 0 && limiterTokens(text, target).length === 0;
      return { ...it, translation: { lang: target, text, withheld } };
    }),
  };
}
