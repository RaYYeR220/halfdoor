import { describe, expect, test, vi } from 'vitest';
import type { AttestationSummary } from '@/lib/crypto/attestation';
import { buildCardPrompt, buildTranslatePrompt } from '@/lib/card/prompts';
import { draftCard, StoryLengthError, translateCard } from '@/lib/card/pipeline';
import { verifyCard } from '@/lib/card/verify';
import type { DraftCard } from '@/lib/card/schema';

const LEO =
  'Leo is 7. He loves trains and the color yellow. Loud music hurts his ears so he wears his blue headphones during worship. When he starts humming loudly and covering his face he needs a quiet break. He used to be allergic to eggs but he outgrew it last year. He IS allergic to peanuts - he has an EpiPen in his backpack. His dad is NOT allowed to pick him up, only me (Maria) or his grandma Rosa.';

const A: AttestationSummary = { verified: true, nonceOk: true, provider: 'p', hardware: null, model: 'e2ee-x', signingAddress: null, modelPublicKey: 'k', checkedAt: 'now' };

const GOOD_LEO_DRAFT: DraftCard = {
  items: [
    { section: 'loves', text: 'Loves trains and yellow', quotes: ['loves trains and the color yellow'] },
    { section: 'helps', text: 'Wears blue headphones during worship', quotes: ['wears his blue headphones during worship'] },
    { section: 'signs', text: 'Humming loudly and covering his face means a quiet break', quotes: ['starts humming loudly and covering his face'] },
    { section: 'safety', text: 'Allergic to peanuts, has an EpiPen', quotes: ['IS allergic to peanuts'] },
    { section: 'safety', text: 'Dad is not allowed to pick him up', quotes: ['His dad is NOT allowed to pick him up'] },
  ],
  tags: [{ tag: 'food_allergy', item: 3 }],
};

describe('buildCardPrompt', () => {
  test('child name never leaves in the prompt', () => {
    const p = buildCardPrompt(LEO, 'Leo');
    expect(p.user).not.toMatch(/\bLeo\b/);
    expect(p.user).toContain('the child is 7.');
    expect(p.system).not.toMatch(/Leo/);
  });
  test('possessive and case-insensitive', () => {
    expect(buildCardPrompt("Leo's mom says LEO hates noise, and leo hides. Leonard is a friend.", 'Leo').user).toBe(
      "the child's mom says the child hates noise, and the child hides. Leonard is a friend.",
    );
  });
  test('system prompt is short and pins vocab', () => {
    const { system } = buildCardPrompt(LEO, 'Leo');
    expect(system.length).toBeLessThan(2000);
    expect(system).toContain('elopement_risk');
    expect(system).toContain('safety');
    expect(system).toContain('character-for-character');
  });
  test('translate prompt carries ids', () => {
    const v = verifyCard(LEO, GOOD_LEO_DRAFT);
    expect(buildTranslatePrompt(v.items).user).toContain('"id":"i0"');
  });
});

describe('draftCard', () => {
  test('draftCard retries once on bad JSON then verifies', async () => {
    const chat = vi.fn().mockResolvedValueOnce({ text: 'not json', attestation: A, usage: null })
      .mockResolvedValueOnce({ text: JSON.stringify(GOOD_LEO_DRAFT), attestation: A, usage: null });
    const { card } = await draftCard(LEO, 'Leo', { model: 'e2ee-x', chat });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(card.items.length).toBeGreaterThan(3);
    expect(card.dropped).toHaveLength(0);
  });
  test('gives up after the retry', async () => {
    const chat = vi.fn().mockResolvedValue({ text: 'nope', attestation: A, usage: null });
    await expect(draftCard(LEO, 'Leo', { model: 'e2ee-x', chat })).rejects.toThrow();
    expect(chat).toHaveBeenCalledTimes(2);
  });
  test('stream error leaves no draft and keeps story', async () => {
    const chat = vi.fn().mockRejectedValue(new Error('upstream 502'));
    await expect(draftCard(LEO, 'Leo', { model: 'e2ee-x', chat })).rejects.toThrow(/502/);
  });
  test('rejects a story under 40 chars', async () => {
    await expect(draftCard('Hi', 'Leo', { model: 'e2ee-x', chat: vi.fn() })).rejects.toBeInstanceOf(StoryLengthError);
  });
  test('rejects a story over 6000 chars', async () => {
    await expect(draftCard('a'.repeat(6001), 'Leo', { model: 'e2ee-x', chat: vi.fn() })).rejects.toBeInstanceOf(StoryLengthError);
  });
  test('name redaction round-trip: quotes with "the child" locate, spans map to the original', async () => {
    const draft: DraftCard = {
      items: [
        { section: 'loves', text: 'the child is 7 and loves trains', quotes: ['the child is 7', 'loves trains'] },
        { section: 'safety', text: 'x', quotes: ['IS allergic to peanuts'] },
      ],
      tags: [],
    };
    const chat = vi.fn().mockResolvedValue({ text: JSON.stringify(draft), attestation: A, usage: null });
    const { card } = await draftCard(LEO, 'Leo', { model: 'e2ee-x', chat });
    expect(chat.mock.calls[0][0].user).not.toMatch(/Leo/);
    expect(card.dropped).toHaveLength(0);
    const first = card.items[0];
    expect(first.quotes[0].text).toBe('Leo is 7');
    expect(LEO.slice(first.quotes[0].span.start, first.quotes[0].span.end)).toBe('Leo is 7');
    expect(first.text).toContain('Leo');
    expect(first.text).not.toContain('the child');
    for (const it of card.items) for (const q of it.quotes) expect(LEO.slice(q.span.start, q.span.end)).toBe(q.text);
    expect(card.items[1].text).toContain('EpiPen');
  });
});

describe('verbatim safety text keeps the original wording', () => {
  test('a literal "the child" in the story survives (no name restoration on verbatim)', async () => {
    const story = 'Leo is allergic to peanuts. He loves trains and yellow things. Never seat him beside the child with the nut snacks.';
    const draft: DraftCard = {
      items: [{ section: 'safety', text: 'x', quotes: ['allergic to peanuts', 'Never seat him beside the child with the nut snacks'] }],
      tags: [],
    };
    const chat = vi.fn().mockResolvedValue({ text: JSON.stringify(draft), attestation: A, usage: null });
    const { card } = await draftCard(story, 'Leo', { model: 'e2ee-x', chat });
    expect(card.items[0].kind).toBe('verbatim');
    expect(card.items[0].text).toBe('Leo is allergic to peanuts. Never seat him beside the child with the nut snacks.');
    expect(card.items[0].text).toContain('beside the child with the nut snacks');
  });
});

describe('translateCard', () => {
  const base = () => verifyCard(LEO, GOOD_LEO_DRAFT);
  test('child name is redacted before the call and restored after', async () => {
    const draft: DraftCard = { items: [{ section: 'loves', text: 'x', quotes: ['Leo is 7'] }], tags: [] };
    const card = verifyCard(LEO, draft);
    expect(card.items[0].text).toContain('Leo');
    const chat = vi.fn().mockImplementation(async (o: { user: string }) => {
      expect(o.user).not.toMatch(/Leo/);
      expect(o.user).toContain('[CHILD]');
      return { text: JSON.stringify({ translations: [{ id: 'i0', text: '[CHILD] tiene 7 anos.' }] }), attestation: A, usage: null };
    });
    const out = await translateCard(card, { model: 'e2ee-x', chat, childName: 'Leo' });
    expect(out.items[0].translation?.text).toBe('Leo tiene 7 anos.');
  });
  test('EN to ES, withholds a translation that lost the limiter', async () => {
    const card = base();
    const neg = card.items.find((i) => i.text.includes('NOT'))!;
    const chat = vi.fn().mockResolvedValue({
      text: JSON.stringify({ translations: card.items.map((i) => ({ id: i.id, text: i.id === neg.id ? 'El papa puede recogerlo' : `ES ${i.text}` })) }),
      attestation: A,
      usage: null,
    });
    const out = await translateCard(card, { model: 'e2ee-x', chat });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(out.items[0].translation).toMatchObject({ lang: 'es', withheld: false });
    expect(out.items.find((i) => i.id === neg.id)!.translation).toMatchObject({ lang: 'es', withheld: true });
    expect(out.items.every((i) => i.quotes.length > 0)).toBe(true);
  });
  test('limiter kept in translation is not withheld', async () => {
    const card = base();
    const neg = card.items.find((i) => i.text.includes('NOT'))!;
    const chat = vi.fn().mockResolvedValue({ text: JSON.stringify({ translations: [{ id: neg.id, text: 'El papa NO puede recogerlo' }] }), attestation: A, usage: null });
    const out = await translateCard(card, { model: 'e2ee-x', chat });
    expect(out.items.find((i) => i.id === neg.id)!.translation?.withheld).toBe(false);
  });
  test('lang other returns unchanged without a call', async () => {
    const card = { ...base(), lang: 'other' as const };
    const chat = vi.fn();
    expect(await translateCard(card, { model: 'e2ee-x', chat })).toBe(card);
    expect(chat).not.toHaveBeenCalled();
  });
});
