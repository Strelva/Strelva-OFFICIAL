import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_BOOKING_CONFIG } from "@/lib/booking";
import { setReleaseFlagsDb } from "@/platform/release-flags/store";
import { BookingStoreError } from "@/platform/bookings/store";
import {
  BookingHoursError,
  BookingNotFoundError,
  bookingHoursChange,
  readWorkspaceBookings,
  setWorkspaceBookingHours,
  type BookingDependencies,
} from "@/products/bookings/server";
import { WorkspaceBookings } from "@/experience/bookings/WorkspaceBookings";
import { summarizeBookingHours } from "@/experience/bookings/BookingHoursEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// Booking-only hours edited from the bookings screen: narrow only, never open.
// The store's refusal of a range outside the record's hours is proven in
// tests/booking-lifecycle-schema.sql (set_tenant_booking_hours).

const WS = "7f000000-0000-4000-8000-000000000020";
const ACTOR = { userId: "7f000000-0000-4000-8000-000000000002", verifiedEmail: "owner@example.test" };
const LINK = [{ tenantId: "twintrees-a", tenantStableId: "7f000000-0000-4000-8000-0000000000c1", linkedAt: "2026-10-01T00:00:00Z" }];
const RECORD = [{ day: 1, opens: "09:00", closes: "17:00" }, { day: 5, opens: "09:00", closes: "15:00" }];

const deps = (patch: Partial<BookingDependencies> = {}): BookingDependencies => ({
  bookings: async () => [],
  config: async () => DEFAULT_BOOKING_CONFIG,
  siteName: async () => "Twin Trees",
  ...patch,
});

beforeEach(() => setReleaseFlagsDb({ rpc: vi.fn(async () => ({ data: LINK, error: null })) }));
afterEach(() => setReleaseFlagsDb(null));

describe("reading booking hours on the bookings screen", () => {
  it("shows them to someone who may manage bookings, and not to a member", async () => {
    const hours = vi.fn(async () => ({ record: RECORD, bookable: [{ day: 1, opens: "10:00", closes: "12:00" }] }));
    const owner = await readWorkspaceBookings(ACTOR, WS, { view: "week", date: "2026-11-06" }, deps({ hours, canManage: async () => true }));
    expect(owner.sites[0]!.hours).toEqual({ record: RECORD, bookable: [{ day: 1, opens: "10:00", closes: "12:00" }] });
    const member = await readWorkspaceBookings(ACTOR, WS, { view: "week", date: "2026-11-06" }, deps({ hours, canManage: async () => false }));
    expect(member.sites[0]!.hours).toBeUndefined();
  });

  it("a failed hours read only hides the editor", async () => {
    const read = await readWorkspaceBookings(ACTOR, WS, { view: "week", date: "2026-11-06" },
      deps({ hours: async () => { throw new Error("store down"); }, canManage: async () => true }));
    expect(read.sites[0]!.hours).toBeUndefined();
    expect(read.sites[0]!.unavailable).toBe(false);
  });

  it("renders the summary and the change control, and says what's needed without opening hours", () => {
    const ready = (hours: unknown) => renderToStaticMarkup(createElement(WorkspaceBookings, {
      workspaceId: WS, view: "week",
      state: { kind: "ready", bookings: { view: "week", from: "2026-11-02", to: "2026-11-08", sites: [{
        tenantId: "twintrees-a", siteName: "Twin Trees", timezone: "America/New_York", today: "2026-11-06", bookings: [], unavailable: false, hours,
      } as never] } },
    }));
    const narrowed = ready({ record: RECORD, bookable: [{ day: 1, opens: "10:00", closes: "12:00" }] });
    expect(narrowed).toContain("Booking hours");
    expect(narrowed).toContain("Mon 10:00 AM–12:00 PM");
    expect(narrowed).toContain('aria-label="Change booking hours for Twin Trees"');
    expect(ready({ record: RECORD, bookable: null })).toContain("Same as your opening hours.");
    expect(ready({ record: null, bookable: null })).toContain("add the business&#x27;s opening hours first");
    expect(ready(undefined)).not.toContain("Booking hours");
  });

  it("summarizes a closed week honestly", () => {
    expect(summarizeBookingHours({ record: RECORD, bookable: [] })).toBe("Not taking bookings on any day.");
  });
});

describe("changing booking hours", () => {
  const save = vi.fn(async () => ({ revision: 2 }));
  beforeEach(() => save.mockClear());

  it("validates the request: times, order and size", () => {
    expect(bookingHoursChange.safeParse({ workspaceId: WS, tenantId: "twintrees-a", hours: [{ day: 1, opens: "10:00", closes: "12:00" }] }).success).toBe(true);
    expect(bookingHoursChange.safeParse({ workspaceId: WS, tenantId: "twintrees-a", hours: null }).success).toBe(true);
    expect(bookingHoursChange.safeParse({ workspaceId: WS, tenantId: "twintrees-a", hours: [{ day: 1, opens: "12:00", closes: "10:00" }] }).success).toBe(false);
    expect(bookingHoursChange.safeParse({ workspaceId: WS, tenantId: "twintrees-a", hours: [{ day: 7, opens: "10:00", closes: "12:00" }] }).success).toBe(false);
    expect(bookingHoursChange.safeParse({ workspaceId: WS, tenantId: "twintrees-a", hours: [{ day: 1, opens: "9am", closes: "12:00" }] }).success).toBe(false);
    expect(bookingHoursChange.safeParse({ workspaceId: WS, tenantId: "twintrees-a", hours: [], extra: 1 }).success).toBe(false);
  });

  it("saves for a linked site when the person may manage bookings", async () => {
    const hours = [{ day: 1, opens: "10:00", closes: "12:00" }];
    expect(await setWorkspaceBookingHours(ACTOR, { workspaceId: WS, tenantId: "twintrees-a", hours }, { linked: async () => ["twintrees-a"], canManage: async () => true, save })).toEqual(hours);
    expect(save).toHaveBeenCalledWith(WS, "twintrees-a", hours);
  });

  it("refuses another business's site and a member, without saving", async () => {
    await expect(setWorkspaceBookingHours(ACTOR, { workspaceId: WS, tenantId: "other-site", hours: null }, { linked: async () => ["twintrees-a"], canManage: async () => true, save }))
      .rejects.toBeInstanceOf(BookingNotFoundError);
    await expect(setWorkspaceBookingHours(ACTOR, { workspaceId: WS, tenantId: "twintrees-a", hours: null }, { linked: async () => ["twintrees-a"], canManage: async () => false, save }))
      .rejects.toMatchObject({ code: "forbidden" });
    expect(save).not.toHaveBeenCalled();
  });

  it("turns the store's narrowing refusals into plain words", async () => {
    const refuse = (code: "hours_need_record" | "hours_outside_record") => vi.fn(async () => { throw new BookingStoreError(code); });
    const base = { linked: async () => ["twintrees-a"], canManage: async () => true };
    const input = { workspaceId: WS, tenantId: "twintrees-a", hours: [{ day: 0, opens: "10:00", closes: "11:00" }] };
    await expect(setWorkspaceBookingHours(ACTOR, input, { ...base, save: refuse("hours_outside_record") }))
      .rejects.toEqual(new BookingHoursError("outside_record", "Booking hours have to fit inside the business's opening hours. Nothing changed."));
    await expect(setWorkspaceBookingHours(ACTOR, input, { ...base, save: refuse("hours_need_record") })).rejects.toMatchObject({ code: "need_record" });
  });
});

describe("the booking hours route", () => {
  it("needs a signed-in person, refuses bad input, and maps refusals", async () => {
    vi.resetModules();
    const setHours = vi.fn();
    vi.doMock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
    vi.doMock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: async () => false }));
    const actor = vi.fn(async () => ACTOR as typeof ACTOR | null);
    vi.doMock("@/platform/workspaces/http", async () => {
      const actual = await vi.importActual<typeof import("@/platform/workspaces/http")>("@/platform/workspaces/http");
      return { ...actual, workspaceWriteGuard: () => null, workspaceHttpActor: actor };
    });
    vi.doMock("@/products/bookings/server", async () => {
      const actual = await vi.importActual<typeof import("@/products/bookings/server")>("@/products/bookings/server");
      return { ...actual, setWorkspaceBookingHours: setHours };
    });
    const { POST } = await import("@/app/api/workspace/bookings/hours/route");
    const { BookingHoursError: RouteHoursError } = await import("@/products/bookings/server");
    const req = (body: unknown) => new Request("https://app.strelva.example/api/workspace/bookings/hours", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://app.strelva.example" }, body: JSON.stringify(body),
    });
    const good = { workspaceId: WS, tenantId: "twintrees-a", hours: [{ day: 1, opens: "10:00", closes: "12:00" }] };

    actor.mockResolvedValueOnce(null);
    expect((await POST(req(good))).status).toBe(401);
    expect((await POST(req({ ...good, hours: [{ day: 1, opens: "12:00", closes: "10:00" }] }))).status).toBe(400);
    setHours.mockResolvedValueOnce(good.hours);
    const ok = await POST(req(good));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ bookable: good.hours });
    setHours.mockRejectedValueOnce(new RouteHoursError("forbidden", "Only the owner or an admin of this business can change when it takes bookings."));
    expect((await POST(req(good))).status).toBe(403);
    setHours.mockRejectedValueOnce(new RouteHoursError("outside_record", "Booking hours have to fit inside the business's opening hours. Nothing changed."));
    const outside = await POST(req(good));
    expect(outside.status).toBe(409);
    expect(await outside.json()).toEqual({ error: "Booking hours have to fit inside the business's opening hours. Nothing changed." });
    vi.doUnmock("@/platform/workspace-release");
    vi.doUnmock("@/platform/infra/rate-limit");
    vi.doUnmock("@/platform/workspaces/http");
    vi.doUnmock("@/products/bookings/server");
  });
});
