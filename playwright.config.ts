import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT || "3100";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${port}`;
const useBuiltApp = process.env.PLAYWRIGHT_BUILT_APP === "1";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL,
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
        timeout: 120_000,
      },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
