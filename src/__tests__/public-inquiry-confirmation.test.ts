import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreBooking } from "@/platform/bookings/store";
const ports = vi.hoisted(() => ({ messages: vi.fn(), manage: vi.fn(), allowed: vi.fn(), rpc: vi.fn(), updates: vi.fn() }));
vi.mock("@/platform/bookings/flags", () => ({ bookingMessagesEnabled: ports.messages, bookingManagePageEnabled: ports.manage }));
vi.mock("@/platform/bookings/native", () => ({ nativeRpc: ports.rpc, newBookingAccess: () => ({ confirmHash: "private-hash", confirmCiphertext: "enc:v1:private" }) }));
vi.mock("@/platform/bookings/updates", () => ({ bookingCustomerEmailAllowed: ports.allowed, deliverBookingUpdates: ports.updates }));
import { issuePublicInquiryConfirmation, requirePublicBookingEmail } from "@/platform/bookings/public-confirmation";
const booking = { id: "booking-fixture", origin: "inquiry", status: "held", tenantId: "fictional", workspaceId: "workspace-fixture", createdAt: new Date().toISOString() } as StoreBooking;
beforeEach(() => { vi.clearAllMocks(); ports.messages.mockReturnValue(true); ports.manage.mockReturnValue(true); ports.allowed.mockResolvedValue(true); ports.rpc.mockResolvedValue({}); ports.updates.mockResolvedValue({ customerSent: 1 }); });
describe("public inquiry confirmation bridge", () => {
  it("issues private email access before delivering the held request without exposing a token", async () => {
    expect(await issuePublicInquiryConfirmation(booking)).toBeUndefined();
    expect(ports.rpc).toHaveBeenCalledWith("issue_booking_access", { p_tenant_id: "fictional", p_ref: booking.id, p_access: expect.objectContaining({ confirmHash: "private-hash" }) });
    expect(ports.rpc).toHaveBeenCalledBefore(ports.updates);
    expect(ports.updates).toHaveBeenCalledExactlyOnceWith(booking.id);
  });
  it.each(["messages", "manage", "allowed"] as const)("refuses missing %s gate before issuing access or sending", async gate => {
    ports[gate].mockReturnValue(false);
    await expect(requirePublicBookingEmail("fictional")).rejects.toMatchObject({ status: 503 });
    await expect(issuePublicInquiryConfirmation(booking)).rejects.toMatchObject({ status: 503 });
    expect(ports.rpc).not.toHaveBeenCalled(); expect(ports.updates).not.toHaveBeenCalled();
  });
  it("does not reopen expired holds or send a second confirmation for placed requests", async () => {
    await expect(issuePublicInquiryConfirmation({ ...booking, createdAt: "2000-01-01T00:00:00Z" })).rejects.toMatchObject({ status: 404 });
    await issuePublicInquiryConfirmation({ ...booking, status: "requested" });
    expect(ports.rpc).not.toHaveBeenCalled(); expect(ports.updates).not.toHaveBeenCalled();
  });
});
