import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { agencyWorkflow } from "./support/agency-workflow";
import { neutralSignUp } from "./support/neutral-agency";
import { localEnvironment } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres.");
test.setTimeout(360_000);
test.use({ actionTimeout: 120_000, navigationTimeout: 120_000 });

if (process.env.STRELVA_AGENCY_ADD_CLIENT_RELEASE === "1") {
  test("neutral agency signup, unverified refusals, exact owner approval, provider switch and agency payer", async ({ browser }, testInfo) => {
    await agencyWorkflow(browser, testInfo, true);
  });
} else {
  test("flags off preserve ordinary accounts and deny new client effects without creating work", async ({ browser }, testInfo) => {
    const env = localEnvironment();
    const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
    const agency = await neutralSignUp(browser, "neutral-off");
    let workspaceId: string | null = null;
    try {
      const headers = { origin: env.app };
      const created = await agency.context.request.post("/api/workspace", { headers, data: { action: "create_agency", name: "Ordinary Agency, Flags Off" } });
      expect(created.status(), await created.text()).toBeLessThan(300);
      workspaceId = (await created.json()).workspaceId;
      expect((await agency.context.request.post("/api/workspace/agency-clients", { headers, data: { agencyWorkspaceId: workspaceId, businessName: "Must not exist" } })).status()).toBe(503);
      expect((await agency.context.request.post("/api/websites/rebuild", { headers, data: { workspaceId, requestId: "disabled", businessName: "Must not exist" } })).status()).toBe(503);
      expect((await agency.context.request.get(`/api/workspace/agency-team?workspaceId=${workspaceId}`)).status()).toBe(503);
      expect((await admin.from("saved_product_work").select("id").eq("workspace_id", workspaceId)).data).toEqual([]);
      expect((await admin.from("super_admins").select("user_id").eq("user_id", agency.userId)).data).toEqual([]);
      const page = await agency.context.newPage();
      await page.goto("/workspace/account");
      await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("neutral-flags-off-account-desktop.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("neutral-flags-off-account-390.png"), fullPage: true });
    } finally {
      if (workspaceId) await admin.from("workspaces").delete().eq("id", workspaceId);
      await agency.context.close();
      await admin.auth.admin.deleteUser(agency.userId);
    }
  });
}
