import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_BOOKING_CONFIG } from "@/lib/booking";
import { setReleaseFlagsDb } from "@/platform/release-flags/store";
import { parseStoreBooking, setBookingStoreDb, type BookingContext, BookingStoreError } from "@/platform/bookings/store";
import { readOwnerBookingEvidence, markOwnerBookingNoShow, type OwnerBookingEvidence } from "@/platform/bookings/owner-evidence";
import { readWorkspaceBookings, bookingOutsideRecordHours, changeWorkspaceBooking, BookingNotFoundError, type BookingDependencies } from "@/products/bookings/server";
import { WorkspaceBookings } from "@/experience/bookings/WorkspaceBookings";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const WS = "cf000000-0000-4000-8000-000000000001";
const ACTOR = { userId: "cf000000-0000-4000-8000-000000000002", verifiedEmail: "Owner@example.test" };
const BOOKING = parseStoreBooking({ id: "cf000000-0000-4000-8000-000000000003", legacyId: "bk_fixture", status: "no_show", origin: "site", start: "2026-11-06T15:00:00Z", end: "2026-11-06T16:00:00Z", timeZone: "America/New_York", localDate: "2026-11-06", localStart: "10:00", localEnd: "11:00", customer: { name: "Dana Reed" }, serviceName: "Consultation" })!;
const CONTEXT: BookingContext = { tenantStableId: WS, workspaceId: WS, systemId: null, paused: false, phone: null, services: [], settings: null, hours: { timezone: "America/New_York", weekly: [{ day: 5, opens: "09:00", closes: "10:00" }] } };
const EVIDENCE: OwnerBookingEvidence = { calendarHealth: "reconnect", truncated: false, bookings: [{ booking: BOOKING, historyTruncated: false, calendar: { status: "failed", updatedAt: "2026-11-06T16:00:00Z" }, history: [
  { kind: "change", actor: "owner", from: "requested", to: "confirmed", reason: "Owner approved", at: "2026-11-01T13:00:00Z" },
  { kind: "reminder", reminder: "reminder_24h", status: "suppressed", at: "2026-11-05T15:00:00Z" },
] }] };
const deps = (patch: Partial<BookingDependencies> = {}): BookingDependencies => ({ bookings: vi.fn(async () => []), config: async () => DEFAULT_BOOKING_CONFIG, siteName: async () => "Fixture Firm",
  readSource: async () => "postgres", evidence: async () => EVIDENCE, context: async () => CONTEXT, ...patch });
function links() { setReleaseFlagsDb({ rpc: async () => ({ data: [{ tenantId: "fixture", tenantStableId: WS, linkedAt: "2026-10-01T00:00:00Z" }], error: null }) }); }
afterEach(() => { setReleaseFlagsDb(null); setBookingStoreDb(undefined); vi.restoreAllMocks(); });

describe("owner booking evidence", () => {
  it("serves the full authoritative status and bounded history instead of the legacy no-show projection", async () => {
    links();
    const dependencies = deps();
    const result = await readWorkspaceBookings(ACTOR, WS, { view: "day", date: "2026-11-06" }, dependencies);
    expect(dependencies.bookings).not.toHaveBeenCalled();
    expect(result.sites[0]).toMatchObject({ evidence: { calendarHealth: "reconnect" }, bookings: [{ status: "no_show", evidence: { history: EVIDENCE.bookings[0]!.history, outsideRecordHours: true } }] });
  });
  it.each(["legacy", "compare"] as const)("does not read or expose owner extensions when %s serves", async (source) => {
    links();
    const evidence = vi.fn(async () => EVIDENCE);
    const context = vi.fn(async () => CONTEXT);
    const result = await readWorkspaceBookings(ACTOR, WS, { view: "day", date: "2026-11-06" }, deps({ readSource: async () => source, evidence, context }));
    expect(evidence).not.toHaveBeenCalled(); expect(context).not.toHaveBeenCalled();
    expect(result.sites[0]).toEqual({ tenantId: "fixture", siteName: "Fixture Firm", timezone: DEFAULT_BOOKING_CONFIG.timezone, today: expect.any(String), unavailable: false, bookings: [] });
  });
  it("shows unavailable rather than empty or a legacy success when native evidence fails", async () => {
    links(); vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await readWorkspaceBookings(ACTOR, WS, { view: "day", date: "2026-11-06" }, deps({ evidence: async () => { throw new Error("down"); } }));
    expect(result.sites[0]).toMatchObject({ unavailable: true, bookings: [] });
  });
  it("renders no-shows, history, copy failure and suppressed reminders truthfully", async () => {
    links();
    const result = await readWorkspaceBookings(ACTOR, WS, { view: "day", date: "2026-11-06" }, deps());
    const html = renderToStaticMarkup(createElement(WorkspaceBookings, { workspaceId: WS, view: "day", state: { kind: "ready", bookings: result } }));
    expect(html).toContain("No-show"); expect(html).toContain("Booking history"); expect(html).toContain("Owner approved"); expect(html).toContain("Not sent: email is disabled"); expect(html).toContain("Not on your calendar yet"); expect(html).toContain("Reconnect your calendar");
    expect(html).not.toContain("Calendar copy verified"); expect(html).not.toContain("Checked in");
  });
  it("keeps existing confirmed bookings outside changed record hours and permits marking ended appointments only", async () => {
    links();
    const evidence = { ...EVIDENCE, bookings: [{ ...EVIDENCE.bookings[0]!, booking: { ...BOOKING, status: "confirmed" as const } }] };
    const result = await readWorkspaceBookings(ACTOR, WS, { view: "day", date: "2026-11-06", now: new Date("2026-11-06T17:00:00Z") }, deps({ evidence: async () => evidence }));
    expect(result.sites[0]!.bookings[0]).toMatchObject({ status: "confirmed", evidence: { outsideRecordHours: true, canMarkNoShow: true } });
    const before = await readWorkspaceBookings(ACTOR, WS, { view: "day", date: "2026-11-06", now: new Date("2026-11-06T15:00:00Z") }, deps({ evidence: async () => evidence }));
    expect(before.sites[0]!.bookings[0]!.evidence?.canMarkNoShow).toBe(false);
  });
  it("compares the instant to record timezone, honors holiday overrides and handles unknown record hours", () => {
    expect(bookingOutsideRecordHours(BOOKING, { ...CONTEXT, hours: { timezone: "America/Los_Angeles", weekly: [{ day: 5, opens: "07:00", closes: "09:00" }] } })).toBe(false);
    expect(bookingOutsideRecordHours(BOOKING, { ...CONTEXT, hours: { timezone: "America/New_York", weekly: [{ day: 5, opens: "09:00", closes: "17:00" }], overrides: [{ date: "2026-11-06", closed: true }] } })).toBe(true);
    expect(bookingOutsideRecordHours(BOOKING, { ...CONTEXT, hours: null })).toBeNull();
  });
  it("batches evidence in one RPC with actor and range, rejecting malformed history", async () => {
    const rpc = vi.fn(async () => ({ data: EVIDENCE, error: null })); setBookingStoreDb({ rpc });
    expect(await readOwnerBookingEvidence(ACTOR, WS, "fixture", { from: "2026-11-06", to: "2026-11-06" })).toEqual(EVIDENCE);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("read_workspace_booking_evidence", { p_workspace_id: WS, p_user_id: ACTOR.userId, p_verified_email: "owner@example.test", p_tenant_id: "fixture", p_from: "2026-11-06", p_to: "2026-11-06" });
    setBookingStoreDb({ rpc: async () => ({ data: { ...EVIDENCE, bookings: [{ ...EVIDENCE.bookings[0], history: [{ kind: "change", to: "success" }] }] }, error: null }) });
    await expect(readOwnerBookingEvidence(ACTOR, WS, "fixture", { from: "2026-11-06", to: "2026-11-06" })).rejects.toBeInstanceOf(BookingStoreError);
  });
  it("no-show write is disabled outside store-served reads and delegates atomic checks in store mode", async () => {
    const input = { workspaceId: WS, tenantId: "fixture", bookingId: "bk_fixture", status: "no_show" as const };
    const markNoShow = vi.fn(async () => BOOKING);
    await expect(changeWorkspaceBooking(ACTOR, input, { linked: async () => ["fixture"], readSource: async () => "legacy", markNoShow })).rejects.toBeInstanceOf(BookingNotFoundError);
    expect(markNoShow).not.toHaveBeenCalled();
    expect(await changeWorkspaceBooking(ACTOR, input, { linked: async () => ["fixture"], readSource: async () => "postgres", markNoShow })).toMatchObject({ status: "no_show" });
    expect(markNoShow).toHaveBeenCalledWith(ACTOR, WS, "fixture", "bk_fixture");
  });
  it("no-show write surfaces a rejected stale appointment", async () => {
    setBookingStoreDb({ rpc: async () => ({ data: null, error: { message: "booking_not_found" } }) });
    await expect(markOwnerBookingNoShow(ACTOR, WS, "fixture", "bk_fixture")).rejects.toMatchObject({ code: "not_found" });
  });
});
