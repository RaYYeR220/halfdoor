import { describe, expect, it } from 'vitest';
import { adaptationsFor } from '@/lib/schedule/adapt';
import { CHIP_PICTOGRAM, PINNED_PICTOGRAMS, isPinnedPictogram } from '@/lib/schedule/arasaac';
import { getVerse, passageIdOf } from '@/lib/schedule/bible';
import { labelOk, verifyLesson, type LessonDraft } from '@/lib/schedule/lesson';
import { SEGMENTS, SEGMENT_PICTOGRAM, type Step } from '@/lib/schedule/segments';
import { SOCIAL_STORY_TABLE, socialStory } from '@/lib/schedule/socialStory';
import { LESSON } from '@/db/seed/fernbrook';

const steps = LESSON.steps as Step[];
const SOURCE = LESSON.sourceText;
const draft = (over: Partial<LessonDraft> = {}): LessonDraft => ({
  title: 'Waiting with hope',
  steps: steps.map((s) => ({ ...s })),
  bigIdeaQuote: LESSON.bigIdea,
  verseRef: 'Isaiah 9:6',
  ...over,
});

describe('verifyLesson', () => {
  it('accepts a big idea that is in the lesson and returns the source wording', () => {
    const r = verifyLesson(SOURCE, draft({ bigIdeaQuote: 'waiting is easier when we know someone good is coming' }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lesson.bigIdeaQuote).toBe(LESSON.bigIdea.replace(/[.]$/, ''));
      expect(r.lesson.totalMinutes).toBe(65);
    }
  });
  it('rejects a big idea that is not in the lesson', () => {
    const r = verifyLesson(SOURCE, draft({ bigIdeaQuote: 'Hope always wins in the end.' }));
    expect(r).toEqual({ ok: false, errors: ['big_idea_not_in_lesson'] });
  });
  it('rejects duplicate keys and more than 120 minutes', () => {
    const dup = draft({ steps: [...steps, { ...steps[0] }].map((s) => ({ ...s })) });
    expect(verifyLesson(SOURCE, dup)).toMatchObject({ ok: false, errors: expect.arrayContaining(['duplicate_step_key']) });
    const long = draft({ steps: steps.map((s) => ({ ...s, minutes: 30 })) });
    expect(verifyLesson(SOURCE, long)).toMatchObject({ ok: false, errors: ['total_minutes_over_120'] });
  });
});

describe('step labels (the only model prose in the pack)', () => {
  const withLabel = (label: string) => draft({ steps: steps.map((x, i) => (i === 0 ? { ...x, label } : { ...x })) });
  it('accepts short plain labels', () => {
    for (const l of ['Arrive', 'Hear the promise of a king', 'Make a hope reminder', 'Snack time 2']) expect(labelOk(l)).toBe(true);
    expect(verifyLesson(SOURCE, withLabel('Sing about the promise')).ok).toBe(true);
  });
  it('accepts a 40-char label and a 20-char word', () => {
    expect(labelOk('a'.repeat(20) + ' ' + 'b'.repeat(19))).toBe(true);
    expect(labelOk('a'.repeat(21))).toBe(false);
  });
  it('stores the normalized label', () => {
    const r = verifyLesson(SOURCE, withLabel('  Sing   '));
    expect(r.ok && r.lesson.steps[0].label).toBe('Sing');
  });
  it('rejects more than 6 words, control chars, links, handles, emails, digits-only', () => {
    for (const l of [
      'one two three four five six seven', 'Line one\nline two', 'tab\there', 'zero\u200bwidth', 'see https://x.io now', 'visit www.evil.com',
      'evil.com/free', 'ping @someone', 'mail a@b.co', '12345', '!!! ???', '   ', 'x\ny',
      'a'.repeat(41), 'word '.repeat(7).trim(), 'Averyveryveryverylongword ok', 'evil.xyz/free', 'go to evil.xyz',
      'ｈｔｔｐｓ：//x', '＠handle', 'ㅤ', '⠀', 'okᅟok', 'okᅠ', 'okﾠ',
    ]) {
      expect(labelOk(l), l).toBe(false);
      expect(verifyLesson(SOURCE, withLabel(l))).toMatchObject({ ok: false, errors: expect.arrayContaining(['bad_label']) });
    }
  });
});

describe('adaptationsFor', () => {
  it('noise_sensitive gives headphones on the worship step only', () => {
    const a = adaptationsFor(['noise_sensitive'], steps);
    expect(a.map((x) => [x.stepKey, x.chip])).toEqual([['worship', 'headphones']]);
  });
  it('applies each rule to the right steps', () => {
    const at = (tag: Parameters<typeof adaptationsFor>[0][number], chip: string) =>
      adaptationsFor([tag], steps).filter((x) => x.chip === chip).map((x) => x.stepKey);
    expect(at('crowds_hard', 'quiet_seat')).toEqual(['worship']);
    expect(at('transitions_hard', 'two_minute_warning')).toEqual(['worship', 'story', 'snack', 'craft', 'pickup']);
    expect(at('needs_breaks', 'break_card')).toEqual(['worship', 'story', 'snack', 'pickup']);
    expect(at('nonverbal_or_aac', 'aac_board')).toHaveLength(6);
    expect(at('food_allergy', 'snack_check')).toEqual(['snack']);
    expect(at('mobility_aid', 'accessible_spot')).toEqual(['craft']);
    expect(at('elopement_risk', 'stay_close')).toEqual(['pickup']);
  });
  it('no tags, no chips; an unrelated tag adds none', () => {
    expect(adaptationsFor([], steps)).toEqual([]);
    expect(adaptationsFor(['spanish_home', 'bathroom_help'], steps)).toEqual([]);
  });
  it('carries EN and ES labels', () => {
    expect(adaptationsFor(['noise_sensitive'], steps)[0].label).toEqual({ en: 'Offer headphones', es: 'Ofrece audífonos' });
  });
});

describe('socialStory', () => {
  const tableSentences = (lang: 'en' | 'es') => {
    const t = SOCIAL_STORY_TABLE;
    const bodies = Object.values(t.segments).map((s) => s[lang]);
    const leads = [t.leads.first[lang], t.leads.then[lang]];
    const segs = leads.flatMap((l) => bodies.map((b) => `${l} ${b}.`));
    return new Set([...segs, ...Object.values(t.chips).map((c) => c[lang]), t.closing[lang]]);
  };
  it('EN: one fixed sentence per step, chip sentence once, closing last', () => {
    const chips = adaptationsFor(['noise_sensitive', 'nonverbal_or_aac'], steps);
    const s = socialStory(steps, chips, 'en');
    expect(s[0]).toBe('First, we walk into church.');
    expect(s).toContain('First, we walk into church.');
    expect(s).toContain('Then, we sing songs together.');
    expect(s).toContain('It can be loud. I can wear my headphones.');
    expect(s.filter((x) => x.includes('talking board'))).toHaveLength(1);
    expect(s.at(-1)).toBe('Then my grown-up picks me up.');
  });
  it('ES output contains "Primero" and nothing outside the template table', () => {
    const chips = adaptationsFor(['noise_sensitive', 'transitions_hard', 'food_allergy', 'elopement_risk'], steps);
    const s = socialStory(steps, chips, 'es');
    expect(s.join(' ')).toContain('Primero');
    const table = tableSentences('es');
    for (const line of s) expect(table.has(line)).toBe(true);
    expect(s.at(-1)).toBe('Luego mi adulto viene a recogerme.');
  });
  it('EN output is also only table sentences, for every segment', () => {
    const all = SEGMENTS.map((segment, i): Step => ({ key: `k${i}`, label: 'x', segment, sensoryLoad: 'low', minutes: 5 }));
    const table = tableSentences('en');
    for (const line of socialStory(all, [], 'en')) expect(table.has(line)).toBe(true);
  });
});

describe('pictograms', () => {
  it('pins an id per segment and per chip, all distinct', () => {
    expect(Object.keys(SEGMENT_PICTOGRAM).sort()).toEqual([...SEGMENTS].sort());
    expect(PINNED_PICTOGRAMS.size).toBe(Object.keys(SEGMENT_PICTOGRAM).length + Object.keys(CHIP_PICTOGRAM).length);
    expect(isPinnedPictogram(SEGMENT_PICTOGRAM.worship)).toBe(true);
    expect(isPinnedPictogram(1)).toBe(false);
  });
});

describe('getVerse', () => {
  it('maps references to passage ids', () => {
    expect(passageIdOf('Isaiah 9:6')).toBe('ISA.9.6');
    expect(passageIdOf('1 John 4:19')).toBe('1JN.4.19');
    expect(passageIdOf('Psalm 23:1-3')).toBe('PSA.23.1-3');
    expect(passageIdOf('Hezekiah 1:1')).toBeNull();
    expect(passageIdOf('Isaiah 9')).toBeNull();
  });
  it('returns null for an unknown reference without a network call', async () => {
    expect(await getVerse('nonsense')).toBeNull();
  });
  it('returns null when the lookup fails', async () => {
    const boom = { getPassage: async () => { throw new Error('offline'); } };
    expect(await getVerse('Isaiah 9:6', boom)).toBeNull();
  });
  it('Isaiah 9:6 is BSB text (network; skipped offline)', async (t) => {
    const online = await fetch('https://bible.helloao.org/api/available_translations.json', { signal: AbortSignal.timeout(4000) })
      .then((r) => r.ok).catch(() => false);
    if (!online) t.skip();
    const v = await getVerse('Isaiah 9:6');
    expect(v?.text).toContain('Wonderful Counselor');
    expect(v?.attribution).toBe('Berean Standard Bible (BSB), public domain.');
  });
});
