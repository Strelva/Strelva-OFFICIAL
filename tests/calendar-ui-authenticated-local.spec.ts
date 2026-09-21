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

test("authenticated schedule controls show provider discovery, conflict recovery and responsive keyboard use", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "calendar-ui");
  let workspaceId = "";
  try {
    const workspaceResponse = await owner.context.request.get("/api/workspace");
    expect(workspaceResponse.status(), await workspaceResponse.text()).toBe(200);
    workspaceId = (await workspaceResponse.json()).workspaceId;
    let schedule = await post(owner.context.request, "/api/bounded-work", {
      action: "create", productId: "scheduling", workspaceId,
      input: { title: "Calendar UI proof", availability: [{ start: "2026-09-20T09:00:00Z", end: "2026-09-20T12:00:00Z" }] },
    }, 201);
    schedule = await post(owner.context.request, "/api/bounded-work", {
      action: "command", productId: "scheduling", workId: schedule.id,
      command: { kind: "reserve", expectedRevision: schedule.payload.revision, requestId: "calendar-ui-proof-1", title: "UI proof appointment", start: "2026-09-20T09:00:00Z", end: "2026-09-20T10:00:00Z" },
    });
    const connection = await admin.from("workspace_calendar_connections").upsert({
      workspace_id: workspaceId, provider: "outlook", calendar_id: "fixture-calendar", calendar_name: "Synthetic Outlook", time_zone: "America/New_York", status: "connected", scopes: ["Calendars.ReadWrite"], access_token_ciphertext: "synthetic-access", reminder_policy: { mode: "provider_default" }, created_by: owner.userId,
    }, { onConflict: "workspace_id,provider" });
    expect(connection.error).toBeNull();

    const unknownPayload = structuredClone(schedule.payload);
    unknownPayload.reservations[0] = { ...unknownPayload.reservations[0], status: "unknown", provider: "outlook", providerId: "fixture-calendar-ui", verification: "failed", syncOperation: "create", syncError: "Provider confirmation could not be read back." };
    const acceptedPayload = structuredClone(unknownPayload);
    acceptedPayload.revision += 1;
    acceptedPayload.reservations[0] = { ...acceptedPayload.reservations[0], status: "accepted", verification: "verified", syncError: undefined };
    let boundedMode: "server" | "unknown" | "accepted" = "server";
    const writes: Array<Record<string, unknown>> = [];
    const page = await owner.context.newPage();
    await page.route("**/api/bounded-work**", async route => {
      if (route.request().method() !== "GET" || boundedMode === "server") return route.continue();
      const payload = boundedMode === "unknown" ? unknownPayload : acceptedPayload;
      return route.fulfill({ json: { id: schedule.id, workspaceId, payload } });
    });
    await page.route("**/api/workspace/calendar-events", async route => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      writes.push(body);
      if (body.action === "create") return route.fulfill({ status: 409, json: { error: "Provider reports a conflict for this time." } });
      if (body.action === "recover") return route.fulfill({ json: { id: schedule.id, workspaceId, payload: acceptedPayload } });
      return route.continue();
    });

    await page.goto(`/workspace?workspaceId=${workspaceId}&work=${schedule.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Calendar sync", exact: true })).toBeVisible();
    await expect(page.getByText("Synthetic Outlook", { exact: true })).toBeVisible();
    const outlook = page.getByRole("article").filter({ hasText: "Microsoft Outlook" });
    await outlook.getByRole("button", { name: "Choose calendar", exact: true }).click();
    await expect(outlook.getByRole("heading", { name: "Calendar settings", exact: true })).toBeVisible();
    await expect(outlook.locator("select").first()).toHaveValue("fixture-calendar");
    await outlook.getByRole("button", { name: "Cancel", exact: true }).click();

    const sync = page.getByRole("button", { name: "Sync reservation", exact: true });
    await sync.focus();
    await expect(sync).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert").filter({ hasText: "We could not confirm the change. Check the calendar before trying again." })).toBeVisible();
    expect(writes).toEqual([expect.objectContaining({ action: "create", requestId: "calendar-ui-proof-1" })]);

    boundedMode = "unknown";
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Check the calendar", exact: true })).toBeVisible();
    boundedMode = "accepted";
    await page.getByRole("button", { name: "Check the calendar", exact: true }).click();
    await expect.poll(() => writes.filter(item => item.action === "recover")).toHaveLength(1);
    await expect(page.getByLabel("External calendar sync").getByText("Outlook confirmed this reservation.", { exact: true })).toBeVisible();

    const workspaceScroll = page.locator("[data-frame-main] > div").first();
    await workspaceScroll.evaluate((element) => element.scrollTo({ top: 0, left: 0 }));
    await page.screenshot({ path: "/tmp/strelva-calendar-desktop-top.png" });
    await page.screenshot({ path: "/tmp/strelva-calendar-desktop.png" });
    await page.getByRole("heading", { name: "Calendar sync", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/strelva-calendar-desktop-calendar.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.locator("[data-frame-main]").evaluate(element => Math.round(element.getBoundingClientRect().x))).toBe(0);
    await expect.poll(() => page.evaluate(() => [
      document.querySelector("[data-frame-main]"),
      document.querySelector("[data-frame-main] > div"),
      document.querySelector("[aria-label='External calendar sync']"),
    ].every(element => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= window.innerWidth + 1;
    }))).toBe(true);
    await expect.poll(() => workspaceScroll.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const starts = page.getByLabel("Starts", { exact: true });
    await starts.focus();
    await expect(starts).toBeFocused();
    await expect.poll(() => starts.evaluate(element => element.getBoundingClientRect().right <= innerWidth)).toBe(true);
    await workspaceScroll.evaluate((element) => element.scrollTo({ top: 0, left: 0 }));
    await page.screenshot({ path: "/tmp/strelva-calendar-mobile-top.png" });
    await page.getByRole("heading", { name: "Calendar sync", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/strelva-calendar-mobile-calendar.png" });
    await expect(page.getByRole("heading", { name: "Calendar connections", exact: true })).toBeVisible();
    await page.screenshot({ path: "/tmp/strelva-calendar-mobile.png" });
  } finally {
    if (workspaceId) await admin.from("workspaces").delete().eq("id", workspaceId);
    await admin.auth.admin.deleteUser(owner.userId);
    await owner.context.close();
  }
});
