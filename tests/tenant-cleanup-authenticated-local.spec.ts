import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminClient, cleanup, forgetTenantCache, makeOperator, noHorizontalOverflow, person } from "./support/journeys";
import { localEnvironment } from "./support/local-auth";

// Source fixture only: execute in the coordinator's existing disposable Auth/app
// window with real forward SQL and both Vercel tokens absent on server AND runner.
// Actual provider-disabled partial behavior is expected, never mocked acceptance.
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1" || process.env.STRELVA_TENANT_CLEANUP_UI_PROOF !== "1", "Requires coordinator-owned local Auth, migrated DB, app and disabled provider window.");
test.setTimeout(240_000);

for (const width of [1440, 390]) {
  test(`real super-admin retains pending removal and retries the exact native receipt at ${width}px`, async ({ browser }, testInfo) => {
    const env = localEnvironment();
    expect(process.env.VERCEL_API_TOKEN || process.env.VERCEL_TOKEN || "", "Run app and runner with Vercel disabled").toBe("");
    const admin = adminClient();
    const operator = await person(browser, admin, `cleanup-operator-${width}`, { viewport: { width, height: 900 } });
    const stranger = await person(browser, admin, `cleanup-stranger-${width}`);
    const tenantId = `cleanup-ui-${randomUUID().slice(0, 8)}`;
    const endpoint = `/api/admin/tenants/${tenantId}/deprovision`;
    try {
      await makeOperator(admin, operator);
      expect((await admin.from("tenants").insert({ id: tenantId, site_name: `Cleanup UI fictional ${width}`, active: true, owner_email: stranger.email })).error).toBeNull();
      await forgetTenantCache();
      // Tenant owner email is not super-admin cleanup authority.
      expect((await stranger.context.request.get(endpoint)).status()).toBe(403);
      expect((await stranger.context.request.post(endpoint, { headers: { origin: env.app }, data: { confirmSlug: tenantId } })).status()).toBe(403);
      const page = await operator.context.newPage();
      await page.goto(`/admin/clients/${tenantId}`);
      const remove = page.getByRole("button", { name: "Permanently delete this tenant", exact: true });
      await expect(remove).toBeVisible(); await expect(remove).toBeDisabled();
      const typed = remove.locator("xpath=..").getByRole("textbox");
      await expect(typed).toHaveAttribute("placeholder", tenantId);
      await typed.fill(`${tenantId}-wrong`); await expect(remove).toBeDisabled();
      await typed.fill(tenantId); await expect(remove).toBeEnabled();
      const pendingResponse = page.waitForResponse(response => new URL(response.url()).pathname === endpoint && response.request().method() === "POST");
      await remove.focus(); await expect(remove).toBeFocused(); await remove.click();
      const response = await pendingResponse;
      expect(response.status(), await response.text()).toBe(202);
      const pending = await response.json();
      expect(pending).toMatchObject({ ok: false, databaseDeleted: true, cleanup: { tenantId, providerComplete: false, complete: false, slugReusable: false } });
      expect((await admin.from("tenants").select("id").eq("id", tenantId)).data).toEqual([]);
      const retry = page.getByRole("button", { name: "Retry pending cleanup", exact: true });
      await expect(retry).toBeVisible(); await expect(retry).toBeEnabled();
      await expect(page.getByText("The database removal committed.", { exact: false })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/admin/clients/${tenantId}$`));
      await noHorizontalOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`tenant-cleanup-pending-${width}.png`), fullPage: true });
      const retryResponse = page.waitForResponse(value => new URL(value.url()).pathname === endpoint && value.request().method() === "POST");
      await retry.focus(); await expect(retry).toBeFocused(); await retry.click();
      const retried = await retryResponse;
      expect(retried.request().postDataJSON()).toEqual({ action: "retry-cleanup", confirmSlug: tenantId, cleanupReceiptId: pending.cleanup.id });
      expect(retried.status(), await retried.text()).toBe(202);
      const after = await retried.json();
      expect(after.cleanup.id).toBe(pending.cleanup.id);
      expect(after.cleanup.revision).toBeGreaterThan(pending.cleanup.revision);
      expect(after).toMatchObject({ ok: false, databaseDeleted: true, cleanup: { providerComplete: false, complete: false } });
      await expect(retry).toBeVisible();
      await expect(page.getByRole("link", { name: "Open cleanup recovery", exact: true })).toHaveAttribute("href", `/admin/tenant-cleanup/${tenantId}`);
      // Reload the deleted tenant's original editor URL. The server now routes
      // to a standalone recovery page backed by the actual authenticated GET.
      const reloadRead = page.waitForResponse(value => new URL(value.url()).pathname === endpoint && value.request().method() === "GET");
      await page.reload();
      await expect(page).toHaveURL(new RegExp(`/admin/tenant-cleanup/${tenantId}$`));
      await expect(page.getByRole("heading", { name: "Tenant cleanup", exact: true })).toBeVisible();
      expect((await reloadRead).status()).toBe(200);
      await expect(page.getByText(pending.cleanup.id, { exact: true })).toBeVisible();
      const recoveredRetry = page.getByRole("button", { name: "Retry pending cleanup", exact: true });
      await expect(recoveredRetry).toBeDisabled();
      await page.getByLabel(`Type ${tenantId} to confirm cleanup retry`, { exact: true }).fill(tenantId);
      await expect(recoveredRetry).toBeEnabled();
      const recoveredPost = page.waitForResponse(value => new URL(value.url()).pathname === endpoint && value.request().method() === "POST");
      await recoveredRetry.focus(); await expect(recoveredRetry).toBeFocused(); await recoveredRetry.click();
      const recoveryResponse = await recoveredPost;
      expect(recoveryResponse.request().postDataJSON()).toEqual({ action: "retry-cleanup", confirmSlug: tenantId, cleanupReceiptId: pending.cleanup.id });
      expect(recoveryResponse.status(), await recoveryResponse.text()).toBe(202);
      const afterReload = await recoveryResponse.json();
      expect(afterReload.cleanup.revision).toBeGreaterThan(after.cleanup.revision);
      expect(afterReload.cleanup).toMatchObject({ id: pending.cleanup.id, providerComplete: false, complete: false });
      await expect(page.getByText("Cleanup is still pending. The receipt has been saved; retry when the remaining stores are available.", { exact: true })).toBeVisible();
      await noHorizontalOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`tenant-cleanup-reloaded-${width}.png`), fullPage: true });
      const deniedPage = await stranger.context.newPage();
      await deniedPage.goto(`/admin/tenant-cleanup/${tenantId}`);
      await expect(deniedPage).not.toHaveURL(new RegExp(`/admin/tenant-cleanup/${tenantId}$`));
      await expect(deniedPage.getByRole("heading", { name: "Tenant cleanup", exact: true })).toHaveCount(0);
      await deniedPage.close();
      const recovered = await operator.context.request.get(endpoint);
      expect(recovered.status(), await recovered.text()).toBe(200);
      expect(recovered.headers()["cache-control"]).toBe("private, no-store");
      expect((await recovered.json()).cleanup).toMatchObject({ id: pending.cleanup.id, revision: afterReload.cleanup.revision, complete: false });
      const native = await admin.rpc("tenant_cleanup_receipt", { p_slug: tenantId });
      expect(native.error).toBeNull();
      expect(native.data).toMatchObject({ id: pending.cleanup.id, revision: afterReload.cleanup.revision, providerComplete: false, complete: false });
      expect((await stranger.context.request.get(endpoint)).status()).toBe(403);
      expect((await stranger.context.request.post(endpoint, { headers: { origin: env.app }, data: { action: "retry-cleanup", confirmSlug: tenantId, cleanupReceiptId: pending.cleanup.id } })).status()).toBe(403);
      const insert = await admin.from("tenants").insert({ id: tenantId, site_name: "Unsafe reuse fictional" });
      expect(insert.error?.message).toContain("tenant_slug_retired");
      await testInfo.attach("native-pending-cleanup", { body: JSON.stringify({ pending: pending.cleanup, after: after.cleanup, afterReload: afterReload.cleanup, recovered: native.data }, null, 2), contentType: "application/json" });
    } finally {
      // Leave the native receipt/fence in this disposable stack. Never clear
      // retained history or weaken authority just to make fixture teardown green.
      await cleanup(admin, { tenantIds: [tenantId], people: [operator, stranger] });
    }
  });
}
