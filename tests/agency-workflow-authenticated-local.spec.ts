import { test } from "@playwright/test";
import { agencyWorkflow } from "./support/agency-workflow";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres.");
test.setTimeout(360_000);
test.use({ actionTimeout: 120_000, navigationTimeout: 120_000 });
test("ordinary agency adds a client, gets the owner's exact approval, publishes, and reads the receipt", async ({ browser }, testInfo) => {
  await agencyWorkflow(browser, testInfo);
});
