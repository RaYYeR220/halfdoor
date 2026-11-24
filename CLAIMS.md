# Claims

Every public statement Halfdoor makes, with how to check it.

- **REPRODUCIBLE**: a test or script in this repo reproduces it. `pnpm test` runs the unit tests, `pnpm test:e2e` the end-to-end test, `pnpm eval` the evaluation.
- **VERIFIED-LIVE**: you can see it happen in the live demo at [halfdoor.vercel.app/demo](https://halfdoor.vercel.app/demo).
- **MODELED**: a design, an estimate or an outside figure, not something we measured live.
- **NOT-CLAIMED**: things we do not say, stated so no one reads them in.

## REPRODUCIBLE

### The card

| Claim | Reproduced by |
|---|---|
| Safety lines (allergies, medical, who may pick up) are the parent's own sentences, word for word. | [`tests/unit/card-verify.test.ts`](tests/unit/card-verify.test.ts) "safety items become the full source sentence verbatim"; [`tests/e2e/sunday.spec.ts`](tests/e2e/sunday.spec.ts) checks Sam's two safety sentences exactly |
| Every card line points back to the parent's words; a line that can't be found is left out and shown to the parent. | `card-verify.test.ts` "drops items whose quotes are not in the story"; [`src/lib/card/verify.ts`](src/lib/card/verify.ts) |
| A paraphrase that loses a "not", "never" or "only" (English or Spanish) falls back to the parent's sentence. | `card-verify.test.ts` "flipped paraphrase falls back to the quote sentence", "keeps Spanish negation in paraphrase" |
| The card never adds a diagnosis or label the parent didn't use. | `card-verify.test.ts` "paraphrase with an unsaid label is dropped" |
| A sentence with a safety word that didn't make it onto the card is put to the parent: "Is this a safety note?" | `card-verify.test.ts` "safety net surfaces an uncovered EpiPen sentence" |
| A translation that loses a "not" or "only" is withheld; the line stays in the parent's words. | [`tests/unit/pipeline.test.ts`](tests/unit/pipeline.test.ts) "EN to ES, withholds a translation that lost the limiter" |
| In languages other than English and Spanish, every line is the parent's own sentence. | `card-verify.test.ts` "other-language story: every item is verbatim" |

### The enclave path

| Claim | Reproduced by |
|---|---|
| Nothing is encrypted or sent unless the enclave's key and the one-time code are sealed in a non-debug Intel TDX report **and** Intel's signature on it verifies. Any failure sends nothing. | [`tests/unit/enclave.test.ts`](tests/unit/enclave.test.ts) "a key not bound in the quote never reaches chat", "nothing is encrypted or sent until Intel's signature on the quote verifies", "a throwing verifier fails closed too"; [`tests/unit/tdx-quote.test.ts`](tests/unit/tdx-quote.test.ts) |
| The child's first name is replaced before anything leaves the browser. | `pipeline.test.ts` "child name never leaves in the prompt"; [`tests/unit/note.test.ts`](tests/unit/note.test.ts) "child name never leaves in the prompt" |
| Halfdoor's relay accepts only ciphertext; an unencrypted chunk in the answer is rejected. | [`tests/unit/budget.test.ts`](tests/unit/budget.test.ts) "proxy rejects plaintext content"; `enclave.test.ts` "plaintext delta in an e2ee stream is rejected" |
| The raw story is never sent to Halfdoor's server in plain text and has no place in its database. | the relay test above; the story lives in [`src/lib/parent/storyStore.ts`](src/lib/parent/storyStore.ts) (this browser only); [`src/db/schema.ts`](src/db/schema.ts) has no story column |
| Card content is sealed at rest under a per-church key. | [`tests/unit/atrest.test.ts`](tests/unit/atrest.test.ts) |

### Access, retention, caps

| Claim | Reproduced by |
|---|---|
| A buddy opens a card only with an approved match for that service, an acknowledged card, the child checked in there and not checked out, between 30 minutes before the service and 30 minutes after it. While the card is being updated, only its safety lines. | [`tests/unit/gate.test.ts`](tests/unit/gate.test.ts); [`tests/unit/cards-api.test.ts`](tests/unit/cards-api.test.ts) "locks until the child checks in, logs the opening, closes it on check-out", "a card being updated opens with its safety lines only; a draft stays locked" |
| Room leaders see safety lines only. | `gate.test.ts` "leader gets safety scope only"; `cards-api.test.ts` "the room leader gets safety items only, and no team notes" |
| Every opening by the team is logged and shown to the parent, including the director's reads of card lines on the patterns board and in the note-home context (once per day). | `cards-api.test.ts`; [`tests/unit/access-log-route.test.ts`](tests/unit/access-log-route.test.ts); [`tests/unit/desk-routes.test.ts`](tests/unit/desk-routes.test.ts) and [`tests/unit/moments-notes-api.test.ts`](tests/unit/moments-notes-api.test.ts) "…logs a director read…" |
| Cards are kept 12 months after approval or the last check-in, then deleted; a parent's deletion removes the card, the notes home and buddies' written notes, and keeps the access log with a "deleted" line. | `cards-api.test.ts` "approve sets parent_approved, bumps version, 12-month retention", "hard-deletes the card, moment notes and drafts, keeps log rows with a deleted tombstone", "purgeExpiredCards removes cards past retain_until and nothing else" |
| AI calls are capped in code: 15 per demo church, $3 a day across the demo, 1,500 output tokens per call, reserved before the call. | `budget.test.ts` "sandbox cap blocks the 16th call", "parallel reservations cannot overshoot the sandbox cap", "relays the stream unchanged, clamps max_tokens" |

### Sunday

| Claim | Reproduced by |
|---|---|
| Buddy matches respect training, background check, availability, same gender for bathroom help and needed skills; a gap names who could close it. | [`tests/unit/solver.test.ts`](tests/unit/solver.test.ts) |
| Each sentence of a note home must rest on a logged moment; words that can sound like a judgment are flagged for the director, never removed. | `note.test.ts` "sentence citing an unknown moment id is dropped as no_evidence", "judgment words are flagged, not removed" |
| The child's story about the morning is built only from fixed sentences; the big idea must be a sentence of the lesson, word for word; the verse is fetched word for word from the BSB. | [`tests/unit/schedule.test.ts`](tests/unit/schedule.test.ts) |
| Patterns are counts over past Sundays, not AI. | [`tests/unit/patterns.test.ts`](tests/unit/patterns.test.ts) |
| The parent, buddy and room pages exist in English and Spanish with the same strings. | [`tests/unit/i18n.test.ts`](tests/unit/i18n.test.ts) |
| The whole Sunday works through the real UI: card, review, match, check-in, buddy phone, checkout, note home. An open locked card unlocks within 10 s of the check-in (6.5 s measured) and locks again at checkout. | `pnpm test:e2e`, [`tests/e2e/sunday.spec.ts`](tests/e2e/sunday.spec.ts) (prints the unlock time) |
| 588 unit tests pass. | `pnpm test` |
| The end-to-end test seam can't be on in a production build. | [`tests/unit/test-seam.test.ts`](tests/unit/test-seam.test.ts) |

### The evaluation

Reproduce with `pnpm eval` (model calls are cached in `eval/.cache/`, so a re-run is free; the full run cost <!-- eval:eval-cost -->$0.60<!-- /eval:eval-cost --> at Venice list prices), then `pnpm eval:render`. Results: [`eval/results/final.json`](eval/results/final.json), method and every output: [`eval/results/summary.md`](eval/results/summary.md). Numbers below are after hand review of every automatic flag ([`adjudication.json`](eval/results/adjudication.json)).

| Claim | Number |
|---|---|
| Stories, each with a hidden answer key | <!-- eval:stories -->60<!-- /eval:stories --> (<!-- eval:stories-en -->35<!-- /eval:stories-en --> English, <!-- eval:stories-es -->25<!-- /eval:stories-es --> Spanish), synthetic |
| On safety facts, a plain one-page AI summary did as well as Halfdoor | Claude summary <!-- eval:baseline_claude-reviewed-present -->100.0% (157/157)<!-- /eval:baseline_claude-reviewed-present -->; Halfdoor after the parent accepts its safety prompts <!-- eval:halfdoor_net-reviewed-present -->100.0% (157/157)<!-- /eval:halfdoor_net-reviewed-present --> |
| Halfdoor's card before the parent answers its safety prompts | <!-- eval:halfdoor-reviewed-present -->99.4% (156/157)<!-- /eval:halfdoor-reviewed-present --> |
| Wrong safety claims | Halfdoor <!-- eval:halfdoor-reviewed-traps -->0<!-- /eval:halfdoor-reviewed-traps -->; plain outputs <!-- eval:baselines-trap-review -->4 flagged automatically, 0 confirmed by hand review<!-- /eval:baselines-trap-review --> |
| Outputs with a sentence the parent never said | Halfdoor <!-- eval:halfdoor-added -->3 of 58<!-- /eval:halfdoor-added --> (by construction); short prompted card <!-- eval:baseline_claude_short-added -->28 of 54<!-- /eval:baseline_claude_short-added --> (Claude), <!-- eval:baseline_same_short-added -->13 of 51<!-- /eval:baseline_same_short-added --> (same model); one-page summary <!-- eval:baseline_claude-added -->52 of 52<!-- /eval:baseline_claude-added --> (Claude), <!-- eval:baseline_same-added -->33 of 33<!-- /eval:baseline_same-added --> (same model) |
| The rule behind that count, hand-checked on a fresh sample of short-card sentences ([`support-validation.json`](eval/results/support-validation.json), `shortCard`) | <!-- eval:grounding-precision -->86.7% (13 of 15)<!-- /eval:grounding-precision --> of flagged sentences really add something; <!-- eval:grounding-passed -->93.3% (14 of 15)<!-- /eval:grounding-passed --> of passed ones really are grounded. It errs both ways, so the counts are approximate, not a bound. |
| The rule was changed once after the run, and how | The first published version counted a card's title ("Ethan, age 10 — Sunday Volunteer Card") as a sentence the parent never said. Title and heading lines are now skipped ([`eval/metrics.ts`](eval/metrics.ts) `isTitleLine`), and every output was re-scored from the cached model outputs with no new model call ([`eval/rescore.ts`](eval/rescore.ts)); safety facts and wrong claims did not change. Short cards with an added sentence went from <!-- eval:baseline_claude_short-added-before -->29 of 54<!-- /eval:baseline_claude_short-added-before --> to <!-- eval:baseline_claude_short-added -->28 of 54<!-- /eval:baseline_claude_short-added --> (Claude) and from <!-- eval:baseline_same_short-added-before -->23 of 51<!-- /eval:baseline_same_short-added-before --> to <!-- eval:baseline_same_short-added -->13 of 51<!-- /eval:baseline_same_short-added --> (same model); Halfdoor stayed at <!-- eval:halfdoor-added -->3 of 58<!-- /eval:halfdoor-added -->. Before and after for every system: [`summary.md`](eval/results/summary.md#provenance-what-each-output-adds). |
| Halfdoor card drafting, median (model calls only) | <!-- eval:halfdoor-p50 -->7.1 s<!-- /eval:halfdoor-p50 --> |

## VERIFIED-LIVE

| Claim | Where to see it |
|---|---|
| Your browser checks the enclave against live Intel data before the story is sent. | Guide step 1, the **Enclave check** panel: "Intel signature: Verified · live Intel data" |
| Card drafts, translations and notes home are live enclave calls; the picture schedule is a live Claude Sonnet 5.5 call with the lesson only. | Kids' desk → **AI ledger** |
| The card is locked on the buddy's phone until check-in, unlocks at check-in, and locks and clears at checkout. | Guide steps 4 to 6 ([JUDGES.md](JUDGES.md) shows how to watch the unlock) |
| The parent sees who opened the card and when. | Jordan's page → **Who opened the card** |
| Gaps in matching are named plainly. | **This Sunday** → 11:00 → **Suggest buddies for 11:00** |
| Room leaders see safety lines only. | **Viewing as** → Tom (room leader) |
| The demo is labelled as fictional, and the station as simulated. | Every page; the station page |

## MODELED

| Statement | What it rests on |
|---|---|
| "1 in 3 parents of children with disabilities have left a church because their child wasn't included or welcomed." | An outside survey: Ault, Collins & Carter, 2013 (n = 416). Not measured by us. |
| Built for Planning Center: check-ins from Check-Ins would open and close the card, buddies would be scheduled into Services, and a note on the child's People record would say a card is on file. | The design, the Planning Center ids in the data model and the hook points in [`src/lib/pco/hooks.ts`](src/lib/pco/hooks.ts). The API calls are not written and the live connection is not part of this demo; a labelled simulated check-in station stands in. |
| A card costs about <!-- eval:halfdoor-cost-per-story -->$0.0002<!-- /eval:halfdoor-cost-per-story --> in model calls. | Token usage in the evaluation at Venice list prices ([`src/lib/venice/prices.ts`](src/lib/venice/prices.ts)); real stories may be longer. |
| The evaluation tells you how Halfdoor handles real parents' words. | Synthetic stories written for the evaluation, one sample per story and system. |

## NOT-CLAIMED

- **Not a diagnosis tool.** Halfdoor adds no labels and never rates or scores a child.
- **We don't verify the enclave's software measurement.** "We don't yet check the enclave's software measurement against a published list." We trust Intel and the enclave operators behind Venice.
- **Not a check-in system.** The church's check-in system checks children in; the demo station is simulated ([MOCKS.md](MOCKS.md)).
- **No real congregant data**, in the demo or the evaluation.
- **Not connected to Planning Center.** The live connection is not part of this demo; the shapes and hook points are in the code, and a labelled simulated check-in station stands in for Check-Ins.
- **Not better than a plain AI summary at keeping safety facts.** It wasn't, on these stories.
- **Not "the server never sees the card".** It sees the approved card when it is saved, then seals it.
- **Not an exact measure of added sentences,** and Halfdoor's near-zero count is not an independent finding: the verifier removes what it can't point to.
- **Not tested against the live enclave in the end-to-end test.** That test replays recorded outputs; the live enclave is exercised in the demo and the evaluation.
- **No protection against a compromised device,** or against someone on the team copying a card by hand.
- **No medical guidance.** Safety lines are the parent's words.
- **No messages sent** to families or volunteers by Halfdoor.
- **No paraphrase or translation checks outside English and Spanish.**
- **Not ready for commercial use as is:** ARASAAC pictograms are licensed for non-commercial use.
- **No scheduled deletion job yet:** expired cards are deleted when the demo is opened.
