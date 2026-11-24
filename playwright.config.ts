import { defineConfig } from '@playwright/test';

// End-to-end: the full Sunday loop on a fresh demo church, against the real app and the dev database.
//
// Why `next dev` and not `next build && next start`: the model calls are replaced by the test seam
// (src/lib/testing/fixtureMode.ts), which is on only when NODE_ENV is not 'production'. `next build` inlines
// NODE_ENV as 'production', so a built app can never turn the seam on, by design. The dev server is the only way
// to run the real app with recorded model outputs, and Playwright always starts its own (never reuses one that
// might be running without the flag and would call the paid models).
//
// Chromium is launched with channel 'chromium' (the full build): the default headless shell crashes when a page
// loads the Intel quote verifier.
const PORT = 3100;

export default defineConfig({
  testDir: 'tests/e2e',
  // The remote dev database answers in 200–1600 ms per query, so one loop takes minutes.
  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chromium',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 30_000,
    navigationTimeout: 120_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { PLAYWRIGHT_ENCLAVE_FIXTURE: '1' },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
