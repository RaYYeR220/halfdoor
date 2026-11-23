import { describe, expect, test } from 'vitest';
import { verifyCard, acceptSafetyPrompt } from '@/lib/card/verify';
import { renderCardText } from '@/lib/card/render';

const LEO =
  'Leo is 7. He loves trains and the color yellow. Loud music hurts his ears so he wears his blue headphones during worship. When he starts humming loudly and covering his face he needs a quiet break. He used to be allergic to eggs but he outgrew it last year. He IS allergic to peanuts - he has an EpiPen in his backpack. His dad is NOT allowed to pick him up, only me (Maria) or his grandma Rosa.';

describe('verifyCard', () => {
  test('drops items whose quotes are not in the story', () => {
    const v = verifyCard(LEO, { items: [{ section: 'loves', text: 'Loves dinosaurs', quotes: ['he loves dinosaurs'] }], tags: [] });
    expect(v.items).toHaveLength(0);
    expect(v.dropped[0].reason).toBe('quote_not_found');
  });
  test('safety items become the full source sentence verbatim', () => {
    const v = verifyCard(LEO, { items: [{ section: 'safety', text: 'Dad cannot pick up', quotes: ['NOT allowed to pick him up'] }], tags: [] });
    expect(v.items[0]).toMatchObject({ kind: 'verbatim', text: 'His dad is NOT allowed to pick him up, only me (Maria) or his grandma Rosa.' });
  });
  test('flipped paraphrase falls back to the quote sentence', () => {
    const v = verifyCard(LEO, { items: [{ section: 'helps', text: 'Allergic to eggs', quotes: ['used to be allergic to eggs'] }], tags: [] });
    expect(v.items[0].kind).toBe('verbatim');
    expect(v.items[0].text).toContain('outgrew');
  });
  test('faithful paraphrase is kept as paraphrase', () => {
    const v = verifyCard(LEO, { items: [{ section: 'loves', text: 'Loves trains', quotes: ['loves trains'] }], tags: [] });
    expect(v.items[0]).toMatchObject({ kind: 'paraphrase', text: 'Loves trains', id: 'i0' });
  });
  test('paraphrase with an unsaid label is dropped', () => {
    const v = verifyCard(LEO, { items: [{ section: 'hard', text: 'Autistic, needs breaks', quotes: ['needs a quiet break'] }], tags: [] });
    expect(v.items).toHaveLength(0);
    expect(v.dropped[0].reason).toBe('unsaid_label');
  });
  test('safety net surfaces an uncovered EpiPen sentence', () => {
    const v = verifyCard(LEO, { items: [], tags: [] });
    expect(v.safetyPrompts.map((p) => p.matched)).toEqual(expect.arrayContaining(['EpiPen']));
  });
  test('covered safety sentence is not prompted again', () => {
    const v = verifyCard(LEO, { items: [{ section: 'safety', text: 'EpiPen', quotes: ['has an EpiPen'] }], tags: [] });
    expect(v.safetyPrompts.some((p) => p.sentence.includes('EpiPen'))).toBe(false);
  });
  test('keeps Spanish negation in paraphrase', () => {
    const src = 'No le gusta la música fuerte. Le encantan los trenes.';
    const v = verifyCard(src, { items: [{ section: 'hard', text: 'Le gusta la música fuerte', quotes: ['No le gusta la música fuerte'] }], tags: [] });
    expect(v.lang).toBe('es');
    expect(v.items[0].kind).toBe('verbatim');
  });
  test('pickup with solo stays verbatim', () => {
    const src = 'Solo yo o su abuela pueden recogerla. Su papá no.';
    const v = verifyCard(src, { items: [], tags: [] });
    expect(v.safetyPrompts.length).toBeGreaterThan(0);
  });
  test('tag dropped with its item', () => {
    const v = verifyCard(LEO, { items: [{ section: 'loves', text: 'x', quotes: ['not in text'] }], tags: [{ tag: 'noise_sensitive', item: 0 }] });
    expect(v.tags).toEqual([]);
  });
  test('tag kept when its item survives', () => {
    const v = verifyCard(LEO, {
      items: [
        { section: 'loves', text: 'x', quotes: ['not in text'] },
        { section: 'helps', text: 'Wears headphones', quotes: ['wears his blue headphones'] },
      ],
      tags: [{ tag: 'noise_sensitive', item: 1 }, { tag: 'crowds_hard', item: 0 }],
    });
    expect(v.tags).toEqual(['noise_sensitive']);
  });
  test('smart-punctuation quote still locates', () => {
    const src = 'Mia can’t handle crowds. She loves “quiet” corners.';
    const v = verifyCard(src, { items: [{ section: 'hard', text: 'Cannot handle crowds', quotes: ["can't handle crowds"] }], tags: [] });
    expect(v.items).toHaveLength(1);
    expect(v.items[0].quotes[0].span.start).toBe(4);
  });
  test('safety item spanning two sentences joins both in source order', () => {
    const v = verifyCard(LEO, { items: [{ section: 'safety', text: 'Peanuts and eggs', quotes: ['has an EpiPen in his backpack', 'outgrew it last year'] }], tags: [] });
    expect(v.items[0].text).toBe(
      'He used to be allergic to eggs but he outgrew it last year. He IS allergic to peanuts - he has an EpiPen in his backpack.',
    );
  });
  test('other-language story: every item is verbatim and safety lexicon (es) applies', () => {
    const src = 'Ele adora trens. Ele tem alergia a amendoim e usa epipen.';
    const v = verifyCard(src, { items: [{ section: 'loves', text: 'Adora trens', quotes: ['adora trens'] }], tags: [] });
    expect(v.lang).toBe('other');
    expect(v.items[0]).toMatchObject({ kind: 'verbatim', text: 'Ele adora trens.' });
    expect(v.safetyPrompts.length).toBeGreaterThan(0);
  });
  test('stable ids', () => {
    const d = { items: [{ section: 'loves' as const, text: 'Loves trains', quotes: ['loves trains'] }], tags: [] };
    expect(verifyCard(LEO, d)).toEqual(verifyCard(LEO, d));
  });
  test('acceptSafetyPrompt adds a verbatim safety item', () => {
    const v = verifyCard(LEO, { items: [], tags: [] });
    const p = v.safetyPrompts[0];
    const n = v.safetyPrompts.length;
    const r = acceptSafetyPrompt(v, LEO, p.id);
    const item = r.items.find((i) => i.section === 'safety');
    expect(item).toMatchObject({ kind: 'verbatim', text: p.sentence });
    expect(r.safetyPrompts).toHaveLength(n - 1);
    expect(r.safetyPrompts.some((x) => x.id === p.id)).toBe(false);
  });
  test('renderCardText: uppercase headers, one line per item, SECTIONS order, empty omitted', () => {
    const v = verifyCard(LEO, {
      items: [
        { section: 'safety', text: 'x', quotes: ['has an EpiPen'] },
        { section: 'loves', text: 'Loves trains', quotes: ['loves trains'] },
      ],
      tags: [],
    });
    expect(renderCardText(v)).toBe(
      'LOVES:\n- Loves trains\n\nSAFETY:\n- He IS allergic to peanuts - he has an EpiPen in his backpack.',
    );
  });
});
