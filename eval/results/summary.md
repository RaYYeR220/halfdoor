# Halfdoor eval results

Generated 2026-11-23 from `final.json`: 60 synthetic parent stories (35 EN, 25 ES) with a hidden answer key, enclave model `e2ee-deepseek-v4-flash`, comparison model `claude-sonnet-5-5`, max 1500 output tokens. Every system sees only the story text. Key and rules: [stories/README.md](../stories/README.md).

- **Halfdoor card**: the product pipeline. The child's name is redacted, an E2EE enclave model drafts a card with quotes, and a deterministic verifier keeps every safety item as the parent's own sentence.
- **+ safety net accepted**: the same card after accepting every safety-net prompt (story sentences with safety words that the model left off the card).
- **Plain summary**: "Write a one-page summary of this child for the volunteer who will look after them on Sunday." plus the story, sent to the same enclave model, and to Claude through Venice's standard (non-E2EE) API, which is allowed only because the stories are synthetic.

## Bottom line

- **Safety facts: a plain summary is as good as Halfdoor.** Halfdoor card 99.4% (156/157), with the safety net accepted 100.0% (157/157); plain summaries 100.0% (157/157) (same model) and 100.0% (157/157) (Claude).
- **Wrong claims:** Halfdoor 0 trap hits; plain summaries 1 and 1. The baseline trap hits are the 2 known scorer artifacts listed in appendix A (the summaries say the right thing); no system made a wrong safety claim that survived review.
- **What the output adds (the product's actual claim):** Halfdoor cards carry 0.05 sentences per card that are not grounded in the story; plain summaries carry 11.6 and 12.5 per summary (advice, boilerplate and elaboration the parent never wrote). A card is 92 words (27.8 s to read) against 258 and 291 words (77.3 s and 87.4 s).

## Safety facts and wrong claims (automatic scoring)

| System | Model | Safety facts kept | Limiter facts kept | Trap hits (flips / numbers / sibling) | Stories with a trap hit |
|---|---|---|---|---|---|
| Halfdoor card | `e2ee-deepseek-v4-flash` | 99.4% (156/157) | 100.0% (60/60) | 0 (0 / 0 / 0) | 0/60 |
| Halfdoor card + safety net accepted | `e2ee-deepseek-v4-flash` | 100.0% (157/157) | 100.0% (60/60) | 0 (0 / 0 / 0) | 0/60 |
| Plain summary, same enclave model | `e2ee-deepseek-v4-flash` | 100.0% (157/157) | 100.0% (60/60) | 1 (1 / 0 / 0) | 1/60 |
| Plain summary, Claude Sonnet 5.5 | `claude-sonnet-5-5` | 100.0% (157/157) | 100.0% (60/60) | 1 (0 / 0 / 1) | 1/60 |

Outputs are read through a markdown-aware normalizer before the key is applied (`eval/normalize.ts`): headings, table rows, list items and "Only these people:" leads become units the sentence-scoped patterns can read; a trap counts only if it fires both with and without that structure. Against a hand review of every flag in the first run, the scorer agrees on 23/25 items (the README rules read raw agreed on 7/25); details in appendix A.

## Provenance: what each output adds

| System | Sentences not grounded in the story, per output | Outputs with any | Unsaid diagnosis labels: exact word / label family | Words, mean / median | Reading time at 200 wpm, mean / median |
|---|---|---|---|---|---|
| Halfdoor card | 0.05 (of 5.8 sentences) | 3/58 (2 not scored: other language) | 0 / 0 outputs | 92 / 74 | 27.8 s / 22.0 s |
| Halfdoor card + safety net accepted | 0.05 (of 5.9 sentences) | 3/58 (2 not scored: other language) | 0 / 0 outputs | 93 / 76 | 27.9 s / 23.0 s |
| Plain summary, same enclave model | 11.61 (of 23.8 sentences) | 33/33 (27 not scored: other language) | 13 / 0 outputs | 258 / 225 | 77.3 s / 68.0 s |
| Plain summary, Claude Sonnet 5.5 | 12.48 (of 23.2 sentences) | 52/52 (8 not scored: other language) | 3 / 0 outputs | 291 / 292 | 87.4 s / 88.0 s |

- **Not grounded**: a sentence counts as grounded when at least 33% of its content words (4+ letters, not stopwords, compared by 5-letter prefix) also occur in the story. Lines of 4 words or fewer are ignored, and outputs in another language than the story are not scored, because word overlap cannot see a translation (the same-model summary answered most Spanish stories in English). Hand check on a fresh random sample (appendix B): 17/20 flagged sentences really add something the parent did not write, and 14/20 passed sentences really are grounded, so the counts are approximate and lean low.
- **Unsaid labels**: diagnosis words (autism, ADHD, Down syndrome…) the story does not contain. "Exact word" is the check the product verifier applies; "label family" also accepts another form of the same diagnosis (autistic for autism, autismo for autism, the parent's lowercase "adhd", "CP").

Every Halfdoor sentence flagged as not grounded:

- en-22: "include him naturally with the group."
- en-25: "support her mobility as needed."
- es-20: "No la levanten, lo odia."

Three random flagged sentences from "Plain summary, same enclave model":

- en-30: "She is a blessing, and your care will help her have a wonderful Sunday."
- en-34: "While this may not come up in class, it's important context."
- en-08: "Just needs a little extra warmth at drop-off and her blanket close by."

Three random flagged sentences from "Plain summary, Claude Sonnet 5.5":

- es-05: "Preguntarle por su equipo favorito o su dinosaurio preferido puede ayudarlo a relajarse."
- es-18: "Es normal que al principio no quiera unirse a las actividades."
- en-02: "You're doing a great job looking after her!"

## What went wrong

- **On safety-fact recall a plain summary is as good as Halfdoor.** Both plain summaries keep every safety fact with the right polarity on these stories; the Halfdoor card has 1 missed fact in 1 story (no missed fact once the safety net is accepted). Halfdoor's case rests on provenance, length and privacy, not on recall.
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

### Latency and cost

| System | p50 | p95 | Cost, 60 stories | Cost per story |
|---|---|---|---|---|
| Halfdoor card | 7.1 s | 20.5 s | $0.0114 | $0.0002 |
| Halfdoor card + safety net accepted | 7.1 s | 20.5 s | $0.0114 | $0.0002 |
| Plain summary, same enclave model | 19.1 s | 63.4 s | $0.0100 | $0.0002 |
| Plain summary, Claude Sonnet 5.5 | 6.7 s | 13.1 s | $0.4301 | $0.0072 |

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

Every miss and trap hit the automatic scorer raised in the first run (`b277f60:eval/results/final.json`, before the round-1 fixes) was read in context and marked real or scorer artifact (`adjudication.json`). Agreement with that review: **7/25** with the README rules read raw, **23/25** with the markdown-aware scorer, which raised no new flag on those outputs.

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

</details>

## Appendix B: grounding-rule validation

20 random sentences the rule flags as not grounded and 20 it passes, from the plain summaries, judged by hand against the story (grounded = the story states, or translates to, everything the sentence claims; boilerplate, headers and added advice are not grounded).

| Round | Rule | Seed | Flagged that really add something | Passed that really are grounded |
|---|---|---|---|---|
| 1 | supported if >= 50% of content words (4+ letters, not stopwords, 5-char prefix) occur in the story | 2026 | 12/20 (60.0%) | 17/20 (85.0%) |
| 2 | supported if >= 33% of content words (4+ letters, not stopwords, 5-char prefix) occur in the story; sentences of <= 4 words ignored; outputs in another language than the story not scored | 2027 | 17/20 (85.0%) | 14/20 (70.0%) |

Round 1 missed the 80% target: its false flags were translations, close paraphrases and short label lines. The rule was revised once (language check, one-third threshold, short lines ignored) and checked again on a fresh sample (round 2).

<details><summary>Round 1 judgments</summary>

- unsupported, grounded · es-15 · "Sitting apart makes him feel bad/left out." — Translation of "NO necesita sentarse en mesa aparte, eso lo hace sentir mal" (English answer to a Spanish story).
- unsupported, not grounded · es-20 · "Make sure walkways and the classroom have clear space for her wheelchair to move around." — Added advice; the story says nothing about walkways or room layout.
- unsupported, grounded · en-27 · "No other action needed." — Restates "Above 250 just text me" (the "just").
- unsupported, not grounded · es-16 · "Confidential – Please Read Before Sunday" — Boilerplate header, not from the story.
- unsupported, grounded · en-08 · "She will likely hang on to her parent at the door for a few minutes." — Paraphrase of "will probably hang on to me at the door for a bit".
- unsupported, not grounded · es-10 · "Don't single her out in front of the group." — Added advice; the story does not mention singling her out.
- unsupported, grounded · en-33 · "Medical/Allergy Info: None." — Restates "No medical stuff."
- unsupported, grounded · es-24 · "Información proporcionada por su abuela y tutora." — Meta line, but true: the grandmother wrote the story and has custody.
- unsupported, not grounded · en-08 · "A calm, warm greeting" — Added advice.
- unsupported, grounded · es-12 · "Keep the classroom door closed at all times." — Translation of "la puerta del salón cerrada".
- unsupported, grounded · es-16 · "CUSTODY: Only her foster parents, Pablo and Ana, or her social worker, Mrs." — Translation of "Solo nosotros (Pablo y Ana) o la trabajadora social, la señora Gómez".
- unsupported, not grounded · es-21 · "Evite también actividades o manualidades con alimentos (por ejemplo, galletas, cereal, masa o recipientes que hayan tenido leche o huevo)." — Added advice (crafts with food); not in the story.
- unsupported, not grounded · es-10 · "Su silencio no significa que esté bien ni que no la haya oído." — Added interpretation of her silence.
- unsupported, not grounded · en-22 · "he picks up on tension." — Not in the story.
- unsupported, not grounded · en-14 · "Greet Zoe warmly and let her choose a puzzle to start." — Greeting advice added (only "loves puzzles" is from the story).
- unsupported, not grounded · es-01 · "Avise antes, si puede, de música fuerte, aplausos o juegos ruidosos." — "Warn beforehand" is added; the story only says loud noises scare him.
- unsupported, grounded · en-22 · "What to Do: If he seems overwhelmed or panicky, calmly and quietly invite him to step into the hallway with a leader." — Paraphrase of "If he gets panicky let him step into the hallway with a leader".
- unsupported, not grounded · es-09 · "Health Information — Please Read" — Boilerplate header.
- unsupported, not grounded · en-03 · "Jonah: Volunteer Information Sheet" — Boilerplate header.
- unsupported, not grounded · es-13 · "A great way to connect with her and help her feel comfortable." — Added.
- supported, grounded · es-17 · "Durante la alabanza fuerte o cualquier momento ruidoso, mantenerlo cerca de un adulto." — From "cuando hay alabanza fuerte mejor que esté cerca de un adulto".
- supported, grounded · en-25 · "The tube must be replaced within one hour, or the opening can start to close." — From "it has to go back in within an hour or the hole starts closing".
- supported, grounded · en-17 · "Penny cannot have the communion bread." — From "she can't have the bread".
- supported, grounded · en-11 · "If a door is open, Isaiah may run toward the parking lot." — From "He runs toward the parking lot if a door is open".
- supported, grounded · en-08 · "She calls her blanket "Mimi" and will bring it with her." — From "She calls her blanket Mimi and will bring it".
- supported, not grounded · es-18 · "Paula es una niña muy tímida, pero con mucho corazón." — "muy tímida" is from the story; "con mucho corazón" is invented.
- supported, grounded · en-05 · "Please give him only his own thickened drinks." — From "only thickened drinks, we send them".
- supported, grounded · en-17 · "Penny is 8 years old and has celiac disease." — From the first sentence.
- supported, grounded · es-12 · "La puerta del salón siempre cerrada mientras Gael esté dentro." — From "la puerta del salón cerrada".
- supported, grounded · en-32 · "An adult must be within arm's reach of Emma at all times during any water activity." — From "an adult has to be within arm's reach of her" (water games).
- supported, grounded · en-10 · "Do NOT use the 0.15 mg Auvi-Q — that one belongs to her sister, Rose." — From "NOT the 0.15 her sister Rose has".
- supported, not grounded · en-17 · "Celiac disease is an autoimmune condition, not an anaphylactic allergy." — "autoimmune condition" is added medical information.
- supported, grounded · en-15 · "Allergy — bees (EpiPen): Wyatt is allergic to bees." — From "allergic to bees (epipen...)".
- supported, grounded · en-32 · "Water games: Adult within arm's reach." — From the water-games sentence.
- supported, grounded · en-09 · "He lip-reads — just make sure you're facing him when you talk to him." — From "he lip-reads, just face him when you talk".
- supported, not grounded · es-22 · "Tiene un estimulador del nervio vago (VNS), un dispositivo implantado que ayuda a controlar las crisis." — "un dispositivo implantado que ayuda a controlar las crisis" is added explanation.
- supported, grounded · en-25 · "No food, no snacks, and no water, not even a sip." — From "gets NOTHING by mouth, not even water".
- supported, grounded · es-04 · "About Camila: Camila is 4 years old and is a joy to be around." — Translation of "es nuestra alegría".
- supported, grounded · en-09 · "His uncle Ray is on the pickup list and is allowed to collect him — he simply never does." — From "he can, he's on the list, he just never does".
- supported, grounded · en-32 · "She falls and gets hurt, or" — Fragment of "only if she falls and gets hurt".

</details>

<details><summary>Round 2 judgments</summary>

- unsupported, not grounded · en-33 · "Here is a quick guide to help you have a great time together." — Boilerplate.
- unsupported, not grounded · en-03 · "Sunday Care Summary — Jonah (age 4)" — Title; name and age are from the story, the title text is not.
- unsupported, not grounded · en-35 · "If anyone other than Marcus arrives to pick her up, please check with the ministry director before releasing her." — Added policy: the story says Marcus can pick up and Kevin cannot, not "only Marcus".
- unsupported, not grounded · en-23 · "Swelling (face, lips, tongue, or throat)" — "face, lips, tongue, or throat" is added detail; the story says "swelling".
- unsupported, not grounded · en-18 · "It's a good tool for connecting, calming him, or redirecting his attention." — Added.
- unsupported, not grounded · en-22 · "This is normal for him." — Added gloss on "he'll come back on his own in 5 minutes or so".
- unsupported, not grounded · en-21 · "Use these to connect with her." — Added.
- unsupported, not grounded · en-03 · "Before Sunday: Please Confirm with His Parents" — Added.
- unsupported, not grounded · en-31 · "Give him plenty of time to respond, and let him use his talker without rushing or finishing sentences for him." — Added advice; the story only says he uses a talker.
- unsupported, not grounded · en-01 · "Move him somewhere quieter and give him space and calm." — Added advice.
- unsupported, not grounded · en-11 · "Safety Second: Wandering & Parking Lot" — Header; "parking lot" is from the story, the header text is not.
- unsupported, grounded · en-10 · "Rose's Auvi-Q is a different dose (0.15 mg)." — From "NOT the 0.15 her sister Rose has".
- unsupported, not grounded · en-01 · "he'll recover best with quiet and space" — Added.
- unsupported, not grounded · en-12 · "Quiet, low-pressure activities work well." — Added (the story says drawing cards help).
- unsupported, grounded · es-18 · "No la presiones ni la obligues." — Gist of "si la dejan observar un rato se anima sola".
- unsupported, not grounded · en-19 · "Keep pathways clear and make sure activities, tables, and seating spaces have room for her chair so she can participate alongside the other kids." — Added advice.
- unsupported, not grounded · es-04 · "déjela descansar tranquila y cerca de usted." — "déjela descansar ... cerca de usted" is added; the story says lay her on her side.
- unsupported, not grounded · en-25 · "Let me know if you'd like it shorter, reformatted for a specific template, or adjusted in tone." — Boilerplate.
- unsupported, grounded · en-30 · "If you see her attempting a somersault or any tumbling move during play, gently redirect her to a different activity" — Restates "no somersaults, no headstands, no rough tumbling" as an instruction.
- unsupported, not grounded · en-18 · "A quick check toward the front of the room now and then is a good idea." — Added advice.
- supported, grounded · en-14 · "Guardian: Nana Pat (grandmother) has legal custody." — From "I have custody of Zoe" (Nana Pat).
- supported, not grounded · en-21 · "If her mom arrives with Travis, do not release Ruby, call 911, and get a ministry leader." — Mostly from the story, but "get a ministry leader" is added.
- supported, not grounded · en-32 · "Thank you for caring for Emma!" — Boilerplate (supported only because it names Emma).
- supported, not grounded · en-23 · "Child Summary: Nora, age 7" — Title (supported because it names Nora and her age).
- supported, grounded · en-21 · "She eats peanut butter now, so peanut butter snacks are fine for her." — From "she eats peanut butter now".
- supported, grounded · en-14 · "Zoe's father (Derek) is NOT on the pick-up list and may not take Zoe anywhere." — From "he is NOT on the pick up list and he is not allowed to take her anywhere".
- supported, grounded · en-05 · "Bathroom: Two-person transfer — get Dana (on site from 9:45)" — From the bathroom sentence.
- supported, grounded · en-08 · "She calls her blanket "Mimi" and will bring it with her." — From the blanket sentence.
- supported, grounded · en-21 · "Auditory Sensitivity: She hates hand dryers and will cover her ears." — From "hates hand dryers (covers her ears)".
- supported, grounded · en-19 · "She uses a manual wheelchair and pushes herself." — From the first sentence.
- supported, grounded · en-26 · "Do not take any pictures or video of Mason, and do not include him in anything posted online or shared digitally." — From item 1.
- supported, grounded · es-06 · "Comer: Dejarla sola, no ayudar" — From "No necesita ayuda para comer".
- supported, grounded · en-34 · "No one else may pick Elias up or visit him at church." — From "Neither of his parents may ... visit him at church" and "Only ... may sign him out".
- supported, not grounded · en-25 · "Give her time to use her communication board;" — "Give her time" is added; the story only says she uses a board.
- supported, grounded · en-20 · "Call 911 at 5 minutes if the seizure is still going." — From "call 911 at 5 min".
- supported, not grounded · en-06 · "About Sofia: Sofia is a cheerful 8-year-old who has Down syndrome." — "cheerful" is added.
- supported, grounded · en-15 · "Elopement risk (runs away): Wyatt will leave the room if a door is open, and he has made it to the street before." — From "he WILL leave the room if the door's open, he's gotten to the street before".
- supported, grounded · es-12 · "Usa audífonos en los dos oídos." — From "usa audífonos en los dos oídos".
- supported, not grounded · en-19 · "Shunt — Know the Warning Signs" — Header text added (the shunt warning signs themselves are in the story).
- supported, grounded · en-05 · "Never lift Ethan out of his chair by yourself." — From "Please don't lift him out of the chair by yourself".

</details>
