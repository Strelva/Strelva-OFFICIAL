import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires a separately created, isolated local Supabase Auth and database.");
test.setTimeout(90_000);

test("owner records a local exit choice through the real Auth route and can still review its retained state", async ({ browser }, testInfo) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "workspace-exit-owner");
  let workspaceId = "";
  try {
    const created = await admin.from("workspaces").insert({ kind: "customer", name: "Exit proof workspace", created_by: owner.userId }).select("id").single();
    expect(created.error).toBeNull();
    workspaceId = created.data!.id as string;
    const membership = await admin.from("workspace_memberships").insert({ workspace_id: workspaceId, user_id: owner.userId, role: "owner", created_by: owner.userId });
    expect(membership.error).toBeNull();

    const page = await owner.context.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    let failuresRemaining = 2;
    await page.route(/\/api\/workspace-exit(?:\?.*)?$/, async (route) => {
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Workspace exit is temporarily unavailable." }) });
        return;
      }
      await route.continue();
    });
    await page.goto(`/workspace/exit?workspaceId=${workspaceId}`);
    await expect(page.locator('[role="alert"]').filter({ hasText: "Workspace exit is temporarily unavailable." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Prepare to leave this workspace" })).toBeVisible();
    await expect(page.getByText(/Records stay available for export/)).toBeVisible();

    const cancel = page.getByRole("radio", { name: "Cancel new work" });
    await cancel.focus();
    await page.keyboard.press("Space");
    await expect(cancel).toBeChecked();
    await page.screenshot({ path: testInfo.outputPath("workspace-exit-desktop.png"), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("workspace-exit-mobile.png"), fullPage: true });
    const save = page.getByRole("button", { name: "Save exit choice" });
    await save.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "New work has been cancelled." })).toBeVisible();

    const exportPage = await owner.context.newPage();
    await exportPage.setViewportSize({ width: 390, height: 844 });
    await exportPage.goto(`/workspace/export?workspaceId=${workspaceId}`);
    await expect(exportPage.getByRole("heading", { name: "Download current workspace data" })).toBeVisible();
    expect(await exportPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const exportResponsePromise = exportPage.waitForResponse(response => response.url().includes("/api/workspace-export") && response.request().method() === "POST");
    const downloadPromise = exportPage.waitForEvent("download");
    await exportPage.getByRole("button", { name: "Download workspace JSON" }).click();
    const exportResponse = await exportResponsePromise;
    expect(exportResponse.status()).toBe(200);
    expect(exportResponse.headers()["content-disposition"]).toMatch(/^attachment; filename=/);
    const download = await downloadPromise;
    const downloadPath = await download.path();
    if (!downloadPath) throw new Error("Export download path unavailable");
    const snapshot = JSON.parse(await readFile(downloadPath, "utf8")) as { lifecycle?: { exit?: { status?: string } } };
    expect(snapshot.lifecycle?.exit?.status).toBe("completed");
    await expect(exportPage.getByText("Workspace JSON prepared. The export action was recorded without storing its contents.", { exact: true })).toBeVisible();
    await exportPage.close();
    await expect(page.getByText(/does not change billing or stop an outside provider service/)).toBeVisible();
    await expect(page.getByRole("link", { name: "review it in website billing settings" })).toHaveAttribute("href", "/dashboard/settings#plan");

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("link", { name: "Return to workspace" }).click();
    await expect(page).toHaveURL(new RegExp(`/workspace\\?workspaceId=${workspaceId}.*view=access`));
    await expect(page.getByRole("status", { name: "Workspace stopped" })).toBeVisible();
    const stoppedNewButton = page.getByRole("button", { name: "New" });
    if (await stoppedNewButton.count()) await expect(stoppedNewButton).toBeDisabled();
    await expect(page.getByRole("link", { name: "Review retained work" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Export retained records" })).toBeVisible();
    await page.screenshot({ path: "/tmp/strelva-workspace-exit-reopened-desktop.png", fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open navigation" }).click();
    const stoppedMobileNewButton = page.getByRole("button", { name: "New" });
    if (await stoppedMobileNewButton.count()) await expect(stoppedMobileNewButton).toBeDisabled();
    await expect(page.getByRole("status", { name: "Workspace stopped" })).toBeVisible();
    await page.screenshot({ path: "/tmp/strelva-workspace-exit-reopened-mobile.png", fullPage: true });
    await page.getByRole("button", { name: "Close navigation" }).click();
    await expect(page.getByRole("status", { name: "Workspace stopped" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => [
      document.querySelector("[data-frame-main]"),
      document.querySelector("[aria-label='Workspace stopped']"),
    ].every(element => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= window.innerWidth + 1;
    }))).toBe(true);
    await page.screenshot({ path: "/tmp/strelva-workspace-exit-reopened-mobile-closed.png", fullPage: true });

    const stored = await admin.rpc("read_workspace_exit_state", {
      p_workspace_id: workspaceId,
      p_user_id: owner.userId,
      p_verified_email: owner.email,
    });
    expect(stored.error).toBeNull();
    expect(stored.data).toMatchObject({ state: { status: "completed", futureWork: "cancelled", providerParticipation: "kept", maintainedResources: { kind: "stopped" } } });
    await page.reload();
    await expect(page.getByText(/Work in this workspace has stopped\.|Workspace status is temporarily unavailable\./)).toBeVisible();
  } finally {
    if (workspaceId) await admin.from("workspaces").delete().eq("id", workspaceId);
    await owner.context.close().catch(() => {});
    await admin.auth.admin.deleteUser(owner.userId).catch(() => {});
  }
});
