import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const m = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn(), allowed: vi.fn() }));
vi.mock("@/platform/bookings/native", () => ({ nativeRpc: m.rpc, tokenHash: (value: string) => createHash("sha256").update(value).digest("hex") }));
vi.mock("@/platform/infra/crypto/secrets", () => ({ encryptSecret: (value: string) => `enc:v1:${value}`, decryptSecret: (value: string) => value.slice(7) }));
vi.mock("@/platform/infra/email/send", () => ({ sendEmailWithReceipt: m.send }));
vi.mock("@/platform/bookings/updates", () => ({ bookingCustomerEmailAllowed: m.allowed }));
vi.mock("@/platform/bookings/lifecycle-ports", () => ({ bookingAppOrigin: () => "https://app.example.test" }));
import { publicBookingAdmission } from "@/platform/bookings/public-admission";
const token = "s".repeat(43);
const row = { tenantId: "fixture", requestId: "request-fixture", visitor: { name: "Dana", email: "dana@example.test" }, token_ciphertext: `enc:v1:${token}`, state: "held", timeZone: "America/New_York", start_at: "2099-11-06T12:00:00Z", end_at: "2099-11-06T13:00:00Z", expires_at: "2099-11-06T12:00:00Z" };
beforeEach(() => { vi.clearAllMocks(); m.rpc.mockImplementation(async name => name === "read_booking_business_details" ? { name: "Lakeview Yoga" } : row); m.send.mockResolvedValue({ status: "accepted", providerMessageId: "fixture" }); m.allowed.mockResolvedValue(true); });
describe("public booking confirmation email boundary", () => {
  it("projects only the saved confirmation deadline and verified business identity", async () => {
    const view = await publicBookingAdmission.presentation(row);
    expect(view).toEqual({ confirmationRequired: true, confirmationExpiresAt: "2099-11-06T12:00:00.000Z", businessName: "Lakeview Yoga" });
    expect(JSON.stringify(view)).not.toContain(token);
    expect(JSON.stringify(view)).not.toContain(row.visitor.email);
    m.rpc.mockImplementation(async name => name === "read_booking_business_details" ? null : { ...row, state: "placed" });
    expect(await publicBookingAdmission.presentation(row)).toEqual({ confirmationRequired: false });
  });
  it("holds the email when its business identity cannot be read", async () => {
    m.rpc.mockImplementation(async name => name === "read_booking_business_details" ? null : row);
    await expect(publicBookingAdmission.send(row)).rejects.toMatchObject({ status: 503 });
    expect(m.send).not.toHaveBeenCalled();
  });
  it("sends the private confirmation token only to the captured customer, with one stable send key", async () => {
    await publicBookingAdmission.send(row); await publicBookingAdmission.send(row);
    const [first, second] = m.send.mock.calls.map(c => c[0]);
    expect(first).toMatchObject({ audience: "customer", tenantId: "fixture", to: "dana@example.test", fromAddress: "bookings@mail.strelva.com", fromName: "Lakeview Yoga", subject: "Confirm your booking request with Lakeview Yoga", authorship: "business", businessName: "Lakeview Yoga", options: { rows: [{ label: "Requested time", value: expect.stringContaining("7:00 AM EST (America/New_York)") }, { label: "Confirm by", value: expect.stringContaining("7:00 AM EST (America/New_York)") }], button: { url: `https://app.example.test/booking-confirm/${token}` } } });
    expect(first.idempotencyKey).toBe(second.idempotencyKey); expect(first.idempotencyKey).not.toContain(token);
  });
  it("refuses admission before storage or mail when customer email is disabled", async () => {
    m.allowed.mockResolvedValue(false);
    await expect(publicBookingAdmission.claim({ binding: { tenantId: "fixture", workspaceId: "business" }, requestId: "request", fingerprint: "f".repeat(64), visitor: row.visitor, start: "2099-11-06T12:00:00Z", end: "2099-11-06T13:00:00Z" })).rejects.toMatchObject({ status: 503 });
    expect(m.rpc).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
  });
  it("does not resend expired or placed requests", async () => {
    for (const patch of [{ expires_at: "2000-01-01T00:00:00Z" }, { state: "placed" }]) {
      m.rpc.mockResolvedValue({ ...row, ...patch }); await publicBookingAdmission.send(row);
    }
    expect(m.send).not.toHaveBeenCalled();
  });
  it("suppressed/failed mail never authorizes placement", async () => {
    m.send.mockResolvedValue({ status: "suppressed", reason: "email_gates" });
    await expect(publicBookingAdmission.send(row)).rejects.toMatchObject({ status: 503 });
    expect(m.rpc).toHaveBeenCalledWith("read_public_booking_request", expect.any(Object));
    expect(m.rpc).not.toHaveBeenCalledWith("consume_public_booking_request", expect.any(Object));
  });
});
