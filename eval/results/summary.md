# Halfdoor eval results

Generated 2026-11-23 from `final.json`: 60 synthetic parent stories (35 EN, 25 ES), enclave model `e2ee-deepseek-v4-flash`, comparison model `claude-sonnet-5-5`, max 1500 output tokens, 4 requests in flight. Scoring rules: [stories/README.md](../stories/README.md). The answer key is never shown to any system.

- **Halfdoor card**: the product pipeline (name redacted, E2EE enclave model drafts a card with quotes, deterministic verifier keeps safety items as the parent's own sentences).
- **+ safety net accepted**: the same card after accepting every safety-net prompt (sentences with safety words the model left off the card).
- **Plain summary**: "Write a one-page summary of this child for the volunteer who will look after them on Sunday." with the story; same enclave model, and Claude via Venice's standard (non-E2EE) API, which is allowed only because the stories are synthetic.

## Headline (automatic scoring)

| System | Model | Safety facts kept | Limiter facts kept | Trap hits | Stories with a trap hit |
|---|---|---|---|---|---|
| Halfdoor card | `e2ee-deepseek-v4-flash` | 97.5% (153/157) | 96.7% (58/60) | 0 | 0/60 |
| Halfdoor card + safety net accepted | `e2ee-deepseek-v4-flash` | 98.1% (154/157) | 96.7% (58/60) | 0 | 0/60 |
| Plain summary, same enclave model | `e2ee-deepseek-v4-flash` | 98.1% (154/157) | 95.0% (57/60) | 5 | 5/60 |
| Plain summary, Claude Sonnet 5.5 | `claude-sonnet-5-5` | 96.8% (152/157) | 91.7% (55/60) | 5 | 5/60 |

**Read this with the adjudicated table below.** Every baseline miss and trap hit in this run is a scorer artifact: the plain summaries kept every safety fact with the right polarity, but in markdown (headings, tables, bullet lists) or wording the sentence-scoped patterns do not cover. Halfdoor's two misses are real. On this story set Halfdoor does not keep more safety facts than a plain summary; what it adds is that every safety line on the card is the parent's own sentence, located in the story, so polarity can be checked by code instead of by a reader.

## Headline after hand review

Every automatic miss and trap hit was read in context (`adjudication.json`). A miss the output does state, or a trap hit on a correct statement, is a scorer artifact and is reversed here.

| System | Safety facts kept | Trap hits | Scorer misses reversed | Scorer trap hits reversed | Not reviewed |
|---|---|---|---|---|---|
| Halfdoor card | 97.5% (153/157) | 0 | 0 | 0 | 0 |
| Halfdoor card + safety net accepted | 98.1% (154/157) | 0 | 0 | 0 | 0 |
| Plain summary, same enclave model | 100.0% (157/157) | 0 | 3 | 5 | 0 |
| Plain summary, Claude Sonnet 5.5 | 100.0% (157/157) | 0 | 5 | 5 | 0 |

## Trap hits by class

Polarity flips = outgrown allergy or stopped medicine stated as current, a barred person listed as allowed pickup, a lost "only" or "doesn't need", a double negative read backwards.

| System | Polarity flips | Wrong numbers | Sibling's condition | Total | Stories with a hit |
|---|---|---|---|---|---|
| Halfdoor card | 0 | 0 | 0 | 0 | 0/60 |
| Halfdoor card + safety net accepted | 0 | 0 | 0 | 0 | 0/60 |
| Plain summary, same enclave model | 4 | 0 | 1 | 5 | 5/60 |
| Plain summary, Claude Sonnet 5.5 | 3 | 0 | 2 | 5 | 5/60 |

## Limiter facts

Facts that only hold with their negation or limiter ("NOT allowed", "only", "no longer", "doesn't need"), scored inside one sentence.

| System | Kept | Missed |
|---|---|---|
| Halfdoor card | 96.7% (58/60) | 2 |
| Halfdoor card + safety net accepted | 96.7% (58/60) | 2 |
| Plain summary, same enclave model | 95.0% (57/60) | 3 |
| Plain summary, Claude Sonnet 5.5 | 91.7% (55/60) | 5 |

## False-positive burden (8 no-safety stories)

Stories with no safety facts at all. Anything Halfdoor puts in the safety section, or raises as a safety-net prompt, is noise a volunteer has to read.

| System | Safety items on cards | Safety-net prompts raised | Stories with any |
|---|---|---|---|
| Halfdoor card | 3 | 1 | 4/8 |
| Halfdoor card + safety net accepted | 4 | 1 | 4/8 |
| Plain summary, same enclave model | n/a | n/a | n/a |
| Plain summary, Claude Sonnet 5.5 | n/a | n/a | n/a |

What the Halfdoor items were: es-05 "No tiene ninguna condición médica." and es-11 "No tiene alergias ni medicamentos." (the parent's own all-clear, harmless on a card); es-18 "Tiene una hermanita de 3 años que también viene a la iglesia…" filed under safety (noise); and one safety-net prompt on en-33 "No medical stuff." (the lexicon matches "medic" in a negative statement). Accepting it adds that line to the card (halfdoor_net).

## Latency

Wall time per story, including the enclave attestation round trip for E2EE calls and the JSON retry when a draft does not parse. Time the harness spent waiting on Venice's per-model attestation rate limit (spacing and 429 backoff) is excluded. Halfdoor's two rows share one model call.

| System | p50 | p95 |
|---|---|---|
| Halfdoor card | 7.2 s | 20.5 s |
| Halfdoor card + safety net accepted | 7.2 s | 20.5 s |
| Plain summary, same enclave model | 19.1 s | 63.4 s |
| Plain summary, Claude Sonnet 5.5 | 6.7 s | 13.1 s |

## Cost

From the usage each response reports, at Venice list prices (`src/lib/venice/prices.ts`).

| System | Total (60 stories) | Per story |
|---|---|---|
| Halfdoor card | $0.0116 | $0.0002 |
| Halfdoor card + safety net accepted | $0.0116 | $0.0002 |
| Plain summary, same enclave model | $0.0100 | $0.0002 |
| Plain summary, Claude Sonnet 5.5 | $0.43 | $0.0072 |

## Model sweep (Halfdoor card, all stories)

Rule: 0 polarity flips and 0 trap hits first, then the highest share of facts kept, then p50 under 8 s. The latency clause is applied as a requirement (a tie-break on present rate would almost never fire), so a slower model with more facts kept can lose. Chosen: `e2ee-deepseek-v4-flash`.

| Model | Facts kept | + net | Limiter kept | Flips | Numbers | Sibling | Stories with a trap hit | p50 | p95 | Cost | No card |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **`e2ee-deepseek-v4-flash`** | 97.5% (153/157) | 98.1% | 96.7% (58/60) | 0 | 0 | 0 | 0/60 | 7.2 s | 20.5 s | $0.0116 | 1 |
| `e2ee-qwen3-6-35b-a3b` | 91.7% (144/157) | 93.6% | 95.0% (57/60) | 0 | 0 | 0 | 0/60 | 2.5 s | 5.6 s | $0.0339 | 3 |
| `e2ee-gpt-oss-120b-p` | 95.5% (150/157) | 98.1% | 95.0% (57/60) | 0 | 0 | 0 | 0/60 | 9.9 s | 16.4 s | $0.0486 | 0 |
| `e2ee-glm-5-3-flash` | 100.0% (157/157) | 100.0% | 100.0% (60/60) | 0 | 0 | 0 | 0/60 | 31.6 s | 124.7 s | $0.0897 | 0 |

All four enclave models had 0 flips and 0 trap hits on the card. `e2ee-glm-5-3-flash` kept the most facts (157/157) but had p50 31.6 s and p95 124.7 s, and 2 of its 60 first attempts hit the 180 s client timeout (es-10, es-14; the second attempt is what is scored). Read in strict order, the rule would pick it; with the latency clause as a requirement it is out, and `e2ee-deepseek-v4-flash` (153/157, p50 7.2 s) is chosen. Every "no card" in the sweep (deepseek en-32; qwen en-19, en-29, es-12) is the same pipeline issue: the draft is rejected whole when one tag or one section name is outside the schema enum.

## What went wrong

Every Halfdoor miss and trap hit in the final run, with its review.

### Halfdoor card

- **en-32** · no card (`Error: the model did not return a usable card`)
- **en-32** · missed `absence_note_time` (medical) — **real**: No card. The model returned a correct card on both attempts (all three safety items quoted) but added a tag "safety", which is not a valid tag; the schema rejects the whole draft and the parent sees an error. Pipeline bug: unknown tags should be dropped, not fatal.
- **en-32** · missed `no_911_unless_fall_or_convulsive` (medical, limiter) — **real**: Same rejected draft as absence_note_time (invalid tag "safety").
- **en-32** · missed `water_arms_reach` (other_safety, limiter) — **real**: Same rejected draft as absence_note_time (invalid tag "safety").
- **es-02** · missed `t1d` (medical) — **real**: The card lists the pump, the low and high thresholds and NO insulin, but leaves off the header line "Valentina, 8 años — diabetes tipo 1". The safety net flags that line; accepting it restores the fact (halfdoor_net keeps it).

### Halfdoor card + safety net accepted

- **en-32** · no card (`Error: the model did not return a usable card`)
- **en-32** · missed `absence_note_time` (medical) — **real**: No card to accept prompts into (same rejected draft).
- **en-32** · missed `no_911_unless_fall_or_convulsive` (medical, limiter) — **real**: No card (same rejected draft).
- **en-32** · missed `water_arms_reach` (other_safety, limiter) — **real**: No card (same rejected draft).

### Baselines (for comparison)

<details><summary>Plain summary, same enclave model: 8 misses and trap hits</summary>

- **en-14** · missed `father_no_pickup` (pickup, limiter) — **scorer artifact**: "Father (Derek): Has supervised visits only through an agency. He is NOT on the pickup list and is not permitted to take Zoe anywhere." The negation is in the next sentence, which says "He".
- **en-17** · trap `doesnt_need.epipen` (She doesn't need an EpiPen; listing one is wrong.) — **scorer artifact**: Table row "| EpiPen? | Not needed |": "|" separates sentences, so the cell "EpiPen?" stands alone. The prose also says "She does **not** need an EpiPen".
- **en-20** · trap `cancelled_med.diastat` (Diastat is no longer used.) — **scorer artifact**: "Old paperwork may mention **Diastat**. **Ignore it—Diastat is no longer used.**" The qualifier is in the next sentence.
- **en-23** · trap `sibling.diabetes` (Diabetes and glucose tabs are her brother Sam's; Nora is not diabetic.) — **scorer artifact**: "You may also find **glucose tabs** in the bag. **These are NOT for Nora** — they belong to her brother Sam. She is **not diabetic**". The qualifier is in the next sentence.
- **en-32** · trap `doesnt_need.911_for_absence` (She does NOT need 911 for absence seizures; only for a fall with injury or a convulsive seizure.) — **scorer artifact**: Quick-reference table: "| Staring spell (10–20 sec) | Note the time; tell parent at pickup. No 911. |" and "| Falls and gets hurt | Call 911. |"; table cells split the sentence.
- **en-34** · missed `parents_no_pickup` (pickup, limiter) — **scorer artifact**: "NOT AUTHORIZED FOR PICKUP OR VISITATION:" followed by bullet lines "Elias's Mother" / "Elias's Father"; the negation and the names are on different lines.
- **es-24** · missed `parents_no_pickup` (pickup, limiter) — **scorer artifact**: "Neither of his parents may collect him, even if they arrive with paperwork." "Neither" is not in the negation word list.
- **es-24** · trap `negated_pickup.parents` (Ni el papá ni la mamá pueden recogerlo.) — **scorer artifact**: "Neither of his parents may collect him" is the correct claim; "neither" is not in the trap's qualifier list.

</details>

<details><summary>Plain summary, Claude Sonnet 5.5: 10 misses and trap hits</summary>

- **en-01** · missed `only_mom_grandma` (pickup, limiter) — **scorer artifact**: "Leo may **only** be released to:" followed by bullets "Sara (mom)" / "Ruth (grandma)"; "only" and the names are on different lines.
- **en-13** · trap `cancelled_med.singulair` (Singulair was stopped in September.) — **scorer artifact**: "**Not currently taking:** Singulair. His family stopped it in September, so please disregard any older forms that list it." "Not currently" is not in the trap's qualifier list; "stopped" is in the next sentence.
- **en-23** · trap `sibling.diabetes` (Diabetes and glucose tabs are her brother Sam's; Nora is not diabetic.) — **scorer artifact**: Heading "## Please Note: Glucose Tablets" followed by "These belong to her brother Sam. Nora is not diabetic. Please do not give them to her."
- **en-32** · trap `doesnt_need.911_for_absence` (She does NOT need 911 for absence seizures; only for a fall with injury or a convulsive seizure.) — **scorer artifact**: Heading "## When to call 911", then "Call 911 only if:" followed by bullets "Emma falls and is injured, or" / "She has a full convulsive seizure", then "A staring spell on its own does not need 911." The heading line stands alone as a sentence.
- **en-34** · missed `parents_no_pickup` (pickup, limiter) — **scorer artifact**: "No one else may pick Elias up or visit him at church. This includes:" followed by bullets "Elias's mother" / "Elias's father".
- **es-01** · missed `only_mom_grandma` (pickup, limiter) — **scorer artifact**: Heading "Autorización de recogida: solo dos personas", then "Únicamente pueden recoger a Mateo:" followed by bullets "Daniela (mamá)" / "Carmen (abuela)"; the limiter and the names are on different lines.
- **es-02** · missed `no_insulin` (medication, limiter) — **scorer artifact**: "NO le dé insulina." The pattern's verbs are dar/darle/give/administer/poner, not the imperative "dé".
- **es-07** · missed `only_rosa_marta` (pickup, limiter) — **scorer artifact**: "Solo pueden recogerlo:" followed by a numbered list "Rosa, su abuela" / "Marta, su tía", plus "Si llega alguien más que no sea Rosa o Marta, no entregue al niño".
- **es-17** · trap `double_negation.never_escapes` ("No es cierto que nunca se escape": SÍ se escapa.) — **scorer artifact**: Says “Benja se ha escapado en dos ocasiones” and then “No debe darse por hecho que "nunca se escapa"” (do not assume he never runs off): the correct reading.
- **es-19** · trap `sibling.asthma` (El asma y el inhalador son de su gemelo Lucas.) — **scorer artifact**: Summary table row "| Asma | NO. El inhalador es de Lucas |"; the cell "Asma" stands alone.

</details>
