# Privacy

A Halfdoor card holds what a parent knows about their child: allergies, medicine, who may pick them up, what frightens them. The rule behind every design choice: the fewest people see the least, for the shortest time, and the parent can see every opening.

Every statement below describes what the code does today. Where it relies on someone else (Intel, the enclave operator, Venice), that is said too. The enclave sentences in quotes are the app's own wording from [`src/lib/crypto/attestation.ts`](src/lib/crypto/attestation.ts).

## What is stored

Each church has its own random 256-bit data key, kept wrapped under a master key that lives only in the server's environment. "Sealed" below means AES-256-GCM under that church's key ([`src/lib/crypto/atrest.ts`](src/lib/crypto/atrest.ts)).

| Data | Where | Protection |
|---|---|---|
| The parent's story | The parent's own browser (this device's local storage) | Never sent to Halfdoor in plain text, never in its database. The parent can clear it at any time. |
| The card: its lines, the parent's words each line came from, translations | Database | Sealed |
| Kids' team notes on a card; a question sent back to the parent | Database | Sealed |
| Card status, support level, version, dates, tags from a fixed list (for example `noise_sensitive`, `bathroom_help`) | Database | Not sealed: used for matching and the picture schedule |
| Moments: part of the morning, good / hard / break / bathroom, which card lines helped, time | Database | Not sealed; a buddy's optional written note is sealed |
| Notes home: the draft and approved text | Database | Sealed; which moments each sentence rests on is not |
| People: first name, last initial, role, language; for children, grade; for buddies, training date, background-check expiry, gender (for bathroom-help matching), skills and languages | Database | Not sealed |
| Check-ins: times and pickup code | Database | Not sealed |
| Card access log: who, in which role, why, opened and closed times | Database | Not sealed; shown to the parent |
| AI ledger: purpose, model, whether end-to-end encrypted, the enclave record, tokens, cost | Database | No prompts and no answers are stored |

**Nothing reaches the server before the parent approves.** The draft card lives in the parent's browser until they press **Approve card**.

**Retention.** Every check-in moves the card's deletion date to 12 months later, so a card is deleted 12 months after the child's last Sunday. Today expired cards are deleted whenever the demo is opened; there is no scheduled job yet.

**Deletion by the parent.** **Delete the card** removes the card and every line on it, the notes home, and anything a buddy wrote about the child's Sundays. What stays: the list of who opened the card (with a line saying it was deleted), and the times and kinds of the child's moments, without any words. The parent can also clear their words saved on the device in the same step.

**Demo churches** are synthetic and expire after 24 hours; an expired one is deleted, with everything in it, the next time anyone opens the demo. To limit how many one connection can create, Halfdoor stores a salted hash of the connection's IP address, never the address itself.

## Who can see what

| Person | Sees | When |
|---|---|---|
| Parent | Their own child's card, the notes home, and the access log | Any time. Their own views are not listed in the log. |
| Kids' director | Every approved card in the church | Any time; every opening is logged and the parent sees it. The director can't edit the parent's lines, only add attributed team notes or send the card back with a question. |
| Buddy | The full card of the child they are matched with | Only while all of these hold: the director approved the match for that service and acknowledged the card, the child is checked in for that service and not checked out, and it is between 30 minutes before the service starts and 30 minutes after it ends. While the card is being updated (the parent changed it, or the director sent it back with a question) the buddy keeps only its safety lines until the director reads it again. At checkout the card locks and is cleared from the phone. |
| Room leader | Safety lines and pickup codes only | For children checked in at that service, inside the same window |

The gate is code, checked on the server for every read ([`src/lib/access/gate.ts`](src/lib/access/gate.ts), tested in [`tests/unit/gate.test.ts`](tests/unit/gate.test.ts) and [`tests/unit/cards-api.test.ts`](tests/unit/cards-api.test.ts)). A buddy's opening is logged once per check-in, as one line with its start and end: "Priya opened Leo's card · Sun 8:52–10:14 (while Leo was checked in)".

## The enclave check, step by step

Children's details (the story, the card lines to translate, a buddy's moments for the note home) go to an AI model only inside an attested enclave, through Venice's end-to-end encrypted models. The browser that holds the words does the checking.

1. **A one-time key and code.** The browser makes a fresh key pair and a random one-time code.
2. **The attestation.** It asks for the enclave's attestation. Halfdoor's server adds its Venice API key and passes the request and the answer through unchanged.
3. **Binding.** The browser parses the Intel TDX report itself and checks that it seals both the address of the enclave's key and *this* one-time code, and that the enclave is not in debug mode. On its own this proves nothing about who made the report.
4. **Intel's signature.** The browser verifies Intel's signature chain on that report (certificate chain to Intel's root, revocation lists, platform status) with `@phala/dcap-qvl`, using public Intel data from Phala's PCCS server. If that server is unreachable, it falls back to bundled Intel data no more than 14 days old and says so. The platform status is recorded and shown.
5. **Fail closed.** If either check fails, nothing is encrypted or sent: "We couldn't verify the enclave right now — nothing was sent. Try again in a minute."
6. **Encrypt and send.** Only then does the browser replace the child's first name with a placeholder, encrypt the request to the checked key (secp256k1 ECDH, HKDF-SHA256, AES-256-GCM) and send the ciphertext. Halfdoor's relay refuses any message that isn't ciphertext.
7. **The answer.** It streams back encrypted and is decrypted in the browser. A chunk that arrives unencrypted makes the browser discard the whole answer.
8. **Reuse.** A checked key is reused for up to 10 minutes for the same model, and the panel says "Reused · checked N min ago".

What the parent sees next to the writing box:

> "Before anything is sent, your browser checks that the enclave's key and your one-time code are sealed in an Intel TDX report and verifies Intel's signature on it. If either check fails, nothing is sent."

And the limit, shown with it:

> "We verify Intel's signature, non-debug mode and that the key and your one-time code are sealed in the report. We don't yet check the enclave's software measurement against a published list."

In plain terms: we check that the key belongs to a genuine Intel TDX enclave that is not in debug mode, freshly for this request. We trust Intel's hardware and signing, and the enclave operators behind Venice (NEAR AI and Phala) to run the software they say they run.

## What each party sees

| Party | Sees | Does not see |
|---|---|---|
| Parent's browser | Everything the parent writes and approves | — |
| Halfdoor server | Ciphertext of every enclave request and answer; the attestation it relays; token counts; the enclave record the browser reports (kept in the AI ledger, never used to decide anything). In plain text: the approved card when it is saved (then sealed), moments and buddy notes when they are logged, the note home when it is saved, the lesson text. | The raw story. Prompts and answers are never stored. |
| Venice | Ciphertext, the model name, token counts, timing and size. For the picture schedule only: the lesson text, sent to Claude Sonnet 5.5 through Venice's standard API. The lesson carries no child data. | Anything an enclave request carries in plain text |
| The enclave | The request in plain text while it runs: the story with the child's first name replaced (other names the parent wrote stay), card lines to translate, or a child's moments for the note home | The child's first name |
| Phala PCCS | The browser's IP address when it fetches public Intel data | Any child data: "No child data is sent to it." |
| Fontshare (font CDN) | Every visitor's IP address when a page loads its font (General Sans) | Any child data, or anything typed on the page |

## The AI ledger

Every church has an **AI ledger** on the director's desk: each AI call with its purpose (card, translation, note home, picture schedule), the model, whether it was end-to-end encrypted, the Intel signature result and where it was checked, tokens and cost. The words sent and received are never stored, so they are not there either. Calls are capped in code: 15 per demo church, $3 a day across the whole demo, and 1,500 output tokens per call.

## What the AI may and may not do

- **May:** turn the parent's words into short card lines, each pointing to its source; translate between English and Spanish, with the original one tap away; turn a buddy's taps into a draft note for the director to read.
- **May not:** add a diagnosis or a label the parent didn't use; reword a safety line; rate or score a child; write teaching (the verse is fetched word for word from the Berean Standard Bible, and the child's story about the morning is built from fixed sentences).

These are enforced by code after the model answers, not by asking the model nicely: lines that can't be found in the parent's words are dropped and shown to the parent, safety lines are replaced by the parent's own sentences, a paraphrase that loses a "not" or an "only" falls back to the parent's sentence, and unsaid diagnosis words are dropped ([`src/lib/card/verify.ts`](src/lib/card/verify.ts)).

## Nothing is sent automatically

Halfdoor sends no email, text or notification to anyone. A note home reaches the parent only after the director approves it, and the parent reads it on their own page. Buddies are matched only when the director approves. When the Planning Center connection is finished, the note it writes on a child's People record will say only that a card is on file, never what it says.
