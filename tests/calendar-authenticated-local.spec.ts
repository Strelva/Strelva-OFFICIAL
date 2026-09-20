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

test("real Auth and Postgres carry a reservation through synthetic calendar create, change and cancel", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "calendar");
  let workspaceId = "";
  try {
    const workspaceResponse = await owner.context.request.get("/api/workspace");
    expect(workspaceResponse.status(), await workspaceResponse.text()).toBe(200);
    workspaceId = (await workspaceResponse.json()).workspaceId;
    let schedule = await post(owner.context.request, "/api/bounded-work", {
      action: "create", productId: "scheduling", workspaceId,
      input: { title: "Consultations", availability: [{ start: "2026-09-20T09:00:00Z", end: "2026-09-20T12:00:00Z" }] },
    }, 201);
    schedule = await post(owner.context.request, "/api/bounded-work", {
      action: "command", productId: "scheduling", workId: schedule.id,
      command: { kind: "reserve", expectedRevision: schedule.payload.revision, requestId: "calendar-proof-1", title: "Roof inspection", start: "2026-09-20T09:00:00Z", end: "2026-09-20T10:00:00Z" },
    });
    const connection = await admin.from("workspace_calendar_connections").upsert({
      workspace_id: workspaceId, provider: "outlook", calendar_id: "fixture-calendar", calendar_name: "Synthetic Outlook", time_zone: "America/New_York", status: "connected", scopes: ["Calendars.ReadWrite"], access_token_ciphertext: "synthetic-access", reminder_policy: { mode: "provider_default" }, created_by: owner.userId,
    }, { onConflict: "workspace_id,provider" });
    expect(connection.error).toBeNull();
    schedule = await post(owner.context.request, "/api/workspace/calendar-events", { action: "create", workId: schedule.id, requestId: "calendar-proof-1", provider: "outlook" });
    expect(schedule.payload.reservations[0]).toMatchObject({ status: "accepted", provider: "outlook", providerId: expect.stringMatching(/^fixture-/), verification: "verified" });
    schedule = await post(owner.context.request, "/api/workspace/calendar-events", { action: "reschedule", workId: schedule.id, requestId: "calendar-proof-1", provider: "outlook", expectedRevision: schedule.payload.revision, start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" });
    expect(schedule.payload.reservations[0]).toMatchObject({ status: "accepted", start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" });
    schedule = await post(owner.context.request, "/api/workspace/calendar-events", { action: "cancel", workId: schedule.id, requestId: "calendar-proof-1", provider: "outlook", expectedRevision: schedule.payload.revision });
    expect(schedule.payload.reservations[0]).toMatchObject({ status: "cancelled", providerId: expect.stringMatching(/^fixture-/) });
    const receipt = await owner.context.request.get(`/api/workspace/calendar-events?workspaceId=${workspaceId}&workId=${schedule.id}&requestId=calendar-proof-1&provider=outlook`);
    expect(receipt.status(), await receipt.text()).toBe(200);
    expect((await receipt.json()).receipt).toMatchObject({ externalEventId: expect.stringMatching(/^fixture-/), operation: "delete", status: "verified" });
  } finally {
    if (workspaceId) await admin.from("workspaces").delete().eq("id", workspaceId);
    await admin.auth.admin.deleteUser(owner.userId);
    await owner.context.close();
  }
});
