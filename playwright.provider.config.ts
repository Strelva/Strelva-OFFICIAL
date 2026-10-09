import { defineConfig } from "@playwright/test";

// Explicit isolated future-run config. It grants no provider/client/spend permission.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";
process.env.STRELVA_PROVIDER_PROOF_CONFIG = "held-provider-v1";
export default defineConfig({
  testDir: "./tests",
  testMatch: ["home-finder-authenticated-local.spec.ts", "sandbox-application-authenticated-local.spec.ts"],
  workers: 1, fullyParallel: false, retries: 0, repeatEach: 1, maxFailures: 1,
  reporter: [["./tests/support/provider-redacted-reporter.ts"]],
  use: { trace: "off", screenshot: "off", video: "off" },
  // Never starts a server or provisions an account/provider.
});
