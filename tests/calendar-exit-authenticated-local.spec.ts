import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(
  process.env.STRELVA_LOCAL_AUTH_PROOF !== "1" || process.env.STRELVA_CALENDAR_JOURNEY !== "1",
  "Requires the isolated local Auth/Postgres stack and the explicit synthetic calendar provider flag.",
);
test.setTimeout(120_000);

async function post(request: APIRequestContext, path: string, data: unknown, status = 200) {
  const response = await request.post(path, { headers: { origin: localEnvironment().app, "sec-fetch-site": "same-origin" }, data });
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}

test("stopped owners can read back and cancel an accepted calendar event while new changes stay blocked", async ({ browser }, testInfo) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "calendar-exit");
  let workspaceId = "";
  let scheduleId = "";
  const requestId = "calendar-exit-proof-1";
  try {
    const workspaceResponse = await owner.context.request.get("/api/workspace");
    expect(workspaceResponse.status(), await workspaceResponse.text()).toBe(200);
    workspaceId = (await workspaceResponse.json()).workspaceId;

    let schedule = await post(owner.context.request, "/api/bounded-work", {
      action: "create", productId: "scheduling", workspaceId,
      input: { title: "Calendar exit proof", availability: [{ start: "2026-09-20T09:00:00Z", end: "2026-09-20T12:00:00Z" }] },
    }, 201);
    scheduleId = schedule.id;
    schedule = await post(owner.context.request, "/api/bounded-work", {
      action: "command", productId: "scheduling", workId: scheduleId,
      command: { kind: "reserve", expectedRevision: schedule.payload.revision, requestId, title: "Exit proof appointment", start: "2026-09-20T09:00:00Z", end: "2026-09-20T10:00:00Z" },
    });

    const connection = await admin.from("workspace_calendar_connections").upsert({
      workspace_id: workspaceId, provider: "outlook", calendar_id: "fixture-calendar", calendar_name: "Synthetic Outlook", time_zone: "America/New_York", status: "connected", scopes: ["Calendars.ReadWrite"], access_token_ciphertext: "synthetic-access", reminder_policy: { mode: "provider_default" }, created_by: owner.userId,
    }, { onConflict: "workspace_id,provider" });
    expect(connection.error).toBeNull();

    schedule = await post(owner.context.request, "/api/workspace/calendar-events", { action: "create", workId: scheduleId, requestId, provider: "outlook" });
    expect(schedule.payload.reservations[0]).toMatchObject({ status: "accepted", provider: "outlook", verification: "verified" });

    const exit = await post(owner.context.request, "/api/workspace-exit", {
      workspaceId, futureWork: "cancel", providerParticipation: "keep", maintainedResources: { kind: "stop" }, idempotencyKey: "calendar-exit-proof-1",
    });
    expect(exit.state).toMatchObject({ status: "completed", futureWork: "cancelled", providerParticipation: "kept" });

    const blockedReschedule = await owner.context.request.post("/api/workspace/calendar-events", {
      headers: { origin: env.app, "sec-fetch-site": "same-origin" },
      data: { action: "reschedule", workId: scheduleId, requestId, provider: "outlook", expectedRevision: schedule.payload.revision, start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" },
    });
    expect(blockedReschedule.status(), await blockedReschedule.text()).toBe(409);
    expect((await blockedReschedule.json()).error).toMatch(/stopped for this workspace/i);

    const blockedCreate = await owner.context.request.post("/api/bounded-work", {
      headers: { origin: env.app, "sec-fetch-site": "same-origin" },
      data: { action: "command", productId: "scheduling", workId: scheduleId, command: { kind: "reserve", expectedRevision: schedule.payload.revision, requestId: "calendar-exit-proof-new", title: "Blocked after exit", start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" } },
    });
    expect(blockedCreate.status(), await blockedCreate.text()).toBe(409);
    expect((await blockedCreate.json()).error).toMatch(/stopped for this workspace/i);

    const page = await owner.context.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/workspace?workspaceId=${workspaceId}&work=${scheduleId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status", { name: "Workspace stopped" })).toBeVisible();
    const calendar = page.getByRole("region", { name: "External calendar sync" });
    await expect(calendar.getByText("Outlook confirmed this reservation.", { exact: true })).toBeVisible();
    const change = calendar.getByRole("button", { name: "Change synced time", exact: true });
    const cancel = calendar.getByRole("button", { name: "Cancel synced reservation", exact: true });
    expect(await change.isDisabled()).toBe(true);
    expect(await cancel.isDisabled()).toBe(false);

    await calendar.getByRole("button", { name: "Check Outlook availability", exact: true }).click();
    await expect(calendar.getByRole("status").filter({ hasText: "Outlook shows 1 busy event" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("calendar-exit-owner-desktop.png"), fullPage: true });

    const cancelResponsePromise = page.waitForResponse(response => response.url().includes("/api/workspace/calendar-events") && response.request().method() === "POST");
    await cancel.click();
    const cancelResponse = await cancelResponsePromise;
    expect(cancelResponse.status()).toBe(200);
    const cancelled = await cancelResponse.json();
    expect(cancelled.payload.reservations[0]).toMatchObject({ status: "cancelled", providerId: expect.stringMatching(/^fixture-/) });
    await expect(calendar.getByText("Cancelled", { exact: true })).toBeVisible();

    const receipt = await owner.context.request.get(`/api/workspace/calendar-events?workspaceId=${workspaceId}&workId=${scheduleId}&requestId=${requestId}&provider=outlook`);
    expect(receipt.status(), await receipt.text()).toBe(200);
    expect((await receipt.json()).receipt).toMatchObject({ operation: "delete", status: "verified" });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => {
      const main = document.querySelector("[data-frame-main]")?.getBoundingClientRect();
      return main ? { left: Math.round(main.left), right: Math.round(main.right), width: Math.round(main.width), innerWidth: window.innerWidth } : null;
    })).toMatchObject({ left: 0, right: 390, width: 390, innerWidth: 390 });
    await expect.poll(() => page.evaluate(() => [
      document.querySelector("[aria-label='Workspace stopped']"),
      document.querySelector("[aria-label='External calendar sync']"),
    ].every(element => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= window.innerWidth + 1;
    }))).toBe(true);
    await expect(page.getByRole("status", { name: "Workspace stopped" })).toBeVisible();
    await expect(calendar.getByText("Cancelled", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reserve in workspace", exact: true })).toBeDisabled();
    await page.getByRole("heading", { name: "Calendar sync", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("calendar-exit-owner-mobile-calendar.png") });
    await page.screenshot({ path: testInfo.outputPath("calendar-exit-owner-mobile.png"), fullPage: true });
  } finally {
    if (workspaceId) await admin.from("workspaces").delete().eq("id", workspaceId);
    await admin.auth.admin.deleteUser(owner.userId);
    await owner.context.close();
  }
});
