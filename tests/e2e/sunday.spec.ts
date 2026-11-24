// The whole Sunday loop on a fresh demo church, through the real UI: Jordan writes about Sam and approves the card,
// Hannah reviews it, matches Sam with a buddy and checks him in; the buddy's phone opens the card and logs a moment;
// checkout locks it; Hannah approves the note home; Jordan sees the note and who opened the card.
//
// The two model calls replay recorded outputs (tests/e2e/fixtures/enclave-recording.json, made by
// scripts/record-e2e-fixture.ts) through the test seam in src/lib/testing/fixtureMode.ts, so a run sends nothing to
// Venice and costs nothing. Everything else is real: the routes, the access gate, the heartbeat, the database.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

type Recording = { card: { story: string; childName: string }; note: { text: string } };
const recording = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'enclave-recording.json'), 'utf8')) as Recording;
const STORY = recording.card.story;
/** The recorded note's first sentence as Jordan reads it (the pipeline puts Sam's name back). */
const NOTE_SENTENCE = (JSON.parse(recording.note.text) as { sentences: { text: string }[] }).sentences[0].text.replace(/\bthe child\b/i, 'Sam');

const ms = (since: number) => Date.now() - since;
const log = (msg: string) => console.log(`[sunday] ${msg}`);

/** A step button in the "Try a Sunday" guide. */
const guideStep = (page: Page, n: number) => page.getByRole('button', { name: new RegExp(`^Go to step ${n}:`) });

/** "Viewing as" → a person in the role bar; waits for their page. */
async function switchPerson(page: Page, name: string, lands: RegExp) {
  await page.getByRole('button', { name: /^Switch person, now/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${name} ·`) }).click();
  await page.waitForURL(lands);
}

// The dev server compiles each route on first use. Compile the API routes first, one at a time: without cookies
// they answer 401/400 before touching the database, so this never bursts the (small, remote) connection pool.
// Pages compile on their first real visit below.
test.beforeAll(async ({ request }) => {
  test.setTimeout(5 * 60_000);
  const t0 = Date.now();
  const id = '00000000-0000-0000-0000-000000000000';
  const gets = ['demo/state', 'heartbeat', 'buddy/today', 'cards/' + id, 'moments', 'notes', 'notes/context', 'pack', 'access-log', 'children', 'station', 'tee/attestation'];
  const posts = ['sandbox/as', 'assignments/solve', 'assignments/approve', 'cards/' + id + '/ack', 'station', 'moments', 'notes', 'lessons', 'tee/chat'];
  for (const p of gets) await request.get(`/api/${p}`, { timeout: 120_000 }).catch(() => null);
  for (const p of posts) await request.post(`/api/${p}`, { data: {}, timeout: 120_000 }).catch(() => null);
  log(`warm-up ${ms(t0)} ms`);
});

test('a whole Sunday: card, review, match, check-in, buddy phone, checkout, note home', async ({ page, browser, baseURL }) => {
  const started = Date.now();
  let buddy = '';
  let slug = '';

  await test.step('1. /demo makes a fresh demo church and opens the desk', async () => {
    const t0 = Date.now();
    await page.goto('/demo');
    await page.waitForURL(/\/c\/fernbrook-[0-9a-f]+\/desk$/);
    slug = new URL(page.url()).pathname.split('/')[2];
    await expect(page.getByRole('heading', { level: 1, name: 'Children' })).toBeVisible();
    // The seam is on (so nothing below reaches a paid model), and the page says so.
    await expect(page.getByTestId('test-fixture-mode')).toBeVisible();
    await expect(page.getByText('Fictional church · sample data').first()).toBeVisible();
    log(`demo church ${slug} in ${ms(t0)} ms`);
  });

  await test.step("2. Jordan writes Sam's story, checks the card against his words, approves it", async () => {
    await switchPerson(page, 'Jordan', /\/parent\/[0-9a-f-]+$/);
    await page.getByRole('textbox', { name: 'Tell us about Sam' }).fill(STORY);
    await page.getByRole('button', { name: 'Make the card', exact: true }).click();

    await expect(page.getByRole('heading', { level: 1, name: "Here's Sam's card" })).toBeVisible();
    // At least three lines, each tied to the words it came from (marked in the story).
    expect(await page.locator('button[aria-controls$="-quote"]').count()).toBeGreaterThanOrEqual(3);
    expect(await page.locator('mark[data-ids]').count()).toBeGreaterThanOrEqual(3);
    const safety = page.getByRole('region', { name: 'Safety', exact: true });
    await expect(safety.getByText('Your exact words')).toBeVisible();
    // Safety lines are the parent's own sentences, word for word.
    await expect(safety.getByRole('button', { name: 'Sam is allergic to tree nuts and has an EpiPen in the front pocket of the backpack.', exact: true })).toBeVisible();
    await expect(safety.getByRole('button', { name: 'Only me (Jordan) or Aunt Lena may pick Sam up.', exact: true })).toBeVisible();
    // Opening a line shows the parent's words it rests on.
    await page.locator('button[aria-controls$="-quote"]').first().click();
    await expect(page.getByText('From your words').or(page.getByText('Word for word from what you wrote')).first()).toBeVisible();
    // The replay is labelled as what it is, never as a checked enclave.
    await expect(page.getByTestId('enclave-fixture-chip')).toHaveText('Test fixture — not a real enclave');
    await expect(page.getByText('Verified · live Intel data')).toHaveCount(0);

    await page.getByRole('radio', { name: /^A buddy all morning/ }).check();
    await page.getByRole('button', { name: 'Approve card', exact: true }).click();
    await expect(page.getByText("Card approved. The kids' team will read it before Sunday.")).toBeVisible();
  });

  await test.step("3. Hannah opens Sam's card from Children and acknowledges it", async () => {
    await switchPerson(page, 'Hannah', /\/desk$/);
    await page.locator('main').getByRole('button', { name: /^Sam\b/ }).click();
    const drawer = page.getByRole('dialog', { name: "Sam's card" });
    await expect(drawer.getByText(/allergic to tree nuts/).first()).toBeVisible();
    await drawer.getByRole('button', { name: 'Acknowledge card', exact: true }).click();
    await expect(drawer.getByText(/^Reviewed .+\. Sam can be matched with a buddy\.$/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  await test.step('4. This Sunday: Sam (a new family) is matched at 9:00 and approved; 11:00 names the gap for Ivy', async () => {
    await page.getByRole('link', { name: 'This Sunday', exact: true }).click();
    await page.waitForURL(/\/desk\/sunday$/);
    await page.getByRole('tab', { name: /^9:00 service/ }).click();
    await page.getByRole('button', { name: 'Suggest buddies for 9:00', exact: true }).click();

    const approveSam = page.getByRole('button', { name: /^Approve Sam with / });
    await expect(approveSam).toBeVisible({ timeout: 120_000 });
    buddy = ((await approveSam.getAttribute('aria-label')) ?? '').replace('Approve Sam with ', '');
    expect(buddy).not.toBe('');
    const samRow = page.getByRole('listitem').filter({ has: approveSam });
    await expect(samRow.getByText('New family — confirm which service')).toBeVisible();
    await expect(page.getByText('Sam is new', { exact: true })).toBeVisible();
    log(`Sam's buddy at 9:00: ${buddy}`);

    await page.getByRole('button', { name: /^Approve all \d+$/ }).click();
    const samMatch = page.getByRole('listitem').filter({ hasText: 'New family — confirm which service' }).filter({ hasText: buddy });
    await expect(samMatch.getByText('Approved', { exact: true })).toBeVisible({ timeout: 60_000 });

    await page.getByRole('tab', { name: /^11:00 service/ }).click();
    await page.getByRole('button', { name: 'Suggest buddies for 11:00', exact: true }).click();
    const ivyGap = page.getByRole('listitem').filter({ has: page.getByText('Ivy', { exact: true }) }).filter({ hasText: /needs a buddy/ });
    await expect(ivyGap).toContainText('Dana', { timeout: 120_000 });
    await expect(ivyGap).toContainText("Ivy needs a buddy with AAC experience at 11:00 — Dana's inclusion training expired");
  });

  // The buddy's phone is another browser (its own "viewing as" cookie), so the front desk stays Hannah's.
  const phoneContext = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
  try {
    await phoneContext.addCookies(await page.context().cookies());
    const phone = await phoneContext.newPage();

    await test.step("5. The guide's step 5 opens the phone of the buddy matched at Sam's service: the card is locked", async () => {
      await phone.goto(`/c/${slug}/desk`);
      const step5 = guideStep(phone, 5);
      await expect(step5).toBeEnabled({ timeout: 60_000 });
      await expect(step5).toHaveAccessibleName(new RegExp(`, as ${buddy}$`));
      await step5.click();
      await phone.waitForURL(/\/buddy\/[0-9a-f-]+\?service=[0-9a-f-]+&child=[0-9a-f-]+$/);
      await expect(phone.getByRole('button', { name: `Switch person, now ${buddy}, Buddy`, exact: true })).toBeVisible();
      await expect(phone.getByRole('heading', { name: 'Sam', exact: true }).first()).toBeVisible({ timeout: 60_000 });
      // Not checked in yet: the locked card is on screen and no safety line has reached the phone.
      await expect(phone.getByText('Locked until Sam is checked in').first()).toBeVisible({ timeout: 30_000 });
      await expect(phone.getByText(/tree nuts/)).toHaveCount(0);
    });

    await test.step('6. The guide opens the station on Sam; Hannah checks him in and the open locked card unlocks live', async () => {
      await guideStep(page, 4).click();
      await page.waitForURL(/\/station\?service=[0-9a-f-]+&child=[0-9a-f-]+$/);
      // Names are exact and scoped to the page: the guide's own buttons read "Go to step 4: Check Sam in, as Hannah".
      const station = page.locator('main');
      const t0 = Date.now();
      await station.getByRole('button', { name: 'Check Sam in', exact: true }).click();
      await expect(station.getByRole('button', { name: 'Check Sam out', exact: true })).toBeVisible();
      await expect(page.getByText(/^Sam checked in · code [A-Z0-9]+$/)).toBeVisible();
      // The signature moment: the phone that was already open unlocks on its own, within 10 s of the check-in.
      const confirmed = Date.now();
      await expect(phone.getByText(/^Unlocked · checked in /).first()).toBeVisible({ timeout: 10_000 });
      log(`open locked card unlocked ${ms(confirmed)} ms after the check-in was confirmed (${ms(t0)} ms after the click)`);
      const banner = phone.getByRole('region', { name: /^Safety · / });
      await expect(banner).toBeVisible();
      await expect(banner).toContainText('allergic to tree nuts');
      await expect(banner).toContainText('Only me (Jordan) or Aunt Lena may pick Sam up.');

      await phone.getByRole('tab', { name: 'Moments', exact: true }).click();
      await phone.getByRole('group', { name: 'During' }).getByRole('button', { name: /^Worship/ }).click();
      await phone.getByRole('button', { name: 'Good moment', exact: true }).click();
      await expect(phone.getByText('Good moment saved', { exact: true }).first()).toBeVisible();
    });

    await test.step('7. Checkout at the station locks the card on the phone and clears it', async () => {
      await guideStep(page, 6).click();
      await page.waitForURL(/\/station\?/);
      const station = page.locator('main');
      await station.getByRole('button', { name: 'Check Sam out', exact: true }).click();
      await expect(station.getByRole('button', { name: 'Check Sam in', exact: true })).toBeVisible();
      await expect(station.getByText(/^Checked out /)).toBeVisible();
      const t0 = Date.now();
      await expect(phone.getByText(/^Locked · checked out /).first()).toBeVisible({ timeout: 30_000 });
      log(`card locked ${ms(t0)} ms after checkout`);
      await expect(phone.getByText(/tree nuts/)).toHaveCount(0);
    });

  } finally {
    await phoneContext.close();
  }

  await test.step('8. Hannah drafts the note home from the logged moment and approves it', async () => {
    await guideStep(page, 7).click();
    await page.waitForURL(/\/desk\/notes$/);
    await page.getByRole('tab', { name: /^9:00 service/ }).click();
    await page.locator('main').getByRole('button', { name: /^Sam\b/ }).click();
    await expect(page.getByRole('main').getByText('Worship', { exact: true }).first()).toBeVisible();
    await page.getByRole('main').getByRole('button', { name: 'Draft the note home', exact: true }).click();
    await expect(page.getByRole('main').getByText(NOTE_SENTENCE, { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('enclave-fixture-chip')).toBeVisible();
    await page.getByRole('main').getByRole('button', { name: 'Approve the note', exact: true }).click();
    await expect(page.getByText("Jordan can read it now on Sam's page.")).toBeVisible();
  });

  await test.step('9. The lesson call replays its recording too: the picture schedule is made and labelled', async () => {
    await page.getByRole('link', { name: 'Sunday pack', exact: true }).click();
    await page.waitForURL(/\/desk\/pack$/);
    await page.getByRole('button', { name: 'Make the picture schedule', exact: true }).click();
    await page.getByRole('button', { name: 'Replace and make', exact: true }).click();
    await expect(page.getByText('Made “Advent, week 1: Waiting with hope”')).toBeVisible();
    await expect(page.getByTestId('lesson-fixture-chip')).toHaveText('Test fixture — not a real model call');
  });

  await test.step('10. Jordan sees the note and who opened the card, while Sam was checked in', async () => {
    await switchPerson(page, 'Jordan', /\/parent\/[0-9a-f-]+$/);
    await expect(page.getByRole('region', { name: 'Notes from church', exact: true }).getByText(NOTE_SENTENCE, { exact: true })).toBeVisible();
    const opened = page
      .getByRole('region', { name: 'Who opened the card', exact: true })
      .getByRole('listitem')
      .filter({ hasText: `${buddy} opened Sam's card` })
      .filter({ hasText: 'while Sam was checked in' });
    await expect(opened).toHaveCount(1);
    await expect(opened).toBeVisible();
    await expect(page.getByText("That's a whole Sunday. Jordan can see the note and who opened Sam's card.")).toBeVisible({ timeout: 60_000 });
  });

  log(`loop done in ${Math.round(ms(started) / 1000)} s`);
});
