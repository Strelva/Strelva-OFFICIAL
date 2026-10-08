import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Booking } from "@/lib/types";
import { DEFAULT_BOOKING_CONFIG } from "@/lib/booking";
import { workspaceReturnTarget } from "@/platform/workspaces/location";
import { setReleaseFlagsDb } from "@/platform/release-flags/store";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import {
  BookingNotFoundError,
  BookingRequestDecisionError,
  bookingRange,
  changeWorkspaceBooking,
  readWorkspaceBookings,
  weekStart,
  type BookingDependencies,
} from "@/products/bookings/server";
import { WorkspaceBookings } from "@/experience/bookings/WorkspaceBookings";
import { DASHBOARD_DISPOSITIONS, pagesBlockingOwnerEntry } from "@/platform/owner-entry/dispositions";
import { routeDashboardRequest } from "@/platform/owner-entry/decision";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// The bookings System's day and week views: the workspace homes of
// /dashboard/roster and /dashboard/schedule.

const WS = "7f000000-0000-4000-8000-000000000020";
const ACTOR = { userId: "7f000000-0000-4000-8000-000000000002", verifiedEmail: "Owner@Example.test" };
const LINK = [{ tenantId: "twintrees-a", tenantStableId: "7f000000-0000-4000-8000-0000000000c1", linkedAt: "2026-10-01T00:00:00Z" }];

const booking = (patch: Partial<Booking>): Booking => ({
  id: "bk_1", serviceId: "svc", serviceName: "Massage, 60 min", date: "2026-11-06", startTime: "10:00", endTime: "11:00",
  clientName: "Dana Reed", clientEmail: "dana@example.test", clientPhone: "716-555-0100", status: "confirmed", createdAt: "2026-10-01T00:00:00Z", ...patch,
});

function links(rows: unknown, error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data: rows, error }));
  setReleaseFlagsDb({ rpc });
  return rpc;
}

const deps = (patch: Partial<BookingDependencies> = {}): BookingDependencies => ({
  bookings: async () => [booking({ id: "bk_2", startTime: "14:00", endTime: "15:00", clientName: "Sam Lee" }), booking({}), booking({ id: "bk_x", date: "2026-11-20" })],
  config: async () => DEFAULT_BOOKING_CONFIG,
  siteName: async () => "Twin Trees",
  ...patch,
});

afterEach(() => setReleaseFlagsDb(null));

describe("reading bookings through the business link", () => {
  it("reads the day, ordered, as the signed-in member", async () => {
    const rpc = links(LINK);
    const seen: Array<{ from: string; to: string }> = [];
    const result = await readWorkspaceBookings(ACTOR, WS, { view: "day", date: "2026-11-06" }, deps({ bookings: async (_t, range) => { seen.push(range); return deps().bookings("", range); } }));
    expect(rpc).toHaveBeenCalledWith("read_workspace_tenant_links", { p_workspace_id: WS, p_user_id: ACTOR.userId, p_verified_email: "owner@example.test" });
    expect(seen).toEqual([{ from: "2026-11-06", to: "2026-11-06" }]);
    expect(result.sites[0]!.bookings.map((b) => b.id)).toEqual(["bk_1", "bk_2"]);
  });

  it("the week runs Monday to Sunday and defaults to the site's local today", async () => {
    links(LINK);
    const result = await readWorkspaceBookings(ACTOR, WS, { view: "week", now: new Date("2026-11-07T03:00:00Z") }, deps());
    // 10pm Friday in New York: still Friday's week.
    expect(result).toMatchObject({ from: "2026-11-02", to: "2026-11-08" });
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
    expect(bookingRange("week", "2026-11-02")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
  });

  it("refuses anyone who isn't a member of the business", async () => {
    links(null, { message: "workspace_access_denied" });
    await expect(readWorkspaceBookings(ACTOR, WS, { view: "day" }, deps())).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("offers an additive upcoming range without changing existing day/week ranges", async () => {
    links(LINK);
    const bookings = vi.fn(async () => []);
    const now = new Date("2026-10-07T12:00:00Z");
    await readWorkspaceBookings(ACTOR, WS, { view: "week", now, upcomingDays: 30 }, deps({ bookings }));
    expect(bookings).toHaveBeenCalledWith("twintrees-a", { from: "2026-10-07", to: "2026-11-06" });
    bookings.mockClear();
    await readWorkspaceBookings(ACTOR, WS, { view: "week", now }, deps({ bookings }));
    expect(bookings).toHaveBeenCalledWith("twintrees-a", { from: "2026-10-05", to: "2026-10-11" });
  });

  it("marks a site unavailable instead of empty when its booking store fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    links(LINK);
    const result = await readWorkspaceBookings(ACTOR, WS, { view: "day", date: "2026-11-06" }, deps({ bookings: async () => { throw new Error("store down"); } }));
    expect(result.sites[0]).toMatchObject({ unavailable: true, bookings: [] });
    error.mockRestore();
  });
});

describe("check-in and cancel from the views", () => {
  const linked = async () => ["twintrees-a"];
  it("changes a booking of a linked site through the booking store", async () => {
    const update = vi.fn(async () => booking({ status: "completed" }));
    const row = await changeWorkspaceBooking(ACTOR, { workspaceId: WS, tenantId: "twintrees-a", bookingId: "bk_1", status: "completed" },
      { linked, read: async () => [booking({})], update });
    expect(row.status).toBe("completed");
    expect(update).toHaveBeenCalledWith("bk_1", { status: "completed" }, "twintrees-a");
  });

  it("stamps a cancellation", async () => {
    const update = vi.fn(async (_id: string, updates: Partial<Booking>) => booking({ ...updates }));
    await changeWorkspaceBooking(ACTOR, { workspaceId: WS, tenantId: "twintrees-a", bookingId: "bk_1", status: "cancelled" }, { linked, read: async () => [booking({})], update: update as never });
    expect(update.mock.calls[0]![1]).toMatchObject({ status: "cancelled", cancelledAt: expect.any(String) });
  });

  it("refuses another business's site, an unknown booking, and a request (the owner decides those in Needs you)", async () => {
    const update = vi.fn();
    await expect(changeWorkspaceBooking(ACTOR, { workspaceId: WS, tenantId: "other-site", bookingId: "bk_1", status: "cancelled" }, { linked, read: async () => [booking({})], update }))
      .rejects.toBeInstanceOf(BookingNotFoundError);
    await expect(changeWorkspaceBooking(ACTOR, { workspaceId: WS, tenantId: "twintrees-a", bookingId: "bk_none", status: "cancelled" }, { linked, read: async () => [booking({})], update }))
      .rejects.toBeInstanceOf(BookingNotFoundError);
    await expect(changeWorkspaceBooking(ACTOR, { workspaceId: WS, tenantId: "twintrees-a", bookingId: "bk_1", status: "cancelled" }, { linked, read: async () => [booking({ status: "requested" })], update }))
      .rejects.toBeInstanceOf(BookingRequestDecisionError);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("the bookings page", () => {
  const site = { tenantId: "twintrees-a", siteName: "Twin Trees", timezone: "America/New_York", today: "2026-11-06", unavailable: false,
    bookings: [booking({}), booking({ id: "bk_2", startTime: "14:00", endTime: "15:00", clientName: "Sam Lee", status: "completed" }),
      booking({ id: "bk_3", startTime: "16:00", endTime: "17:00", clientName: "Ana Ruiz", status: "requested" })] };
  const render = (props: Parameters<typeof WorkspaceBookings>[0]) => renderToStaticMarkup(createElement(WorkspaceBookings, props));

  it("day view: the roster with check-in, a way home and view links", () => {
    const html = render({ workspaceId: WS, view: "day", state: { kind: "ready", bookings: { view: "day", from: "2026-11-06", to: "2026-11-06", sites: [site] } } });
    expect(html).toContain(`href="/workspace?workspaceId=${WS}"`);
    expect(html).toContain("Friday, November 6");
    expect(html).toContain("10:00 AM – 11:00 AM");
    expect(html).toContain("Dana Reed");
    expect(html).toContain("3 appointments · 1 checked in");
    expect(html).toContain(">Check in<");
    expect(html).toContain("Checked in");
    expect(html).toContain("Undo check-in");
    expect(html).toContain("Waiting for the owner");
    expect(html).toContain(`href="/workspace/bookings?workspaceId=${WS}&amp;view=week&amp;date=2026-11-06"`);
    expect(html).toContain(`href="/workspace/bookings?workspaceId=${WS}&amp;view=day&amp;date=2026-11-05"`);
  });

  it("week view: seven days, empty days say so, today is marked", () => {
    const html = render({ workspaceId: WS, view: "week", state: { kind: "ready", bookings: { view: "week", from: "2026-11-02", to: "2026-11-08", sites: [site] } } });
    expect(html).toContain("Week of Mon, Nov 2");
    expect(html).toContain("Sun, Nov 8");
    expect(html).toContain("Today");
    expect((html.match(/No bookings\./g) ?? []).length).toBe(6);
    expect(html).not.toContain("Undo check-in");
  });

  it("has empty, unavailable, permission and error states", () => {
    const ready = (sites: typeof site[]) => ({ kind: "ready" as const, bookings: { view: "day" as const, from: "2026-11-06", to: "2026-11-06", sites } });
    expect(render({ workspaceId: WS, view: "day", state: ready([]) })).toContain("No booking site is connected");
    expect(render({ workspaceId: WS, view: "day", state: ready([{ ...site, bookings: [] }]) })).toContain("No appointments this day.");
    expect(render({ workspaceId: WS, view: "day", state: ready([{ ...site, bookings: [], unavailable: true }]) })).toContain("couldn&#x27;t be read right now");
    expect(render({ workspaceId: WS, view: "day", state: { kind: "permission" } })).toContain("belong to another business");
    expect(render({ workspaceId: WS, view: "week", state: { kind: "error" } })).toContain("Bookings couldn&#x27;t load");
  });
});

describe("/dashboard/roster and /dashboard/schedule move to the bookings views", () => {
  const moved = { kind: "workspace" as const, workspaceId: WS, tenantStableId: null, operator: false, tester: false };

  it("are ready where Systems is on, and redirect to the day and week views", () => {
    for (const route of ["/roster", "/schedule"]) expect(DASHBOARD_DISPOSITIONS.find((entry) => entry.route === route)).toMatchObject({ state: "ready", requires: ["systems"] });
    const on = () => true;
    expect(routeDashboardRequest({ decision: moved, pathWithSearch: "/dashboard/roster", flagOn: on })).toEqual({ kind: "redirect", location: `/workspace/bookings?workspaceId=${WS}&view=day`, route: "/roster" });
    expect(routeDashboardRequest({ decision: moved, pathWithSearch: "/dashboard/schedule", flagOn: on })).toEqual({ kind: "redirect", location: `/workspace/bookings?workspaceId=${WS}&view=week`, route: "/schedule" });
  });

  it("stay on /dashboard while Systems is off", () => {
    expect(routeDashboardRequest({ decision: moved, pathWithSearch: "/dashboard/roster", flagOn: () => false })).toMatchObject({ kind: "render-with-back" });
  });

  it("no longer block owner entry for wellness tenants", () => {
    const blocking = pagesBlockingOwnerEntry(new Set(["always", "wellness"])).map((entry) => entry.route);
    expect(blocking).not.toContain("/roster");
    expect(blocking).not.toContain("/schedule");
  });

  it("survive sign-in, and reject anything else on that path", () => {
    expect(workspaceReturnTarget(`/workspace/bookings?workspaceId=${WS}&view=day&date=2026-11-06`)).toBe(`/workspace/bookings?workspaceId=${WS}&view=day&date=2026-11-06`);
    expect(workspaceReturnTarget(`/workspace/bookings?workspaceId=${WS}&view=month`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace/bookings?workspaceId=${WS}&date=tomorrow`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace/bookings?workspaceId=${WS}&next=//evil.example`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace/bookings?workspaceId=nope`)).toBeNull();
  });
});
