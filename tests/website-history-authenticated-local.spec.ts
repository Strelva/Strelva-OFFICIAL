import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1" || process.env.STRELVA_HISTORY_STORE_UNAVAILABLE_PROOF !== "1", "Requires isolated local Auth and intentionally absent Redis.");
test.setTimeout(90_000);

test("website owner can reopen unavailable history without a false empty result", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "website-history-owner");
  const tenant = `history-${randomUUID().slice(0, 8)}`;
  try {
    expect((await admin.from("tenants").insert({ id: tenant, site_name: "Lakeside Repair", owner_name: "History owner", owner_email: owner.email, active: true })).error).toBeNull();
    expect((await admin.from("memberships").insert({ user_id: owner.userId, tenant_id: tenant, role: "owner" })).error).toBeNull();
    const page = await owner.context.newPage();
    const path = `/client/${tenant}/dashboard/history?request=evt_saved_request`;
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "History & safety", exact: true })).toBeVisible();
      await expect(page.getByText("Website request history is temporarily unavailable.", { exact: true })).toBeVisible();
      await expect(page.getByText("Site check history is temporarily unavailable.", { exact: true })).toBeVisible();
      await expect(page.getByText("No website requests have been recorded yet.", { exact: false })).toHaveCount(0);
      await expect(page.getByText("No canonical site check has been recorded yet.", { exact: false })).toHaveCount(0);
      const retry = page.getByRole("link", { name: "Reload history", exact: true }).first();
      await expect(retry).toHaveAttribute("href", path);
      await retry.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByText("Website request history is temporarily unavailable.", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByText("Site check history is temporarily unavailable.", { exact: true }).scrollIntoViewIfNeeded();
      await expect(page.getByText("Site check history is temporarily unavailable.", { exact: true })).toBeInViewport();
      await page.screenshot({ path: `/tmp/strelva-website-history-unavailable-${width}.png`, fullPage: true });
    }
  } finally {
    await owner.context.close();
    await admin.from("tenants").delete().eq("id", tenant);
    await admin.auth.admin.deleteUser(owner.userId);
  }
});
