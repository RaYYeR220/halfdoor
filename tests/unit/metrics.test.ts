import { describe, expect, test } from 'vitest';
import { contentKeys, outputSentences, provenance, sentenceSupport, supportOf, unsaidLabelFamilies, wordCount } from '../../eval/metrics';
import { aggregateProvenance, type Row } from '../../eval/score';
import { rng, sample } from '../../eval/support-sample';

const STORY =
  "Leo is 6 and he's autistic. He loves dinosaurs and anything with wheels. Loud music in big rooms is really hard for him, he'll cover his ears and drop to the floor. His dad is NOT allowed to pick him up, there's a court order.";

describe('support rule', () => {
  const keys = new Set(contentKeys(STORY));
  test('a sentence built from the story is supported', () => {
    expect(sentenceSupport('Leo loves dinosaurs and anything with wheels.', keys)).toMatchObject({ supported: true });
    expect(sentenceSupport('Loud music in big rooms is hard; he covers his ears.', keys)).toMatchObject({ supported: true });
  });
  test('an invented sentence is unsupported', () => {
    expect(sentenceSupport('Offer him a sensory fidget toy and a weighted blanket during snack time.', keys)).toMatchObject({ supported: false });
  });
  test('header-like lines (4 words or fewer) and lines with no content word are ignored', () => {
    expect(sentenceSupport('Allergies: none known.', keys)).toBeNull();
    expect(sentenceSupport('It is what it is, and so on.', keys)).toBeNull();
  });
  test('sentences come from markdown without carrying headings or leads', () => {
    expect(outputSentences('## Safety\n\nOnly these people:\n- Sara (mom)\n- Ruth\n\nHe bolts. He hides!')).toEqual(['Safety', 'Only these people:', 'Sara (mom)', 'Ruth', 'He bolts.', 'He hides!']);
  });
  test('supportOf counts per sentence', () => {
    const s = supportOf('Leo loves dinosaurs and anything with wheels. Offer him a sensory fidget toy and a weighted blanket during snack time.', STORY);
    expect(s.map((x) => x.supported)).toEqual([true, false]);
  });
});

describe('provenance', () => {
  test('an output in another language than the story is not scored for support', () => {
    const es = 'Mateo tiene 5 años y tiene autismo. Le encantan los trenes y los rompecabezas. Los ruidos fuertes lo asustan.';
    const p = provenance('Mateo is 5 and autistic. He loves trains and puzzles. Loud noises scare him, so give him a quiet corner.', es);
    expect(p.supportScored).toBe(false);
    expect(p.unsupported).toEqual([]);
  });
  test('unsaid labels: exact words, and label families across inflection and EN/ES', () => {
    const p = provenance('Leo has autism and ADHD. He loves dinosaurs and anything with wheels.', STORY);
    expect(p.unsaidLabels.sort()).toEqual(['ADHD', 'autism']);
    expect(p.unsaidFamilies).toEqual(['ADHD']);
    expect(unsaidLabelFamilies('Mateo has autism.', 'Mateo tiene autismo.')).toEqual([]);
    expect(unsaidLabelFamilies('Mateo has anxiety.', 'Mateo tiene autismo.')).toEqual(['anxiety']);
  });
  test('label family: a parent\'s lowercase "adhd" or abbreviation "CP" counts as said; short acronyms stay case-sensitive', () => {
    expect(unsaidLabelFamilies('Wyatt has ADHD.', 'Wyatt 7, adhd. runner')).toEqual([]);
    expect(unsaidLabelFamilies('Ben has cerebral palsy.', 'Ben is 12, has mild CP and uses a walker.')).toEqual([]);
    expect(unsaidLabelFamilies('He has ODD.', 'He thinks rules are odd.')).toEqual(['ODD']);
  });
  test('length: words of the markdown-stripped text, reading time at 200 wpm', () => {
    expect(wordCount('## Title\n\n- **one** two\n| three | four |')).toBe(5);
    const p = provenance(Array.from({ length: 400 }, () => 'word').join(' '), STORY);
    expect(p.words).toBe(400);
    expect(p.readSec).toBe(120);
  });
});

describe('aggregateProvenance', () => {
  const row = (prov: Row['prov']): Row => ({
    system: 's', model: 'm', storyId: 'x', noSafety: false, latencyMs: 1, costUsd: 0, cached: true, prov,
    score: { present: 0, total: 0, limiterPresent: 0, limiterTotal: 0, flips: [], missing: [], trapHits: [], trapClasses: { flips: [], number: [], sibling: [] } },
  });
  test('means over scored rows; labels and length over all rows', () => {
    const a = aggregateProvenance([
      row({ supportScored: true, sentences: 4, unsupported: ['a', 'b'], unsaidLabels: ['autism'], unsaidFamilies: [], words: 100, readSec: 30 }),
      row({ supportScored: true, sentences: 2, unsupported: [], unsaidLabels: [], unsaidFamilies: [], words: 300, readSec: 90 }),
      row({ supportScored: false, sentences: 0, unsupported: [], unsaidLabels: ['ADHD'], unsaidFamilies: ['ADHD'], words: 200, readSec: 60 }),
    ])!;
    expect(a).toMatchObject({ supportScored: 2, unsupportedMean: 1, storiesWithUnsupported: 1, sentencesMean: 3, outputsWithUnsaidLabel: 2, outputsWithUnsaidFamily: 1, wordsMean: 200, wordsP50: 200, readSecMean: 60, readSecP50: 60 });
    expect(aggregateProvenance([row(undefined)])).toBeNull();
  });
});

describe('validation sample', () => {
  test('seeded sampling is reproducible and without repeats', () => {
    const xs = Array.from({ length: 50 }, (_, i) => i);
    const a = sample(xs, 20, rng(2027));
    expect(sample(xs, 20, rng(2027))).toEqual(a);
    expect(new Set(a).size).toBe(20);
    expect(sample(xs, 20, rng(2026))).not.toEqual(a);
  });
});
