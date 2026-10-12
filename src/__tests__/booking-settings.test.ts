import { describe, expect, it, vi } from "vitest";
import { bookingSettingsChange, changeBookingSettings, readBookingSettings, bookingSettingsAdapter, type BookingSettingsPorts } from "@/platform/bookings/setup";

const actor = { userId: "ca000000-0000-4000-8000-0000000000e2", verifiedEmail: "owner@example.test" };
const input = { workspaceId: "ca000000-0000-4000-8000-000000000001", tenantId: "fixture", expectedRevision: 2,
  mode: "instant" as const, bufferMinutes: 15, minNoticeMinutes: 240, maxAdvanceDays: 60, maxPerDay: 5, cancellationCutoffHours: 24 };
const policy = { id: "ca000000-0000-4000-8000-000000000002", workspaceId: input.workspaceId, tenantId: input.tenantId,
  revision: 1, settingsRevision: 3, siteName: "Fixture Firm", status: "proposed" };

describe("booking-only setup and standing approval", () => {
  it("does no persistence work while setup is disabled", async () => {
    const ports = { enabled: async () => false, rpc: vi.fn() };
    await expect(readBookingSettings(actor, input.workspaceId, input.tenantId, ports)).rejects.toMatchObject({ code: "unavailable" });
    await expect(changeBookingSettings(actor, input, ports)).rejects.toMatchObject({ code: "unavailable" });
    expect(ports.rpc).not.toHaveBeenCalled();
  });
  it("binds every write to verified actor, business, tenant and settings revision", async () => {
    const ports = { enabled: async () => true, rpc: vi.fn(async () => ({ approvalRequired: true })) };
    expect(await changeBookingSettings(actor, input, ports)).toEqual({ approvalRequired: true });
    expect(ports.rpc).toHaveBeenCalledWith("configure_booking_setup", { p_workspace_id: input.workspaceId, p_tenant_id: input.tenantId,
      p_user_id: actor.userId, p_email: actor.verifiedEmail, p_settings: input });
    expect(bookingSettingsChange.safeParse({ ...input, bufferMinutes: -1 }).success).toBe(false);
    expect(bookingSettingsChange.safeParse({ ...input, maxAdvanceDays: 61 }).success).toBe(false);
  });
  it("instant mode becomes Running approval; stale policy never executes", async () => {
    const rpc = vi.fn(async (name: string) => name === "read_booking_instant_policies" ? [policy] : { status: "updated" });
    const ports: BookingSettingsPorts = { enabled: async () => true, rpc };
    const adapter = bookingSettingsAdapter(ports);
    const ctx = { workspaceId: input.workspaceId };
    const proposed = (await adapter.propose(ctx)).items[0]!;
    expect(proposed).toMatchObject({ kind: "running.approve", route: "owner_decides", adminMayDecide: false });
    const item = { ...proposed, id: "decision" } as Parameters<typeof adapter.resolve>[1];
    expect(await adapter.resolve(ctx, { ...item, revisionHash: "stale" }, "approve", { kind: "session", actor })).toMatchObject({ outcome: "failed", reason: "revision_changed" });
    expect(rpc.mock.calls.every(([name]) => name === "read_booking_instant_policies")).toBe(true);
    expect(await adapter.resolve(ctx, item, "approve", { kind: "session", actor })).toMatchObject({ outcome: "done" });
    expect(rpc).toHaveBeenCalledWith("decide_booking_instant_policy", expect.objectContaining({ p_user_id: actor.userId, p_email: actor.verifiedEmail, p_revision: 1, p_owner_link: false }));
  });
});
