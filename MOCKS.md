# What is real and what is simulated

The exact line between the two, so nothing in the demo is mistaken for more than it is.

## Simulated

**The check-in station.** In a real church, children are checked in with Planning Center Check-Ins, and Halfdoor reads those check-ins. In the demo, a page labelled **Simulated check-in station** stands in: "In a real church, Planning Center Check-Ins does this. Here it stands in so you can try a whole Sunday." It writes check-ins of the same shape (marked as coming from the demo station), and everything after it is the same code a real check-in would go through: the access gate, the unlock and lock on the buddy's phone, the access log, retention. The station exists only in demo churches; its API refuses any other church ([`src/lib/checkins/station.ts`](src/lib/checkins/station.ts); "the station is sandbox only" in [`tests/unit/cards-api.test.ts`](tests/unit/cards-api.test.ts)).

**The church and everyone in it.** Fernbrook Community Church is fictional, and every child, parent, buddy and leader is sample data ([`src/db/seed/fernbrook.ts`](src/db/seed/fernbrook.ts)). Every page says "Fictional church · sample data". Each visit to `/demo` makes a private copy that expires after 24 hours. No real congregant's data is in the demo or in the evaluation.

**Seeded history.** So that matching, patterns and the access log have something to show, each demo church starts with five past Sundays of check-ins, buddy matches, moments and access-log lines, and with pre-written cards for the other children. Sam's card is the one you make live.

**The demo clock.** A demo church's services are created around the moment you open it, so their real times rarely fall on a Sunday morning. Demo pages shift every displayed time by one offset so the first service reads as 9:00 on a Sunday ([`src/lib/demo/clock.ts`](src/lib/demo/clock.ts)). Real churches show real times.

**Planning Center.** Not connected yet. The hook points exist ([`src/lib/pco/hooks.ts`](src/lib/pco/hooks.ts)), but no Planning Center organisation is linked to the live deploy, so nothing is read from or written to Planning Center. The "Schedule in Planning Center" button is inactive and says "Connect Planning Center".

**The evaluation stories.** All synthetic, written with their answer keys for the evaluation ([`eval/stories/`](eval/stories/README.md)).

## Real

Everything else, in the live demo:

- **Enclave calls.** Every card draft, card translation and note home is a live call to a Venice end-to-end encrypted model, after a live attestation check in your browser against live Intel data. The AI ledger lists each one with its tokens and cost.
- **The lesson call.** The Sunday pack's picture schedule is a live call to Claude Sonnet 5.5 on Venice, with the lesson text only.
- **The checks after every model answer:** the card verifier and safety prompts, the note-home verifier, the lesson's exact-quote check.
- **The database** (Postgres), with per-church sealing of card content.
- **The access gate and the access log**, enforced on the server for every read.
- **The buddy matcher**, the picture-schedule rules, the fixed-sentence story, the Bible verse (fetched word for word through the Bible SDK) and the ARASAAC pictograms.
- **Spend caps**, enforced in code before each model call.

## The end-to-end test seam (development only)

The automated end-to-end test ([`tests/e2e/sunday.spec.ts`](tests/e2e/sunday.spec.ts)) runs the whole Sunday through the real UI, but replays recorded model outputs instead of calling the models, so a run costs nothing and sends nothing to Venice. The card, translation and note outputs were recorded from real enclave calls ([`scripts/record-e2e-fixture.ts`](scripts/record-e2e-fixture.ts)); the recorded lesson is written by hand to the lesson's schema. Everything else in that test is real: the routes, the access gate, the check-in poll and the database.

The seam cannot be on in production. It turns on only when **both** hold: the app is not a production build, and `PLAYWRIGHT_ENCLAVE_FIXTURE` is exactly `1` ([`src/lib/testing/fixtureMode.ts`](src/lib/testing/fixtureMode.ts)). A production build fixes the first condition to false whatever the environment says, and the recordings are excluded from production bundles ([`next.config.ts`](next.config.ts)). Both are pinned by [`tests/unit/test-seam.test.ts`](tests/unit/test-seam.test.ts): "production: the layout passes no replay and the lesson has no recording, even with the flag".

While the seam is on, it says so: pages show "Test fixtures · no real AI calls", the enclave panel reads "Test fixture — not a real enclave", and Halfdoor's relay refuses to reach Venice.
