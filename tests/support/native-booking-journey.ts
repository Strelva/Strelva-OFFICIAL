import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expect } from "@playwright/test";
import { createSupabaseSystemStore } from "@/platform/systems/supabase-store";
import { newBookingAccess } from "@/platform/bookings/native";
import { decryptSecret } from "@/platform/infra/crypto/secrets";
import { localEnvironment } from "./local-auth";
import type { Person } from "./journeys";

/** Real Auth + native producers; no booking, decision, token or history INSERT.
 * Setup is an explicit native adapter fixture, not proof of a public setup UI
 * or delivered customer mail. Only owned local stacks may call this helper.
 */
export async function nativeBookingJourney(owner: Person, admin: SupabaseClient, workspaceId: string) {
  localEnvironment();
  expect(process.env.STRELVA_LOCAL_AUTH_PROOF).toBe("1");
  for (const key of ["STRELVA_BOOKING_MANUAL", "STRELVA_BOOKING_MESSAGES", "STRELVA_BOOKING_MANAGE_PAGE"]) expect(process.env[key], key).toBe("1");
  expect(process.env.EMAIL_SENDING_ENABLED).toBe("false");
  expect(process.env.CUSTOMER_EMAIL_ENABLED).toBe("false");
  const actor = { userId: owner.userId, verifiedEmail: owner.email };
  async function rpc(name: string, args: Record<string, unknown>) {
    const result = await admin.rpc(name, args);
    expect(result.error, name).toBeNull();
    return result.data;
  }
  async function post(path: string, data: unknown, status = 200) {
    const response = await owner.context.request.post(path, { headers: { origin: localEnvironment().app }, data });
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
  }
  const serviceId = randomUUID();
  const record = await rpc("read_business_record", { p_workspace_id: workspaceId, p_user_id: owner.userId, p_verified_email: owner.email });
  const patch = { facts: {
    display_name: { value: "Native booking journey" },
    owner_recipient: { value: { email: owner.email, name: "Booking owner" } },
    hours: { value: { timezone: "UTC", weekly: Array.from({ length: 7 }, (_, day) => ({ day, opens: "09:00", closes: "17:00" })) } },
  }, services: [{ op: "upsert", id: serviceId, name: "Site visit", durationMinutes: 60, active: true }] };
  await rpc("patch_business_record", { p_workspace_id: workspaceId, p_user_id: owner.userId, p_verified_email: owner.email,
    p_source: "owner", p_expected_revision: record.revision, p_patch: patch, p_command_id: randomUUID(),
    p_command_digest: createHash("sha256").update(JSON.stringify(patch)).digest("hex") });
  const factsResponse = await owner.context.request.get(`/api/workspace/needs-you?workspaceId=${workspaceId}`);
  expect(factsResponse.status(), await factsResponse.text()).toBe(200);
  const facts = (await factsResponse.json()).items.find((item: { sourceLifecycle: string; sourceId: string }) => item.sourceLifecycle === "business_facts" && item.sourceId === workspaceId);
  expect(facts, "Actual owner confirmation of the record and service").toBeTruthy();
  expect((await post("/api/workspace/needs-you", { workspaceId, itemId: facts.id, revision: facts.revisionHash, decision: "approve" })).status).toBe("done");
  const systems = createSupabaseSystemStore(admin);
  const draft = await systems.createSystem(actor, workspaceId, { name: "Bookings", kind: "booking" }, randomUUID());
  const ref = { businessId: workspaceId, systemId: draft.id };
  const revision = await systems.recordRevision(actor, ref, draft.changeNumber, { implementation: { kind: "booking", ref: "native-bookings" }, summary: "Owned local native booking fixture" }, randomUUID());
  const live = await systems.transitionLifecycle(actor, ref, revision.system.changeNumber, "live");
  expect(live.lifecycle).toBe("live");
  const scope = `workspace:${workspaceId}`;
  const context = await rpc("read_tenant_booking_context", { p_tenant_id: scope });
  expect(context).toMatchObject({ workspaceId, calendarKey: workspaceId, tenantStableId: null, systemId: draft.id, paused: false });
  const configured = await post("/api/workspace/bookings/settings", { workspaceId, expectedRevision: context.settings?.revision ?? 0,
    mode: "request", bufferMinutes: 0, minNoticeMinutes: 0, maxAdvanceDays: 14, maxPerDay: null, cancellationCutoffHours: 24 });
  expect(configured.revision).toBeGreaterThan(0);
  const day = new Date(); day.setUTCDate(day.getUTCDate() + 3); day.setUTCHours(10, 0, 0, 0);
  const at = (hours: number, minutes = 0) => { const value = new Date(day); value.setUTCHours(hours, minutes, 0, 0); return value.toISOString(); };
  const read = () => rpc("read_tenant_bookings", { p_tenant_id: scope, p_from: null, p_to: null });
  const history = (id: string) => rpc("read_tenant_booking_history", { p_tenant_id: scope, p_ref: id });
  function input(requestId: string, hour: number, name: string, minutes = 0) { return { workspaceId, serviceId, start: at(hour, minutes), requestId, customer: { name, email: `${requestId}@example.test` } }; }
  async function reserve(requestId: string, hour: number, name: string) {
    const data = input(requestId, hour, name);
    const created = await post("/api/workspace/bookings/manual", data, 201);
    expect(created).toMatchObject({ created: true, booking: { status: "requested", origin: "owner", start: at(hour) } });
    const again = await post("/api/workspace/bookings/manual", data, 201);
    expect(again).toMatchObject({ created: false, booking: { id: created.booking.id } });
    expect(await history(created.booking.id)).toHaveLength(1);
    return created.booking;
  }
  async function approve(id: string) {
    const response = await owner.context.request.get(`/api/workspace/needs-you?workspaceId=${workspaceId}`);
    expect(response.status(), await response.text()).toBe(200);
    const item = (await response.json()).items.find((entry: { sourceLifecycle: string; sourceId: string }) => entry.sourceLifecycle === "booking_request" && entry.sourceId === id);
    expect(item, "Owner decides this exact native booking request").toBeTruthy();
    expect((await post("/api/workspace/needs-you", { workspaceId, itemId: item.id, revision: item.revisionHash, decision: "approve" })).status).toBe("done");
    expect((await read()).find((booking: { id: string }) => booking.id === id)).toMatchObject({ id, status: "confirmed" });
  }
  async function managementToken(id: string) {
    // Invoke the actual encrypted token issuer. The sink is this owned fixture;
    // this makes no assertion about delivery to a customer's mailbox.
    const access = await rpc("issue_booking_access", { p_tenant_id: scope, p_ref: id, p_access: newBookingAccess() });
    const token = decryptSecret(access.manage_ciphertext);
    if (!token) throw new Error("The native booking management token could not be decrypted.");
    return token;
  }
  async function manage(token: string, action: "cancel" | "reschedule", slotId?: string, error?: string) {
    const response = await owner.context.request.post(`/b/${token}/action`, { headers: { origin: localEnvironment().app },
      form: { action, ...(slotId ? { slotId } : {}) }, maxRedirects: 0 });
    expect(response.status(), await response.text()).toBe(303);
    const rawLocation = response.headers().location;
    if (!rawLocation) throw new Error("Native booking manage response omitted Location.");
    const location = new URL(rawLocation, localEnvironment().app);
    expect(location.pathname).toBe(`/b/${token}`);
    if (error) expect(location.searchParams.get("error")).toBe(error);
    else { expect(location.searchParams.has("error")).toBe(false); expect(location.searchParams.get("done")).toBe(action === "cancel" ? "cancelled" : "pending"); }
  }
  async function conflict(hour: number, minutes = 0) {
    await post("/api/workspace/bookings/manual", input(`conflict-${randomUUID().slice(0, 8)}`, hour, "Conflicting visit", minutes), 409);
  }
  return { at, read, history, reserve, approve, managementToken, manage, conflict };
}
