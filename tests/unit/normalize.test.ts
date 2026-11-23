import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { agreement } from '../../eval/agreement';
import { normalizeOutput, stripInline } from '../../eval/normalize';
import { scoreOutput } from '../../eval/score';
import type { EvalStory } from '../../eval/types';

const load = (id: string) => JSON.parse(readFileSync(join(process.cwd(), 'eval/stories', `${id}.json`), 'utf8')) as EvalStory;

describe('normalizeOutput', () => {
  test('a markdown table row becomes one unit (cells joined), separator rows dropped', () => {
    const md = '## Quick Reference\n\n| Question | Answer |\n|---|---|\n| EpiPen? | Not needed |\n| Communion bread? | **No** |';
    expect(normalizeOutput(md).split('\n')).toEqual(['Quick Reference: Question: Answer', 'EpiPen: Not needed', 'Communion bread: No']);
  });

  test('a lead line ending in ":" is carried onto each list child (nested leads stack)', () => {
    const md = 'Leo may **only** be released to:\n- **Sara** (mom)\n- **Ruth** (grandma)\n\n- **Únicamente** pueden recoger a Mateo:\n  - Daniela (mamá)\n  - Carmen (abuela)';
    expect(normalizeOutput(md).split('\n')).toEqual([
      'Leo may only be released to: Sara (mom)',
      'Leo may only be released to: Ruth (grandma)',
      'Únicamente pueden recoger a Mateo: Daniela (mamá)',
      'Únicamente pueden recoger a Mateo: Carmen (abuela)',
    ]);
  });

  test('a list item is one unit; plain prose keeps its sentence breaks', () => {
    const md = '- Old paperwork may mention **Diastat**. **Ignore it**, Diastat is no longer used.\n\nDad can pick him up. Grandma cannot.';
    expect(normalizeOutput(md).split('\n')).toEqual(['Old paperwork may mention Diastat, Ignore it, Diastat is no longer used.', 'Dad can pick him up. Grandma cannot.']);
  });

  test('a heading prefixes the next unit; a bold full sentence is not a heading', () => {
    expect(normalizeOutput('## When to call 911\n\nCall 911 only if:\n- she falls and is hurt')).toBe('When to call 911: Call 911 only if: she falls and is hurt');
    expect(normalizeOutput('**Dad can pick him up.**\nGrandma cannot.').split('\n')).toEqual(['Dad can pick him up.', 'Grandma cannot.']);
  });

  test('decimals survive the in-item sentence join', () => {
    expect(normalizeOutput('- Give 2.5 mg. Repeat once.')).toBe('Give 2.5 mg, Repeat once.');
  });

  test('vocabulary: neither, Spanish imperative "dé", "don\'t assume"', () => {
    expect(normalizeOutput('Neither of his parents may collect him.')).toBe('not either of his parents may collect him.');
    expect(normalizeOutput('NO le dé insulina.')).toBe('NO le dar insulina.');
    expect(normalizeOutput('No debe darse por hecho que "nunca se escapa".')).toBe('no es cierto que "nunca se escapa".');
    expect(normalizeOutput("Don't assume he never runs off.")).toBe('it is not true that he never runs off.');
  });

  test('stripInline removes emphasis and code but keeps list-free text', () => {
    expect(stripInline('**NOT** allowed, _only_ `mom`, 3 * 4')).toBe('NOT allowed, only mom, 3 * 4');
  });
});

describe('normalized scoring on real keys', () => {
  test('flipped prose still fires and still misses the limiter fact (en-01)', () => {
    const s = scoreOutput(load('en-01'), 'Dad can pick him up. Grandma cannot.\n\n- Leo is allergic to eggs.');
    expect(s.trapHits.sort()).toEqual(['negated_pickup.dad', 'outgrown.egg']);
    expect(s.missing).toContain('dad_no_pickup');
  });

  test('a flip inside a bullet list under a neutral lead still fires (en-01)', () => {
    const s = scoreOutput(load('en-01'), 'Pickup:\n- Dad may pick him up\n- Grandma Ruth');
    expect(s.trapHits).toContain('negated_pickup.dad');
  });

  test('a correct markdown summary scores like the review says (en-01 list form)', () => {
    const md = "Leo may **only** be released to:\n- **Sara** (mom)\n- **Ruth** (grandma)\n\n**Leo's father is not permitted to pick him up. There is a court order.**\n\nHe bolts for the nearest door.";
    const raw = scoreOutput(load('en-01'), md, { normalize: false });
    const norm = scoreOutput(load('en-01'), md);
    expect(raw.missing).toContain('only_mom_grandma');
    expect(norm).toMatchObject({ present: 3, total: 3, trapHits: [] });
  });
});

describe('two views: structure can suppress a trap, never create one', () => {
  test('a correct bullet with two clauses does not fire a trap that neither clause fires (es-15, glm card)', () => {
    const card = 'HELPS:\n- El pescado sí está permitido; solo evitar camarón y mariscos.\n\nSAFETY:\n- tomás 8 años, alergia SEVERA a camarón y todos los mariscos.';
    expect(scoreOutput(load('es-15'), card).trapHits).toEqual([]);
  });
  test('known limit: two sentences inside ONE bullet are read together, so a flip next to a negation is masked', () => {
    // Prose keeps them apart (see "flipped prose still fires"); a single bullet does not.
    expect(scoreOutput(load('en-01'), '- Dad can pick him up. Grandma cannot.').trapHits).toEqual([]);
  });
});

describe('agreement', () => {
  test('counts agreement before and after normalization against the review', () => {
    const story = load('en-01');
    const rows = [{ system: 'b', storyId: 'en-01', text: "Leo may **only** be released to:\n- Sara\n- Ruth (grandma)\n\nHis dad is NOT allowed to pick him up. He bolts for doors." }];
    const a = agreement(rows, new Map([['en-01', story]]), { items: { 'b/en-01/only_mom_grandma': { verdict: 'scorer', note: 'list' } } }, 'fixture');
    expect(a.reviewed).toBe(1);
    expect(a.before).toEqual({ agree: 0, disagree: ['b/en-01/only_mom_grandma'] });
    expect(a.after).toEqual({ agree: 1, disagree: [] });
    expect(a.unreviewedNewFlags).toEqual([]);
  });
});
