import { describe, expect, test, vi } from 'vitest';
import type { AttestationSummary } from '@/lib/crypto/attestation';
import { draftParentNote } from '@/lib/note/pipeline';
import { buildNotePrompt } from '@/lib/note/prompts';
import { NoteDraft, type MomentView } from '@/lib/note/schema';
import { JUDGMENT_WORDS, verifyNote } from '@/lib/note/verify';
import type { EnclaveChat } from '@/lib/venice/enclaveClient';

const A = { verified: true } as unknown as AttestationSummary;
const MOMENTS: MomentView[] = [
  { id: 'm1', step: 'Worship', kind: 'hard', helped: ['Leo wears blue headphones during worship'], note: 'Leo covered his ears' },
  { id: 'm2', step: 'Craft', kind: 'good', helped: [] },
];
const reply = (text: string): EnclaveChat => vi.fn(async () => ({ text, attestation: A, usage: null }));

describe('verifyNote', () => {
  test('sentence citing an unknown moment id is dropped as no_evidence', () => {
    const v = verifyNote({ sentences: [{ text: 'It went well.', evidence: ['nope'] }, { text: 'Craft was fun.', evidence: ['m2', 'nope'] }] }, new Set(['m1', 'm2']), 'en');
    expect(v.dropped).toEqual([{ text: 'It went well.', reason: 'no_evidence' }]);
    expect(v.sentences).toEqual([{ text: 'Craft was fun.', evidence: ['m2'], flags: [] }]);
  });
  test('judgment words are flagged, not removed', () => {
    const v = verifyNote({ sentences: [{ text: 'He had a meltdown in worship.', evidence: ['m1'] }] }, new Set(['m1']), 'en');
    expect(v.sentences[0].flags).toEqual(['meltdown']);
    expect(v.sentences[0].text).toContain('meltdown');
  });
  test('Spanish flags, word boundaries', () => {
    expect(verifyNote({ sentences: [{ text: 'Tuvo un berrinche en la alabanza.', evidence: ['m1'] }] }, new Set(['m1']), 'es').sentences[0].flags).toEqual(['berrinche']);
    expect(verifyNote({ sentences: [{ text: 'Se portó mal.', evidence: ['m1'] }] }, new Set(['m1']), 'es').sentences[0].flags).toEqual(['se portó mal']);
    expect(verifyNote({ sentences: [{ text: 'He did badly at none; a badge was fun, misbehaving too.', evidence: ['m1'] }] }, new Set(['m1']), 'en').sentences[0].flags).toEqual(['misbehaving']);
  });
  test('word lists match the brief', () => {
    expect(JUDGMENT_WORDS.en).toContain('meltdown');
    expect(JUDGMENT_WORDS.es).toContain('rabieta');
  });
  test('NoteDraft bounds', () => {
    expect(NoteDraft.safeParse({ sentences: [] }).success).toBe(false);
    expect(NoteDraft.safeParse({ sentences: [{ text: 'x'.repeat(301), evidence: ['a'] }] }).success).toBe(false);
    expect(NoteDraft.safeParse({ sentences: [{ text: 'ok', evidence: [] }] }).success).toBe(false);
  });
});

describe('buildNotePrompt', () => {
  test('child name never leaves in the prompt', () => {
    const p = buildNotePrompt(MOMENTS, 'en', 'Leo');
    expect(p.user).not.toMatch(/\bLeo\b/);
    expect(p.user).toContain('the child wears blue headphones');
    expect(p.system).toContain('English');
    expect(buildNotePrompt(MOMENTS, 'es', 'Leo').system).toContain('Spanish');
  });
});

describe('draftParentNote', () => {
  test('retries once on bad JSON, drops unknown evidence, restores the name', async () => {
    const good = JSON.stringify({ sentences: [
      { text: "The child's worship was loud, and headphones helped.", evidence: ['m1'] },
      { text: 'Invented sentence.', evidence: ['zzz'] },
    ] });
    const chat = vi.fn<EnclaveChat>()
      .mockResolvedValueOnce({ text: 'sorry, here you go', attestation: A, usage: null })
      .mockResolvedValueOnce({ text: '```json\n' + good + '\n```', attestation: A, usage: null });
    const { note } = await draftParentNote(MOMENTS, 'en', { chat, childName: 'Leo' });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[0][0].purpose).toBe('note');
    expect(chat.mock.calls[0][0].user).not.toMatch(/\bLeo\b/);
    expect(note.sentences).toEqual([{ text: "Leo's worship was loud, and headphones helped.", evidence: ['m1'], flags: [] }]);
    expect(note.dropped).toEqual([{ text: 'Invented sentence.', reason: 'no_evidence' }]);
  });
  test('throws after two unusable replies', async () => {
    await expect(draftParentNote(MOMENTS, 'en', { chat: reply('nope') })).rejects.toThrow('usable note');
  });
});
