import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/platform/bookings/native", () => ({ nativeRpc: m.rpc, tokenHash: (token: string) => createHash("sha256").update(token).digest("hex") }));
import { readVisitorConfirmation, readVisitorInquiryReceipt } from "@/products/scheduling/public-visitor-receipt";
import { formatVisitorTime } from "@/platform/bookings/public-admission-time";
const token = "x".repeat(43);
beforeEach(() => vi.resetAllMocks());
describe("public visitor receipt projections", () => {
  it("looks up a bounded token hash and drops customer and bearer fields", async () => {
    m.rpc.mockResolvedValue({ status: "held", start: "2026-11-06T15:00:00Z", timeZone: "America/New_York", confirmUntil: "2026-11-06T14:15:00Z", customer: { email: "private@example.test" }, confirmToken: "private" });
    expect(await readVisitorInquiryReceipt(token)).toEqual({ status: "held", start: "2026-11-06T15:00:00Z", timeZone: "America/New_York", confirmUntil: "2026-11-06T14:15:00Z" });
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith("read_public_inquiry_booking_receipt", { p_hash: createHash("sha256").update(token).digest("hex") });
    m.rpc.mockClear(); expect(await readVisitorInquiryReceipt("bad")).toBeNull(); expect(await readVisitorConfirmation("bad")).toBeNull(); expect(m.rpc).not.toHaveBeenCalled();
  });
  it("refuses malformed or unknown state and does not invent business identity", async () => {
    m.rpc.mockResolvedValue({ status: "unknown" }); expect(await readVisitorInquiryReceipt(token)).toBeNull();
    m.rpc.mockResolvedValue({ start: "2026-11-06T15:00:00Z", end: "2026-11-06T16:00:00Z", state: "held", bookingStatus: null }); expect(await readVisitorConfirmation(token)).toBeNull();
  });
  it("shows one readable zone with the correct summer, winter and fallback clocks", () => {
    expect(formatVisitorTime("2026-07-06T14:00:00Z", "America/New_York")).toContain("10:00 AM Eastern Time");
    expect(formatVisitorTime("2026-11-06T14:00:00Z", "America/New_York")).toContain("9:00 AM Eastern Time");
    expect(formatVisitorTime("2026-11-06T14:00:00Z", "invalid-zone")).toContain("2:00 PM UTC");
    for (const zone of ["America/New_York", "America/Los_Angeles", "UTC", "invalid-zone"]) {
      const text = formatVisitorTime("2026-11-06T14:00:00Z", zone);
      expect(text).not.toContain("(");
      expect(text).not.toContain("America/");
      expect(text.match(/Eastern Time|Pacific Time|UTC/g)).toHaveLength(1);
    }
  });
  it("prepares read-only, service-only SQL with a bounded inquiry receipt and a matching inverse", () => {
    const forward = readFileSync("supabase/migrations/20261024124500_ux_visitor_booking_receipts.sql", "utf8");
    const rollback = readFileSync("supabase/migrations/rollback-20261024124500_ux_visitor_booking_receipts.sql", "utf8");
    expect(forward).toContain("where o.token_hash=p_hash and o.expires_at>clock_timestamp()");
    expect(forward).toContain("b.tenant_stable_id=o.tenant_stable_id");
    expect(forward).toContain("revoke all on function public.read_public_inquiry_booking_receipt(text) from public,anon,authenticated");
    expect(forward).toContain("grant execute on function public.read_public_inquiry_booking_receipt(text) to service_role");
    expect(forward).not.toMatch(/\b(?:insert into|update public|delete from)\b/i);
    const original = readFileSync("supabase/migrations/20261023123000_public_booking_confirmation_identity.sql", "utf8");
    expect(rollback).toContain(original.slice(original.indexOf("create function"), original.indexOf("revoke all")).replace("create function", "create or replace function"));
    expect(rollback).toContain("drop function if exists public.read_public_inquiry_booking_receipt(text)");
  });
});
