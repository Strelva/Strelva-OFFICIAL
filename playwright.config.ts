import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT || "3100";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${port}`;
const useBuiltApp = process.env.PLAYWRIGHT_BUILT_APP === "1";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  workers: 1,
  // Absorb the occasional cold-compile / dev-server hiccup in CI (a real failure
  // still fails all retries). Local runs get 0 so flakiness stays visible.
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: useBuiltApp
          ? `pnpm exec next start --port ${port}`
          : `PLAYWRIGHT_DIST_DIR=.next-playwright pnpm exec next dev --port ${port}`,
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        // Cold Turbopack `next dev` compile-on-first-request on a CI runner can
        // exceed the old 120s; the app has grown (auth dual-path, Supabase
        // clients). Give the readiness probe room so the job does not flake.
        timeout: 240_000,
      },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
