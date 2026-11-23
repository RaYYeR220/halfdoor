# Halfdoor eval stories

60 synthetic parent stories (35 English, 25 Spanish) with a hidden answer key. They measure whether a system that turns a parent's free-text description into a buddy card keeps every **safety fact**, with the right polarity, compared with a plain LLM summary.

The answer key (`facts`, `traps`) is never shown to any system under test. Only `text` goes in.

## File shape

Each `en-NN.json` / `es-NN.json` is an `EvalStory` (see `../types.ts`):

```ts
type KeyFact = { id; kind: 'allergy'|'medical'|'medication'|'pickup'|'wandering'|'other_safety'; must: string[][]; limiter: boolean }
type Trap    = { id; pattern; why }
type EvalStory = { id; lang: 'en'|'es'; text; facts: KeyFact[]; traps: Trap[]; tags: Tag[] }
```

## Scoring rules

- Compile every pattern with flags `iu` (they also compile with `i` alone).
- **Fact present**: every OR-group in `must` has at least one alternative that matches somewhere in the system output (card text or summary). Groups accept EN or ES wording for every story, so an English summary of a Spanish story can still score.
- **`limiter: true`**: the fact only holds with its negation or limiter (NOT allowed, only, no longer, doesn't need, only if cold...). For these, the negation and the subject are tied inside one sentence with a proximity pattern, so "Dad can pick up. Grandma cannot." does not count as "Dad cannot pick up".
- **Trap hit**: the pattern matches the output. A trap is a wrong claim a careless summary makes. Most traps are sentence-scoped: they fire on a sentence that states the claim and does **not** contain a qualifier (negation, "used to", "outgrew", the sibling's name...). Sentence separators are `. ! ? ; • |` and newline.
- Suggested metrics: fact recall overall and on `limiter` facts, trap-hit rate per story, and for the 8 no-safety stories the number of safety items/prompts the system invents (false-positive burden).

## Content rules

- Fully synthetic. First names only, no real churches, no real people.
- Ages 2–12. Conditions: autism, ADHD, Down syndrome, anxiety, selective mutism, cerebral palsy, spina bifida, type 1 diabetes, epilepsy (incl. VNS, absence), severe food allergies (peanut, tree nut, sesame, egg, milk, shellfish), celiac, asthma, hearing loss / cochlear implants, AAC users, wheelchair users, g-tube, pica, foster and kinship care with court-ordered pickup restrictions.
- Voices: rushed phone text, long emotional paragraph, bullet lists, typos, run-ons, formal foster/kinship notes. Five Spanish stories code-switch EN/ES: es-03, es-09, es-14, es-20, es-25.
- Story length 253–577 characters (rule: 60–900).
- Safety stories carry 2–4 facts (rule: 2–5). 157 facts in total, 60 of them `limiter`.
- Facts by kind: pickup 31, other_safety 37, medical 31, medication 29, wandering 15, allergy 14.

## No-safety stories (false-positive burden)

`facts: []` and `traps: []`: en-08, en-16, en-24, en-33, es-05, es-11, es-18, es-23. Any safety item a system adds for these is noise.

## Traps by type

Trap ids are `<type>.<slug>`. 94 traps across 51 stories (rule: at least 40 stories).

| Type | Traps | Stories | What the wrong claim looks like |
|---|---|---|---|
| `outgrown` | 13 | 13 | outgrown allergy, removed tube, old custody flag, former runner stated as current |
| `negated_pickup` | 11 | 11 | a person who may NOT pick up is listed or described as allowed |
| `only_may` | 6 | 6 | "only X may" or "only if cold" loses its limiter |
| `number` | 24 | 18 | wrong threshold, dose, puff count, minutes or interval (stories carry competing numbers) |
| `doesnt_need` | 19 | 17 | "doesn't need X" flipped to "needs X" (help, EpiPen, insulin, helmet, 911...) |
| `double_negation` | 6 | 6 | "it's not that he can't" / "I wouldn't say he never" read the wrong way |
| `sibling` | 6 | 6 | a sibling's allergy, seizures, diabetes or asthma attributed to the child |
| `cancelled_med` | 9 | 9 | a stopped medication listed as current |

## Validation

`pnpm eval:validate` (`../validate.ts`) checks shape, compiles every regex, asserts every `must` OR-group matches the story's own text, asserts no trap matches the story's own text (the parent never makes the wrong claim), and checks the set-level counts. It prints `60 stories OK` or the failures; `--stats` adds counts.

Keys were also probed with hand-written careful summaries (must hit every fact, no trap) and flipped summaries (must fire a trap), in both languages, markdown/card and prose styles.
