import { describe, expect, test } from 'vitest';
import { CLAUDE_MODEL, PLAIN_USER, SHORT_USER, SYSTEM_IDS, childNameFor, modelFor } from '../../eval/systems';

describe('eval systems', () => {
  test('six systems; both Claude baselines use the Claude model, the rest the enclave model', () => {
    expect(SYSTEM_IDS).toEqual(['halfdoor', 'halfdoor_net', 'baseline_same', 'baseline_claude', 'baseline_same_short', 'baseline_claude_short']);
    expect(modelFor('baseline_claude', 'e2ee-x')).toBe(CLAUDE_MODEL);
    expect(modelFor('baseline_claude_short', 'e2ee-x')).toBe(CLAUDE_MODEL);
    expect(modelFor('baseline_same_short', 'e2ee-x')).toBe('e2ee-x');
    expect(modelFor('halfdoor', 'e2ee-x')).toBe('e2ee-x');
  });
  test('the two baseline prompts', () => {
    expect(PLAIN_USER).toContain('one-page summary');
    expect(SHORT_USER).toBe("Write a short card (under 100 words) about this child for the volunteer who will look after them on Sunday. Keep the parent's language.");
  });
  test('child name: the first word followed by an age, in either language, any case', () => {
    expect(childNameFor("Leo is 6 and he's autistic.")).toBe('Leo');
    expect(childNameFor('hi sry typing fast. jonah is 4, has epilepsy.')).toBe('Jonah');
    expect(childNameFor("hello this is Zoe's grandma (Nana Pat), I have custody of Zoe she is 4 years old.")).toBe('Zoe');
    expect(childNameFor("I'm Ruby's aunt Keisha, Ruby (6) lives with me now.")).toBe('Ruby');
    expect(childNameFor('Soy Rosa, la abuela de Emiliano (6 años).')).toBe('Emiliano');
    expect(childNameFor('Ella - age 3 / allergys: SESAME only')).toBe('Ella');
    expect(childNameFor('No age given here at all.')).toBe('');
  });
});
