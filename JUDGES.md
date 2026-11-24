# Review Halfdoor in 5 minutes

Halfdoor gives the volunteer buddy at the kids' room door a card made from the parent's own words. The card opens only while the child is checked in and locks again at checkout. Below is one Sunday, start to finish, with what to look for at each step.

Everything here runs live: the enclave calls, the lesson call, the database and the access rules. Two things are stand-ins: the church is fictional, and a **Simulated check-in station** plays the part of the church's check-in system ([MOCKS.md](MOCKS.md)). Halfdoor is built for Planning Center Check-Ins, but that live connection is not part of this demo.

## The path

**0. Open [halfdoor.vercel.app/demo](https://halfdoor.vercel.app/demo).**
You get your own copy of **Fernbrook Community Church** for 24 hours and land on the Kids' desk as **Hannah**, the kids' director. The **Try a Sunday** guide is on the side (on a phone, it's the pill at the bottom). Each step's **Go** button switches to the right person and opens the right page.
*Look for:* "Fictional church · sample data" on every page.

**1. Jordan writes about Sam** (Go, as Jordan, Sam's dad).
Write a few sentences about Sam, or paste this:

> Sam is 6 and in 1st grade. Sam loves building with blocks and anything about the ocean, especially octopuses. Big, loud groups are hard, and Sam may freeze and stop talking. A heads-up before each change helps, and so does holding the small stuffed octopus from home. When Sam starts rocking or covers both ears, a quiet corner helps. Sam is allergic to tree nuts and has an EpiPen in the front pocket of the backpack. Only me (Jordan) or Aunt Lena may pick Sam up.

Click **Make the card**.
*Look for:*
- **The enclave check**, passing step by step before anything is sent: "Key + one-time code: Sealed in the report", "Intel signature: Verified · live Intel data". Open **What this means** for the enclave's measurement and what we don't check yet.
- **Highlighted words.** In "Your words", every phrase that made it onto the card is marked. Tap a card line to see the words it came from.
- **"Your exact words"** on the Safety lines: the allergy and the pickup sentence are Jordan's sentences, unchanged.
- **Left out** and **Is this a safety note?**, if the model dropped something or a safety sentence isn't on the card. The parent decides; the AI can't skip it.

Pick how much help Sam needs (for example **A buddy all morning**) and click **Approve card**. Nobody sees the card before this.

**2. Hannah reviews Sam's card** (Go, as Hannah).
Read the card in the drawer and click **Acknowledge card**.
*Look for:* the director can add "Notes for the buddies" or send the card back with a question, but can't edit Jordan's lines.

**3. Match Sam with a buddy** (Go).
On **This Sunday**, open the **9:00** tab, click **Suggest buddies for 9:00**, read **Why this match**, then **Approve all**.
*Look for:* reasons in plain words (training current, background check valid, language, same buddy as recent Sundays). Optional: on the **11:00** tab, **Suggest buddies for 11:00** names a gap plainly: Ivy needs a buddy with AAC experience, and the one who has it has an expired training.

**4. Check Sam in** (Go).
At the **Simulated check-in station**, click **Check in** next to Sam.
*Look for:* the **Simulated check-in station** label, which says that in a real church the church's check-in system does this; the pickup code.

**5. The buddy opens Sam's card** (Go, as Sam's buddy).
*Look for:*
- **"Unlocked · checked in 9:0…"** and the **Safety** banner first, in the parent's exact words.
- **Schedule:** Now / Next pictograms to show Sam.
- **Moments:** pick a part of the morning and tap **Good moment**.

*Want to watch it unlock?* Open step 5 before step 4: the phone shows **"Locked until Sam is checked in"**. Open a second tab at the same address, replace `buddy/…` (up to the `?`) with `station`, and press **Check in** there. Anyone in the demo church can play the front desk. The first tab unlocks on its own within about 8 seconds, one check-in poll (6.5 s in our end-to-end test).

**6. Check Sam out** (Go).
Click **Check out**, then click step 5 again.
*Look for:* **"Locked · checked out …"** and "Checkout locked Sam's card and cleared it from this phone." The safety lines are gone from the phone.

**7. Approve the note home** (Go).
On **Notes home**, open the **9:00** tab, choose Sam, click **Draft the note home**, then **Approve the note**.
*Look for:* the note is drafted inside the enclave too; each sentence lists **Moments behind this sentence**; words that can sound like a judgment are marked for the director, never removed. Halfdoor sends nothing: the parent reads it on their page.

**Then: Open Jordan's page** (button at the end of the guide).
*Look for:* **Notes from church** shows the note. **Who opened the card** shows the buddy's opening with its times, "(while Sam was checked in)", and Hannah's review.

**Finally: the AI ledger** (as Hannah, Kids' desk → **AI ledger**).
*Look for:* every AI call this church made: what it was for, the model, "End-to-end encrypted" with "Intel signature verified · live data · in the browser" for anything with a child's details, "Plain · no child data" for the lesson, tokens and cost. Prompts and answers are not stored, so they are not there either.

Optional: **Viewing as → Tom (room leader)** shows safety lines only, for children checked in. **Sunday pack** turns this week's lesson into a picture schedule with each child's supports on the right step.

The demo allows 15 AI calls per demo church. If you run out, **Reset demo church** at the bottom of the guide starts over.

## The evaluation in one table

<!-- eval:stories -->60<!-- /eval:stories --> synthetic parent stories with a hidden answer key, after hand review of every automatic flag. **The honest result first:** on safety facts, a plain AI summary did as well as Halfdoor. What Halfdoor changes is what gets added: almost no sentence the parent never said, because the verifier drops any line it can't point to in the story (by construction, not a separate finding).

<!-- eval:summary -->
| System | Model | Safety facts kept | Wrong safety claims | Outputs with a sentence the parent never said | Words, mean |
|---|---|---|---|---|---|
| Halfdoor card | `e2ee-deepseek-v4-flash` | 99.4% (156/157) | 0 | 3 of 58 | 92 |
| Halfdoor card + safety net accepted | `e2ee-deepseek-v4-flash` | 100.0% (157/157) | 0 | 3 of 58 | 93 |
| Plain summary, same enclave model | `e2ee-deepseek-v4-flash` | 100.0% (157/157) | 0 | 33 of 33 | 258 |
| Plain summary, Claude Sonnet 5.5 | `claude-sonnet-5-5` | 100.0% (157/157) | 0 | 52 of 52 | 291 |
| Short card prompt, same enclave model | `e2ee-deepseek-v4-flash` | 100.0% (157/157) | 0 | 13 of 51 | 75 |
| Short card prompt, Claude Sonnet 5.5 | `claude-sonnet-5-5` | 100.0% (157/157) | 0 | 28 of 54 | 86 |
<!-- /eval:summary -->

Method, every output and both hand reviews: [`eval/results/summary.md`](eval/results/summary.md). Short version in the [README](README.md#measured).

## More

- [CLAIMS.md](CLAIMS.md): every public statement, tagged reproducible, verified live, modeled or not claimed.
- [PRIVACY.md](PRIVACY.md): what is stored, who can see what, and the enclave check step by step.
- [MOCKS.md](MOCKS.md): exactly what is simulated.
