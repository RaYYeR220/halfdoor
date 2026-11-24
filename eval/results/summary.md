# Halfdoor eval results

Generated 2026-11-23 from `final.json`: 60 synthetic parent stories (35 EN, 25 ES) with a hidden answer key, enclave model `e2ee-deepseek-v4-flash`, comparison model `claude-sonnet-5-5`, max 1500 output tokens. Every system sees only the story text. Key and rules: [stories/README.md](../stories/README.md).

- **Halfdoor card**: the product pipeline. The child's name is redacted, an E2EE enclave model drafts a card with quotes, and a deterministic verifier keeps every safety item as the parent's own sentence.
- **+ safety net accepted**: the same card after accepting every safety-net prompt (story sentences with safety words that the model left off the card).
- **Plain summary**: "Write a one-page summary of this child for the volunteer who will look after them on Sunday." plus the story, sent to the same enclave model, and to Claude through Venice's standard (non-E2EE) API, which is allowed only because the stories are synthetic.
- **Short card prompt**: "Write a short card (under 100 words) about this child for the volunteer who will look after them on Sunday. Keep the parent's language." plus the story, to the same two models, so the comparison is not won by the word "one-page".

## Bottom line

- **Safety facts: a plain summary is as good as Halfdoor.** Halfdoor card 99.4% (156/157), with the safety net accepted 100.0% (157/157); baselines 100.0% (157/157) (one-page, same model), 100.0% (157/157) (one-page, Claude), 98.7% (155/157) (short card, same model), 100.0% (157/157) (short card, Claude).
- **Wrong claims:** Halfdoor 0 trap hits; baselines 1 (one-page, same model), 1 (one-page, Claude), 1 (short card, same model), 1 (short card, Claude). Of the 4 baseline trap hits in this run, 4 are reviewed scorer artifacts (the output says the right thing; appendix A), 0 real.
- **Halfdoor's grounding numbers are expected by construction.** Its 0.05 sentences per card not grounded in the story and its 0 unsaid diagnosis labels follow from the design: the verifier drops any item it cannot point to in the story (a quote it cannot find, a paraphrase sharing no word with its quote, a diagnosis the parent did not use). That row shows the verifier works; it is not an independent finding.
- **Length follows the prompt.** Asked for a one-page summary, the baselines write 258 words with 10.2 ungrounded sentences (one-page, same model) and 291 words with 11.6 ungrounded sentences (one-page, Claude); asked for a short card, 75 words with 0.3 ungrounded sentences (short card, same model) and 86 words with 0.7 ungrounded sentences (short card, Claude). A Halfdoor card is 92 words. With the short prompt a plain model gets close to the card on length and grounding; what stays different is that Halfdoor guarantees it by construction (every safety line is the parent's located sentence, nothing unlocated survives) and runs in the enclave, where a prompt only makes it likely.

## Safety facts and wrong claims (automatic scoring)

| System | Model | Safety facts kept | Limiter facts kept | Trap hits (flips / numbers / sibling) | Stories with a trap hit |
|---|---|---|---|---|---|
| Halfdoor card | `e2ee-deepseek-v4-flash` | 99.4% (156/157) | 100.0% (60/60) | 0 (0 / 0 / 0) | 0/60 |
| Halfdoor card + safety net accepted | `e2ee-deepseek-v4-flash` | 100.0% (157/157) | 100.0% (60/60) | 0 (0 / 0 / 0) | 0/60 |
| Plain summary, same enclave model | `e2ee-deepseek-v4-flash` | 100.0% (157/157) | 100.0% (60/60) | 1 (1 / 0 / 0) | 1/60 |
| Plain summary, Claude Sonnet 5.5 | `claude-sonnet-5-5` | 100.0% (157/157) | 100.0% (60/60) | 1 (0 / 0 / 1) | 1/60 |
| Short card prompt, same enclave model | `e2ee-deepseek-v4-flash` | 98.7% (155/157) | 98.3% (59/60) | 1 (0 / 0 / 1) | 1/60 |
| Short card prompt, Claude Sonnet 5.5 | `claude-sonnet-5-5` | 100.0% (157/157) | 100.0% (60/60) | 1 (0 / 0 / 1) | 1/60 |

Outputs are read through a markdown-aware normalizer before the key is applied (`eval/normalize.ts`): headings, table rows, list items and "Only these people:" leads become units the sentence-scoped patterns can read; a trap counts only if it fires both with and without that structure. Against a hand review of every flag in the first run, the scorer agrees on 23/25 items (the README rules read raw agreed on 7/25). That agreement is in-sample: the normalizer was written while looking at those same items. Details in appendix A.

## Provenance: what each output adds

| System | Sentences not grounded in the story, per output | Outputs with any | Unsaid diagnosis labels: exact word / label family | Words, mean / median | Reading time at 200 wpm, mean / median |
|---|---|---|---|---|---|
| Halfdoor card | 0.05 (of 5.8 sentences) | 3/58 (2 not scored) | 0 / 0 outputs | 92 / 74 | 27.8 s / 22.0 s |
| Halfdoor card + safety net accepted | 0.05 (of 5.9 sentences) | 3/58 (2 not scored) | 0 / 0 outputs | 93 / 76 | 27.9 s / 23.0 s |
| Plain summary, same enclave model | 10.24 (of 21.8 sentences) | 33/33 (27 not scored) | 13 / 0 outputs | 258 / 225 | 77.3 s / 68.0 s |
| Plain summary, Claude Sonnet 5.5 | 11.60 (of 21.4 sentences) | 52/52 (8 not scored) | 3 / 0 outputs | 291 / 292 | 87.4 s / 88.0 s |
| Short card prompt, same enclave model | 0.25 (of 5.8 sentences) | 13/51 (9 not scored) | 5 / 0 outputs | 75 / 75 | 22.4 s / 23.0 s |
| Short card prompt, Claude Sonnet 5.5 | 0.72 (of 7.0 sentences) | 28/54 (6 not scored) | 1 / 0 outputs | 86 / 86 | 25.9 s / 26.0 s |

- **Halfdoor's row is by construction.** The verifier only keeps what it can point to in the story and blocks diagnosis words the parent did not use, so near-zero here is the design working, not a separate result. The comparison that matters is between the baselines, and between a baseline and what the parent wrote.
- **Not grounded**: a sentence counts as grounded when at least 33% of its content words (4+ letters, not stopwords, compared by 5-letter prefix) also occur in the story. Lines of 4 words or fewer are ignored, and so are title and heading lines, which name the card or a section and claim nothing: a markdown heading, a bold-only heading line, a first line with no closing punctuation, and a line with no closing punctuation that has the child's name with an age or "card", "volunteer", "Sunday" (or the Spanish "tarjeta", "nota", "voluntario", "domingo"). Hand check on fresh random samples (appendix B): on the short cards, 13/15 flagged sentences really add something the parent did not write and 14/15 passed sentences really are grounded; on the one-page summaries (round 2, judged before title lines were skipped) 17/20 flagged and 14/20 passed; 3 of its flagged sentences are title lines the current rule skips, and without them 14/17 flagged sentences really add something. The errors go both ways (a translation or a close paraphrase gets flagged; an added instruction tacked onto a story sentence passes), so read the counts as approximate, not as a lower or upper bound.
- **Rule change after the run (2026-11-24).** Support rule v3: title and heading lines no longer count as unsupported sentences (markdown headings, bold-only heading lines, a first line without terminal punctuation, and a line without terminal punctuation that has the child's name with an age or a card/volunteer/Sunday word). Same cached outputs, no model call. Every output was re-scored from the cached model outputs (`eval/rescore.ts`); safety facts and trap hits did not change. Outputs with a sentence not grounded, before → after: Halfdoor card 3/58 → 3/58 (0.05 → 0.05 per output); Halfdoor card + safety net accepted 3/58 → 3/58 (0.05 → 0.05 per output); Plain summary, same enclave model 33/33 → 33/33 (11.61 → 10.24 per output); Plain summary, Claude Sonnet 5.5 52/52 → 52/52 (12.48 → 11.60 per output); Short card prompt, same enclave model 23/51 → 13/51 (0.51 → 0.25 per output); Short card prompt, Claude Sonnet 5.5 29/54 → 28/54 (0.80 → 0.72 per output). The earlier rule counted a card's title ("Ethan, age 10 — Sunday Volunteer Card") as a sentence the parent never said, which inflated the short-card baselines most.
- **Not scored for grounding**: an output whose detected language (a stopword heuristic) differs from its story's is skipped, because word overlap cannot see a translation. The one-page same-model summary answered all 25 Spanish stories in English. The detector also disagrees on some stories in either language, for every system (short or mixed text can come out as neither language, and code-switched stories can read as English). Skipped per system: Halfdoor card: 2 (2 detector mismatches); Halfdoor card + safety net accepted: 2 (2 detector mismatches); Plain summary, same enclave model: 27 (25 Spanish stories answered in English, 2 detector mismatches); Plain summary, Claude Sonnet 5.5: 8 (6 Spanish stories answered in English, 2 detector mismatches); Short card prompt, same enclave model: 9 (7 Spanish stories answered in English, 2 detector mismatches); Short card prompt, Claude Sonnet 5.5: 6 (2 Spanish stories answered in English, 4 detector mismatches).
- **Unsaid labels**: diagnosis words (autism, ADHD, Down syndrome…) the story does not contain. "Exact word" is the check the product verifier applies; "label family" also accepts another form of the same diagnosis (autistic for autism, autismo for autism, the parent's lowercase "adhd", "CP").

Every Halfdoor sentence flagged as not grounded:

- en-22: "include him naturally with the group."
- en-25: "support her mobility as needed."
- es-20: "No la levanten, lo odia."

Flagged sentences from each baseline, three per system, chosen at random (seeded, at least 6 words, at most one per story):

- Plain summary, same enclave model:
  - en-09: "Avoid talking while turned away or from another room."
  - en-24: "Saying Goodbye: Sam might cry at drop-off for a minute or two."
  - en-12: "She simply cannot speak outside our home yet."
- Plain summary, Claude Sonnet 5.5:
  - es-10: "Gracias por cuidar de Renata con paciencia y cariño."
  - en-35: "Talking about cats, cat crafts, cat stories, or drawing cats is a great way to connect with her and help her feel comfortable."
  - es-05: "Dale un ratito de espacio sin presionarlo."
- Short card prompt, same enclave model:
  - en-23: "😊 Thanks for caring for her!"
  - en-34: "Thank you for caring for him!"
  - es-09: "Puede repetir después de 20 min."
- Short card prompt, Claude Sonnet 5.5:
  - en-01: "A quieter spot or a break will help."
  - en-21: "One suggestion: you may want to give the card to your volunteer lead rather than leaving it where others can see it, since it includes the protective order details."
  - en-33: "Thanks for loving on him this Sunday!"

## What went wrong

- **On safety-fact recall a plain summary is as good as Halfdoor.** The baselines keep nearly every safety fact with the right polarity on these stories (157/157 (one-page, same model), 157/157 (one-page, Claude), 155/157 (short card, same model), 157/157 (short card, Claude); the 2 automatic baseline misses are all reviewed scorer artifacts); the Halfdoor card has 1 missed fact in 1 story (no missed fact once the safety net is accepted). Halfdoor's case rests on provenance, privacy and a fixed card shape, not on recall.
- Halfdoor card:
  - **es-02** · missed `t1d` (medical) — **real**: The card lists the pump, the low and high thresholds and NO insulin, but leaves off the header line "Valentina, 8 años — diabetes tipo 1". The safety net flags that line; accepting it restores the fact (halfdoor_net keeps it).
- **Noise on the 8 stories with no safety facts:** the card put 3 items in its safety section and the safety net raised 1 prompt, on 4 of 8 stories. What the Halfdoor items were: es-05 "No tiene ninguna condición médica." and es-11 "No tiene alergias ni medicamentos." (the parent's own all-clear, harmless on a card); es-18 "Tiene una hermanita de 3 años que también viene a la iglesia…" filed under safety (noise); and one safety-net prompt on en-33 "No medical stuff." (the lexicon matches "medic" in a negative statement). Accepting it adds that line to the card (halfdoor_net).
- **Pipeline faults this eval found (fixed):** the first run lost en-32 entirely because the model added one tag outside the schema ("safety") and the whole draft was rejected; the same rule cost the qwen model three cards in the sweep. Items and tags are now validated one by one (bad ones dropped, recorded as invalid_shape), and a draft with no usable item (en-09 came back as a skeleton of empty items once) is retried. Verbatim safety lines no longer keep the parent's list marker ("- - …").
- **Latency** for Halfdoor covers the model calls only (attestation, the enclave call, and the JSON retry when a draft does not parse), not local verification or rendering, which take milliseconds. It excludes time the harness spent waiting on Venice's per-model attestation rate limit.
- **One sample per story and system.** Model output varies between runs; a single re-run can move a story in or out of the miss list.

## Details

### Limiter facts and false-positive burden

| System | Limiter facts kept | Safety items on no-safety stories | Safety-net prompts on no-safety stories |
|---|---|---|---|
| Halfdoor card | 100.0% (60/60) | 3 | 1 |
| Halfdoor card + safety net accepted | 100.0% (60/60) | 4 | 1 |
| Plain summary, same enclave model | 100.0% (60/60) | n/a | n/a |
| Plain summary, Claude Sonnet 5.5 | 100.0% (60/60) | n/a | n/a |
| Short card prompt, same enclave model | 98.3% (59/60) | n/a | n/a |
| Short card prompt, Claude Sonnet 5.5 | 100.0% (60/60) | n/a | n/a |

### Latency and cost

| System | p50 | p95 | Cost, 60 stories | Cost per story |
|---|---|---|---|---|
| Halfdoor card | 7.1 s | 20.5 s | $0.0114 | $0.0002 |
| Halfdoor card + safety net accepted | 7.1 s | 20.5 s | $0.0114 | $0.0002 |
| Plain summary, same enclave model | 19.1 s | 63.4 s | $0.0100 | $0.0002 |
| Plain summary, Claude Sonnet 5.5 | 6.7 s | 13.1 s | $0.43 | $0.0072 |
| Short card prompt, same enclave model | 4.4 s | 10.8 s | $0.0041 | $0.0001 |
| Short card prompt, Claude Sonnet 5.5 | 2.6 s | 3.5 s | $0.15 | $0.0024 |

Cost from the usage each response reports, at Venice list prices (`src/lib/venice/prices.ts`). The two Halfdoor rows share one model call per story.

### Model sweep (Halfdoor card, all stories)

Rule: 0 polarity flips and 0 trap hits first, then the highest share of facts kept, then p50 under 8 s; the latency clause is applied as a requirement (as a tie-break on present rate it would almost never fire). Chosen: `e2ee-deepseek-v4-flash`.

| Model | Facts kept | + net | Limiter kept | Trap hits (flips / numbers / sibling) | p50 | p95 | Cost | No card |
|---|---|---|---|---|---|---|---|---|
| **`e2ee-deepseek-v4-flash`** | 99.4% (156/157) | 100.0% | 100.0% (60/60) | 0 (0 / 0 / 0) | 7.1 s | 20.5 s | $0.0114 | 0 |
| `e2ee-qwen3-6-35b-a3b` | 94.9% (149/157) | 98.1% | 96.7% (58/60) | 0 (0 / 0 / 0) | 2.5 s | 3.9 s | $0.0290 | 0 |
| `e2ee-gpt-oss-120b-p` | 95.5% (150/157) | 98.1% | 95.0% (57/60) | 0 (0 / 0 / 0) | 9.9 s | 16.4 s | $0.0486 | 0 |
| `e2ee-glm-5-3-flash` | 100.0% (157/157) | 100.0% | 100.0% (60/60) | 0 (0 / 0 / 0) | 31.6 s | 124.7 s | $0.0885 | 0 |

All four enclave models had 0 flips and 0 trap hits on the card. `e2ee-glm-5-3-flash` keeps the most facts but its p50 is over 30 s and its p95 about two minutes, and 2 of its 60 first attempts hit the 180 s client timeout (es-10, es-14; the scored rows are the second attempt). Read in strict order the rule would pick it; with the latency clause as a requirement it is out.

## Appendix A: scorer validation

Every miss and trap hit the automatic scorer raised in the first run (`b277f60:eval/results/final.json`, before the round-1 fixes) was read in context and marked real or scorer artifact (`adjudication.json`). Agreement with that review: **7/25** with the README rules read raw, **23/25** with the markdown-aware scorer, which raised no new flag on those outputs. This is in-sample: the normalizer was built while reading these items.

Out of sample, on the short-card baselines added after the normalizer was written, the scorer raised 4 flags: 0 real, 4 scorer artifacts (a qualifier after a semicolon or in the next prose sentence, a wording the key does not list). Read the baselines' automatic misses and trap hits as upper bounds.

| System | Facts kept, raw README rules | Facts kept, normalized | Trap hits, raw | Trap hits, normalized |
|---|---|---|---|---|
| Halfdoor card | 156/157 | 156/157 | 0 | 0 |
| Halfdoor card + safety net accepted | 157/157 | 157/157 | 0 | 0 |
| Plain summary, same enclave model | 154/157 | 157/157 | 5 | 1 |
| Plain summary, Claude Sonnet 5.5 | 152/157 | 157/157 | 5 | 1 |
| Short card prompt, same enclave model | 154/157 | 155/157 | 1 | 1 |
| Short card prompt, Claude Sonnet 5.5 | 157/157 | 157/157 | 1 | 1 |

Halfdoor's scores are identical under the raw README rules and the normalized scorer (its card is short labelled lines, one item each), so the known limit of the normalizer (two sentences inside one bullet are read together, which can mask a flip) does not touch its numbers.

Remaining disagreements (both make a plain summary look worse than it is):

- `baseline_claude/en-23/sibling.diabetes`: Heading "## Please Note: Glucose Tablets" followed by "These belong to her brother Sam. Nora is not diabetic. Please do not give them to her."
- `baseline_same/en-32/doesnt_need.911_for_absence`: Quick-reference table: "| Staring spell (10–20 sec) | Note the time; tell parent at pickup. No 911. |" and "| Falls and gets hurt | Call 911. |"; table cells split the sentence.

Both are left as they are. The en-32 table row ("Falls and gets hurt | Call 911") would have to be read as "if … then …", which is not true of tables in general; en-23 has the qualifier in the next prose sentence ("These belong to her brother Sam"), and joining prose sentences would hide real flips such as "Dad can pick him up. Grandma cannot."

<details><summary>All reviewed items</summary>

- `halfdoor/en-32/absence_note_time` — **real**: No card. The model returned a correct card on both attempts (all three safety items quoted) but added a tag "safety", which is not a valid tag; the schema rejects the whole draft and the parent sees an error. Pipeline bug: unknown tags should be dropped, not fatal. (Fixed in round 1: tolerant draft parsing.)
- `halfdoor/en-32/no_911_unless_fall_or_convulsive` — **real**: Same rejected draft as absence_note_time (invalid tag "safety").
- `halfdoor/en-32/water_arms_reach` — **real**: Same rejected draft as absence_note_time (invalid tag "safety").
- `halfdoor_net/en-32/absence_note_time` — **real**: No card to accept prompts into (same rejected draft). (Fixed in round 1: tolerant draft parsing.)
- `halfdoor_net/en-32/no_911_unless_fall_or_convulsive` — **real**: No card (same rejected draft).
- `halfdoor_net/en-32/water_arms_reach` — **real**: No card (same rejected draft).
- `halfdoor/es-02/t1d` — **real**: The card lists the pump, the low and high thresholds and NO insulin, but leaves off the header line "Valentina, 8 años — diabetes tipo 1". The safety net flags that line; accepting it restores the fact (halfdoor_net keeps it).
- `baseline_same/en-14/father_no_pickup` — **scorer**: "Father (Derek): Has supervised visits only through an agency. He is NOT on the pickup list and is not permitted to take Zoe anywhere." The negation is in the next sentence, which says "He".
- `baseline_same/en-34/parents_no_pickup` — **scorer**: "NOT AUTHORIZED FOR PICKUP OR VISITATION:" followed by bullet lines "Elias's Mother" / "Elias's Father"; the negation and the names are on different lines.
- `baseline_same/es-24/parents_no_pickup` — **scorer**: "Neither of his parents may collect him, even if they arrive with paperwork." "Neither" is not in the negation word list.
- `baseline_claude/en-01/only_mom_grandma` — **scorer**: "Leo may **only** be released to:" followed by bullets "Sara (mom)" / "Ruth (grandma)"; "only" and the names are on different lines.
- `baseline_claude/en-34/parents_no_pickup` — **scorer**: "No one else may pick Elias up or visit him at church. This includes:" followed by bullets "Elias's mother" / "Elias's father".
- `baseline_claude/es-01/only_mom_grandma` — **scorer**: Heading "Autorización de recogida: solo dos personas", then "Únicamente pueden recoger a Mateo:" followed by bullets "Daniela (mamá)" / "Carmen (abuela)"; the limiter and the names are on different lines.
- `baseline_claude/es-02/no_insulin` — **scorer**: "NO le dé insulina." The pattern's verbs are dar/darle/give/administer/poner, not the imperative "dé".
- `baseline_claude/es-07/only_rosa_marta` — **scorer**: "Solo pueden recogerlo:" followed by a numbered list "Rosa, su abuela" / "Marta, su tía", plus "Si llega alguien más que no sea Rosa o Marta, no entregue al niño".
- `baseline_same/en-17/doesnt_need.epipen` — **scorer**: Table row "| EpiPen? | Not needed |": "|" separates sentences, so the cell "EpiPen?" stands alone. The prose also says "She does **not** need an EpiPen".
- `baseline_same/en-20/cancelled_med.diastat` — **scorer**: "Old paperwork may mention **Diastat**. **Ignore it—Diastat is no longer used.**" The qualifier is in the next sentence.
- `baseline_same/en-23/sibling.diabetes` — **scorer**: "You may also find **glucose tabs** in the bag. **These are NOT for Nora** — they belong to her brother Sam. She is **not diabetic**". The qualifier is in the next sentence.
- `baseline_same/en-32/doesnt_need.911_for_absence` — **scorer**: Quick-reference table: "| Staring spell (10–20 sec) | Note the time; tell parent at pickup. No 911. |" and "| Falls and gets hurt | Call 911. |"; table cells split the sentence.
- `baseline_same/es-24/negated_pickup.parents` — **scorer**: "Neither of his parents may collect him" is the correct claim; "neither" is not in the trap's qualifier list.
- `baseline_claude/en-13/cancelled_med.singulair` — **scorer**: "**Not currently taking:** Singulair. His family stopped it in September, so please disregard any older forms that list it." "Not currently" is not in the trap's qualifier list; "stopped" is in the next sentence.
- `baseline_claude/en-23/sibling.diabetes` — **scorer**: Heading "## Please Note: Glucose Tablets" followed by "These belong to her brother Sam. Nora is not diabetic. Please do not give them to her."
- `baseline_claude/en-32/doesnt_need.911_for_absence` — **scorer**: Heading "## When to call 911", then "Call 911 only if:" followed by bullets "Emma falls and is injured, or" / "She has a full convulsive seizure", then "A staring spell on its own does not need 911." The heading line stands alone as a sentence.
- `baseline_claude/es-17/double_negation.never_escapes` — **scorer**: Says “Benja se ha escapado en dos ocasiones” and then “No debe darse por hecho que "nunca se escapa"” (do not assume he never runs off): the correct reading.
- `baseline_claude/es-19/sibling.asthma` — **scorer**: Summary table row "| Asma | NO. El inhalador es de Lucas |"; the cell "Asma" stands alone.
- `baseline_same_short/en-23/sibling.diabetes` — **scorer**: "You may find glucose tabs in her bag; those are her brother Sam's. Nora is not diabetic — please don't give them to her." The qualifier is after the ";", which splits the sentence.
- `baseline_claude_short/en-23/sibling.diabetes` — **scorer**: "You may find glucose tabs in that bag too. Those are her brother Sam's. Nora is not diabetic, so please don't give them to her." The qualifier is in the next prose sentence.
- `baseline_same_short/es-10/headcount_visual` — **scorer**: "In an emergency she will not shout or answer if called, so please keep her in sight at all times." Same safety point as "cuéntenla con la vista" (check her by sight, do not rely on calling her); "sight" is not in the key's word list. (The card is in English although the prompt asked for the parent's language.)
- `baseline_same_short/es-24/uncle_raul_can` — **scorer**: "Solo su abuela y su tío Raúl (autorizado desde octubre) pueden recogerlo." Correct; the key's list has "ya sí / sí puede / ya puede / en la lista" but not "autorizado" or "pueden".

</details>

## Appendix B: grounding-rule validation

Each check draws random sentences the rule flags as not grounded and as many it passes (seeded, `eval/support-sample.ts`), judged by hand against the story (grounded = the story states, or translates to, everything the sentence claims; boilerplate, template text and added advice are not grounded).

| Check | Drawn from | Rule | Seed | Flagged that really add something | Passed that really are grounded |
|---|---|---|---|---|---|
| Round 1 | one-page summaries | supported if >= 50% of content words (4+ letters, not stopwords, 5-char prefix) occur in the story | 2026 | 12/20 (60.0%) | 17/20 (85.0%) |
| Round 2 | one-page summaries | supported if >= 33% of content words (4+ letters, not stopwords, 5-char prefix) occur in the story; sentences of <= 4 words ignored; outputs in another language than the story not scored | 2027 | 17/20 (85.0%) | 14/20 (70.0%) |
| Short cards | short-card baselines | supported if >= 33% of content words (4+ letters, not stopwords, 5-char prefix) occur in the story; sentences of <= 4 words ignored; title and heading lines ignored; outputs in another language than the story not scored | 2028 | 13/15 (86.7%) | 14/15 (93.3%) |

Round 1 missed the 80% target: its false flags were translations, close paraphrases and short label lines. The rule was revised once (language check, one-third threshold, short lines ignored) and checked again on a fresh sample (round 2). Rounds 1 and 2 judged title lines ("Sunday Care Summary — Jonah (age 4)") as not grounded, so they counted toward precision. Title lines are not claims, and the short cards open with one, so the rule was revised again to skip them (v3, see "Rule change after the run" above) and checked on a fresh sample drawn from the short-card baselines only, under v3. That check is the one the public short-card numbers cite.

<details><summary>Round 1 judgments</summary>

- unsupported, grounded · baseline_same · es-15 · "Sitting apart makes him feel bad/left out." — Translation of "NO necesita sentarse en mesa aparte, eso lo hace sentir mal" (English answer to a Spanish story).
- unsupported, not grounded · baseline_claude · es-20 · "Make sure walkways and the classroom have clear space for her wheelchair to move around." — Added advice; the story says nothing about walkways or room layout.
- unsupported, grounded · baseline_claude · en-27 · "No other action needed." — Restates "Above 250 just text me" (the "just").
- unsupported, not grounded · baseline_same · es-16 · "Confidential – Please Read Before Sunday" — Boilerplate header, not from the story.
- unsupported, grounded · baseline_same · en-08 · "She will likely hang on to her parent at the door for a few minutes." — Paraphrase of "will probably hang on to me at the door for a bit".
- unsupported, not grounded · baseline_same · es-10 · "Don't single her out in front of the group." — Added advice; the story does not mention singling her out.
- unsupported, grounded · baseline_same · en-33 · "Medical/Allergy Info: None." — Restates "No medical stuff."
- unsupported, grounded · baseline_claude · es-24 · "Información proporcionada por su abuela y tutora." — Meta line, but true: the grandmother wrote the story and has custody.
- unsupported, not grounded · baseline_same · en-08 · "A calm, warm greeting" — Added advice.
- unsupported, grounded · baseline_same · es-12 · "Keep the classroom door closed at all times." — Translation of "la puerta del salón cerrada".
- unsupported, grounded · baseline_same · es-16 · "CUSTODY: Only her foster parents, Pablo and Ana, or her social worker, Mrs." — Translation of "Solo nosotros (Pablo y Ana) o la trabajadora social, la señora Gómez".
- unsupported, not grounded · baseline_claude · es-21 · "Evite también actividades o manualidades con alimentos (por ejemplo, galletas, cereal, masa o recipientes que hayan tenido leche o huevo)." — Added advice (crafts with food); not in the story.
- unsupported, not grounded · baseline_claude · es-10 · "Su silencio no significa que esté bien ni que no la haya oído." — Added interpretation of her silence.
- unsupported, not grounded · baseline_claude · en-22 · "he picks up on tension." — Not in the story.
- unsupported, not grounded · baseline_claude · en-14 · "Greet Zoe warmly and let her choose a puzzle to start." — Greeting advice added (only "loves puzzles" is from the story).
- unsupported, not grounded · baseline_claude · es-01 · "Avise antes, si puede, de música fuerte, aplausos o juegos ruidosos." — "Warn beforehand" is added; the story only says loud noises scare him.
- unsupported, grounded · baseline_same · en-22 · "What to Do: If he seems overwhelmed or panicky, calmly and quietly invite him to step into the hallway with a leader." — Paraphrase of "If he gets panicky let him step into the hallway with a leader".
- unsupported, not grounded · baseline_same · es-09 · "Health Information — Please Read" — Boilerplate header.
- unsupported, not grounded · baseline_claude · en-03 · "Jonah: Volunteer Information Sheet" — Boilerplate header.
- unsupported, not grounded · baseline_same · es-13 · "A great way to connect with her and help her feel comfortable." — Added.
- supported, grounded · baseline_claude · es-17 · "Durante la alabanza fuerte o cualquier momento ruidoso, mantenerlo cerca de un adulto." — From "cuando hay alabanza fuerte mejor que esté cerca de un adulto".
- supported, grounded · baseline_claude · en-25 · "The tube must be replaced within one hour, or the opening can start to close." — From "it has to go back in within an hour or the hole starts closing".
- supported, grounded · baseline_claude · en-17 · "Penny cannot have the communion bread." — From "she can't have the bread".
- supported, grounded · baseline_claude · en-11 · "If a door is open, Isaiah may run toward the parking lot." — From "He runs toward the parking lot if a door is open".
- supported, grounded · baseline_same · en-08 · "She calls her blanket "Mimi" and will bring it with her." — From "She calls her blanket Mimi and will bring it".
- supported, not grounded · baseline_claude · es-18 · "Paula es una niña muy tímida, pero con mucho corazón." — "muy tímida" is from the story; "con mucho corazón" is invented.
- supported, grounded · baseline_claude · en-05 · "Please give him only his own thickened drinks." — From "only thickened drinks, we send them".
- supported, grounded · baseline_claude · en-17 · "Penny is 8 years old and has celiac disease." — From the first sentence.
- supported, grounded · baseline_claude · es-12 · "La puerta del salón siempre cerrada mientras Gael esté dentro." — From "la puerta del salón cerrada".
- supported, grounded · baseline_claude · en-32 · "An adult must be within arm's reach of Emma at all times during any water activity." — From "an adult has to be within arm's reach of her" (water games).
- supported, grounded · baseline_same · en-10 · "Do NOT use the 0.15 mg Auvi-Q — that one belongs to her sister, Rose." — From "NOT the 0.15 her sister Rose has".
- supported, not grounded · baseline_claude · en-17 · "Celiac disease is an autoimmune condition, not an anaphylactic allergy." — "autoimmune condition" is added medical information.
- supported, grounded · baseline_same · en-15 · "Allergy — bees (EpiPen): Wyatt is allergic to bees." — From "allergic to bees (epipen...)".
- supported, grounded · baseline_same · en-32 · "Water games: Adult within arm's reach." — From the water-games sentence.
- supported, grounded · baseline_same · en-09 · "He lip-reads — just make sure you're facing him when you talk to him." — From "he lip-reads, just face him when you talk".
- supported, not grounded · baseline_claude · es-22 · "Tiene un estimulador del nervio vago (VNS), un dispositivo implantado que ayuda a controlar las crisis." — "un dispositivo implantado que ayuda a controlar las crisis" is added explanation.
- supported, grounded · baseline_claude · en-25 · "No food, no snacks, and no water, not even a sip." — From "gets NOTHING by mouth, not even water".
- supported, grounded · baseline_same · es-04 · "About Camila: Camila is 4 years old and is a joy to be around." — Translation of "es nuestra alegría".
- supported, grounded · baseline_same · en-09 · "His uncle Ray is on the pickup list and is allowed to collect him — he simply never does." — From "he can, he's on the list, he just never does".
- supported, grounded · baseline_same · en-32 · "She falls and gets hurt, or" — Fragment of "only if she falls and gets hurt".

</details>

<details><summary>Round 2 judgments</summary>

- unsupported, not grounded · baseline_same · en-33 · "Here is a quick guide to help you have a great time together." — Boilerplate.
- unsupported, not grounded · baseline_same · en-03 · "Sunday Care Summary — Jonah (age 4)" — Title; name and age are from the story, the title text is not.
- unsupported, not grounded · baseline_claude · en-35 · "If anyone other than Marcus arrives to pick her up, please check with the ministry director before releasing her." — Added policy: the story says Marcus can pick up and Kevin cannot, not "only Marcus".
- unsupported, not grounded · baseline_claude · en-23 · "Swelling (face, lips, tongue, or throat)" — "face, lips, tongue, or throat" is added detail; the story says "swelling".
- unsupported, not grounded · baseline_claude · en-18 · "It's a good tool for connecting, calming him, or redirecting his attention." — Added.
- unsupported, not grounded · baseline_same · en-22 · "This is normal for him." — Added gloss on "he'll come back on his own in 5 minutes or so".
- unsupported, not grounded · baseline_same · en-21 · "Use these to connect with her." — Added.
- unsupported, not grounded · baseline_claude · en-03 · "Before Sunday: Please Confirm with His Parents" — Added.
- unsupported, not grounded · baseline_claude · en-31 · "Give him plenty of time to respond, and let him use his talker without rushing or finishing sentences for him." — Added advice; the story only says he uses a talker.
- unsupported, not grounded · baseline_claude · en-01 · "Move him somewhere quieter and give him space and calm." — Added advice.
- unsupported, not grounded · baseline_same · en-11 · "Safety Second: Wandering & Parking Lot" — Header; "parking lot" is from the story, the header text is not.
- unsupported, grounded · baseline_claude · en-10 · "Rose's Auvi-Q is a different dose (0.15 mg)." — From "NOT the 0.15 her sister Rose has".
- unsupported, not grounded · baseline_claude · en-01 · "he'll recover best with quiet and space" — Added.
- unsupported, not grounded · baseline_same · en-12 · "Quiet, low-pressure activities work well." — Added (the story says drawing cards help).
- unsupported, grounded · baseline_claude · es-18 · "No la presiones ni la obligues." — Gist of "si la dejan observar un rato se anima sola".
- unsupported, not grounded · baseline_claude · en-19 · "Keep pathways clear and make sure activities, tables, and seating spaces have room for her chair so she can participate alongside the other kids." — Added advice.
- unsupported, not grounded · baseline_claude · es-04 · "déjela descansar tranquila y cerca de usted." — "déjela descansar ... cerca de usted" is added; the story says lay her on her side.
- unsupported, not grounded · baseline_same · en-25 · "Let me know if you'd like it shorter, reformatted for a specific template, or adjusted in tone." — Boilerplate.
- unsupported, grounded · baseline_claude · en-30 · "If you see her attempting a somersault or any tumbling move during play, gently redirect her to a different activity" — Restates "no somersaults, no headstands, no rough tumbling" as an instruction.
- unsupported, not grounded · baseline_same · en-18 · "A quick check toward the front of the room now and then is a good idea." — Added advice.
- supported, grounded · baseline_claude · en-14 · "Guardian: Nana Pat (grandmother) has legal custody." — From "I have custody of Zoe" (Nana Pat).
- supported, not grounded · baseline_claude · en-21 · "If her mom arrives with Travis, do not release Ruby, call 911, and get a ministry leader." — Mostly from the story, but "get a ministry leader" is added.
- supported, not grounded · baseline_same · en-32 · "Thank you for caring for Emma!" — Boilerplate (supported only because it names Emma).
- supported, not grounded · baseline_claude · en-23 · "Child Summary: Nora, age 7" — Title (supported because it names Nora and her age).
- supported, grounded · baseline_claude · en-21 · "She eats peanut butter now, so peanut butter snacks are fine for her." — From "she eats peanut butter now".
- supported, grounded · baseline_claude · en-14 · "Zoe's father (Derek) is NOT on the pick-up list and may not take Zoe anywhere." — From "he is NOT on the pick up list and he is not allowed to take her anywhere".
- supported, grounded · baseline_same · en-05 · "Bathroom: Two-person transfer — get Dana (on site from 9:45)" — From the bathroom sentence.
- supported, grounded · baseline_same · en-08 · "She calls her blanket "Mimi" and will bring it with her." — From the blanket sentence.
- supported, grounded · baseline_same · en-21 · "Auditory Sensitivity: She hates hand dryers and will cover her ears." — From "hates hand dryers (covers her ears)".
- supported, grounded · baseline_claude · en-19 · "She uses a manual wheelchair and pushes herself." — From the first sentence.
- supported, grounded · baseline_claude · en-26 · "Do not take any pictures or video of Mason, and do not include him in anything posted online or shared digitally." — From item 1.
- supported, grounded · baseline_claude · es-06 · "Comer: Dejarla sola, no ayudar" — From "No necesita ayuda para comer".
- supported, grounded · baseline_claude · en-34 · "No one else may pick Elias up or visit him at church." — From "Neither of his parents may ... visit him at church" and "Only ... may sign him out".
- supported, not grounded · baseline_same · en-25 · "Give her time to use her communication board;" — "Give her time" is added; the story only says she uses a board.
- supported, grounded · baseline_claude · en-20 · "Call 911 at 5 minutes if the seizure is still going." — From "call 911 at 5 min".
- supported, not grounded · baseline_claude · en-06 · "About Sofia: Sofia is a cheerful 8-year-old who has Down syndrome." — "cheerful" is added.
- supported, grounded · baseline_claude · en-15 · "Elopement risk (runs away): Wyatt will leave the room if a door is open, and he has made it to the street before." — From "he WILL leave the room if the door's open, he's gotten to the street before".
- supported, grounded · baseline_claude · es-12 · "Usa audífonos en los dos oídos." — From "usa audífonos en los dos oídos".
- supported, not grounded · baseline_same · en-19 · "Shunt — Know the Warning Signs" — Header text added (the shunt warning signs themselves are in the story).
- supported, grounded · baseline_claude · en-05 · "Never lift Ethan out of his chair by yourself." — From "Please don't lift him out of the chair by yourself".

</details>

<details><summary>Short cards judgments</summary>

- unsupported, not grounded · baseline_same_short · en-35 · "Thanks for looking after her!" — Sign-off boilerplate; nothing in the story.
- unsupported, not grounded · baseline_claude_short · en-14 · "If he approaches, please keep Zoe with you and get a staff member right away." — Added procedure: the story says Derek may not go to the kids' area, not what the volunteer should do if he comes.
- unsupported, not grounded · baseline_claude_short · en-34 · "If anyone else asks for Elias, please do not release him, and find a ministry leader right away." — 'Do not release him' follows from 'Only Carmen or I may sign him out'; 'find a ministry leader right away' is added.
- unsupported, not grounded · baseline_claude_short · es-10 · "No es falta de respeto ni timidez: simplemente no puede hablar." — Adds 'not disrespect or shyness'; the story says only that she understands everything and does not speak outside home.
- unsupported, not grounded · baseline_claude_short · es-21 · "Si hay cualquier duda o síntoma, avise de inmediato a la mamá o al líder del ministerio." — Added contact procedure; the story names no one to tell about doubts or symptoms.
- unsupported, not grounded · baseline_claude_short · en-26 · "Thank you for taking such good care of him!" — Sign-off boilerplate.
- unsupported, not grounded · baseline_claude_short · en-11 · "Please keep doors closed and stay close." — Added advice: the story says he runs toward the parking lot if a door is open; it does not ask for closed doors or staying close.
- unsupported, not grounded · baseline_claude_short · es-18 · "Un poco de tranquilidad al respecto le hará bien." — Added reassurance advice; the story only says she sometimes asks about her little sister.
- unsupported, not grounded · baseline_same_short · en-19 · "Thank you for caring for her!" — Sign-off boilerplate.
- unsupported, not grounded · baseline_claude_short · en-14 · "About Zoe: She has eczema, so please watch for scratching or discomfort." — 'She has eczema' is in the story; 'watch for scratching or discomfort' is added.
- unsupported, grounded · baseline_same_short · es-09 · "Puede repetir después de 20 min." — Translation of the code-switched 'can repeat after 20 min' (a false flag: word overlap cannot see the translation).
- unsupported, not grounded · baseline_claude_short · es-22 · "No le gustan las sorpresas, así que conviene avisarle antes de cualquier cambio de actividad." — 'No le gustan las sorpresas' is in the story; 'warn her before any change of activity' is added advice.
- unsupported, grounded · baseline_claude_short · es-25 · "¡Disfrutará las actividades con música y movimiento!" — Borderline, counted as grounded: a generalisation of 'le encanta bailar' (dancing is music and movement).
- unsupported, not grounded · baseline_claude_short · en-24 · "(Add parent's name and number for texting.)" — Template placeholder the model added for the church; not in the story.
- unsupported, not grounded · baseline_claude_short · es-24 · "avise de inmediato al coordinador." — Second half of 'do not release him to either; tell the coordinator at once': the coordinator step is added.
- supported, grounded · baseline_claude_short · en-11 · "Isaiah is autistic and nonverbal." — Story: 'Isaiah is 12, autistic and nonverbal'.
- supported, grounded · baseline_claude_short · en-17 · "It's not that kind of allergy." — Story: 'it's not that kind of allergy'.
- supported, grounded · baseline_same_short · es-07 · "Soy Rosa, la abuela de Emiliano y tengo su custodia." — Story: 'Soy Rosa, la abuela de Emiliano (6 años). Tengo su custodia.' (kept in the grandmother's first person).
- supported, grounded · baseline_claude_short · en-06 · "If Tina shows up, please do not release Sofia and call the director." — Verbatim story sentence.
- supported, grounded · baseline_claude_short · es-11 · "Avísale cinco minutos antes usando el reloj de arena que trae en su mochila." — Story: 'avísenle cinco minutos antes con el reloj de arena que trae en su mochila'.
- supported, grounded · baseline_claude_short · en-05 · "Please get Dana, his aide, who is there from 9:45." — Story: 'please get Dana, his aide, she's there from 9:45'.
- supported, grounded · baseline_same_short · en-01 · "Leo is 6 and autistic." — Story: 'Leo is 6 and he's autistic'.
- supported, not grounded · baseline_claude_short · en-18 · "He follows the music to the worship team, so keep an eye out when songs start." — A miss: 'he follows the music to the worship team' is in the story, but 'keep an eye out when songs start' is added advice.
- supported, grounded · baseline_claude_short · en-02 · "Please don't let her skip it." — Story: 'just don't let her skip snack' (the sentence before names the snack).
- supported, grounded · baseline_claude_short · en-02 · "Do NOT give extra insulin;" — Story: 'do NOT give extra insulin'.
- supported, grounded · baseline_same_short · en-06 · "Sofia (8) has Down syndrome and has lived with us, her foster family, since March." — Story: 'Sofia is 8 and has Down syndrome. She has lived with us, her foster family, since March.'
- supported, grounded · baseline_claude_short · en-20 · "Jayden has epilepsy and a VNS implant." — Story: 'he has epilepsy and a VNS implant'.
- supported, grounded · baseline_same_short · en-13 · "Don't let him run laps on cold mornings — that triggers it." — Story: 'dont let him run laps on cold mornings, that triggers it'.
- supported, grounded · baseline_claude_short · en-09 · "He lip-reads, so just face him when you talk." — Story: 'he lip-reads, just face him when you talk'.
- supported, grounded · baseline_same_short · en-11 · "Isaiah is 12, autistic, and nonverbal." — Story: 'Isaiah is 12, autistic and nonverbal'.

</details>
