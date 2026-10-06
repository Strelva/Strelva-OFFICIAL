import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actOnManageLink, loadManageState, manageTokenHash, type ManageDeps } from "@/platform/bookings/manage";
import type { ManagedReservation } from "@/platform/bookings/store";

const TOKEN = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const NOW = Date.parse("2026-11-02T12:00:00.000Z");

class FakeBookingError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function reservation(over: Partial<ManagedReservation> = {}): ManagedReservation {
  return {
    tenantId: "mooney", siteName: "The Mooney Firm", reservationId: "r-1", capabilityId: "consultations", capabilityVersion: 2,
    title: "Consultation", start: "2026-11-05T15:00:00.000Z", end: "2026-11-05T15:30:00.000Z", timeZone: "America/New_York",
    status: "confirmed", ...over,
  };
}

function deps(over: Partial<ManageDeps> = {}): ManageDeps {
  return {
    find: vi.fn(async (hash: string) => (hash === createHash("sha256").update(TOKEN).digest("hex") ? reservation() : null)),
    read: vi.fn(async () => ({
      version: 3,
      timeZone: "America/New_York",
      slots: [
        { id: "s-past", start: "2026-11-02T11:00:00.000Z", end: "2026-11-02T11:30:00.000Z" },
        { id: "s-current", start: "2026-11-05T15:00:00.000Z", end: "2026-11-05T15:30:00.000Z" },
        { id: "s-thu-2", start: "2026-11-05T16:00:00.000Z", end: "2026-11-05T16:30:00.000Z" },
        { id: "s-fri", start: "2026-11-06T14:00:00.000Z", end: "2026-11-06T14:30:00.000Z" },
        { id: "s-thu-1", start: "2026-11-05T14:00:00.000Z", end: "2026-11-05T14:30:00.000Z" },
      ],
    })),
    change: vi.fn(async () => ({ status: "confirmed" as const })),
    cancel: vi.fn(async () => ({ status: "cancelled" as const })),
    now: () => NOW,
    ...over,
  };
}

describe("manage link page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hashes the token and never looks up a malformed one", async () => {
    expect(manageTokenHash("short")).toBeNull();
    expect(manageTokenHash("has spaces in it!")).toBeNull();
    expect(manageTokenHash(TOKEN)).toMatch(/^[a-f0-9]{64}$/);
    const d = deps();
    expect(await loadManageState("../../etc", {}, d)).toEqual({ kind: "not_found" });
    expect(d.find).not.toHaveBeenCalled();
    expect(await loadManageState("b".repeat(32), {}, d)).toEqual({ kind: "not_found" });
  });

  it("shows the booking in its own time zone with open times grouped by day, minus the past and its own time", async () => {
    const state = await loadManageState(TOKEN, {}, deps());
    expect(state).toMatchObject({
      kind: "ready",
      booking: { siteName: "The Mooney Firm", title: "Consultation", day: "Thursday, November 5", time: "10:00 AM", timeZoneLabel: "Eastern Time", status: "confirmed" },
      slotsUnavailable: false,
      changesClosed: false,
    });
    if (state.kind !== "ready") throw new Error("not ready");
    expect(state.days).toEqual([
      { day: "Thursday, November 5", slots: [{ id: "s-thu-1", time: "9:00 AM" }, { id: "s-thu-2", time: "11:00 AM" }] },
      { day: "Friday, November 6", slots: [{ id: "s-fri", time: "9:00 AM" }] },
    ]);
  });

  it("expires once the booking has ended", async () => {
    const d = deps({ find: vi.fn(async () => reservation({ end: "2026-11-02T11:59:00.000Z" })) });
    expect((await loadManageState(TOKEN, {}, d)).kind).toBe("ended");
    expect(d.read).not.toHaveBeenCalled();
    expect(await actOnManageLink(TOKEN, { action: "cancel", slotId: null }, d)).toEqual({ error: "not_found" });
    expect(d.cancel).not.toHaveBeenCalled();
  });

  it("a paused or stopped schedule closes changes but keeps cancel; a read failure says so", async () => {
    const closed = await loadManageState(TOKEN, {}, deps({ read: vi.fn(async () => { throw new FakeBookingError("conflict"); }) }));
    expect(closed).toMatchObject({ kind: "ready", changesClosed: true, slotsUnavailable: false, days: [] });
    const down = await loadManageState(TOKEN, {}, deps({ read: vi.fn(async () => { throw new Error("timeout"); }) }));
    expect(down).toMatchObject({ kind: "ready", changesClosed: false, slotsUnavailable: true });
  });

  it("a cancelled booking offers nothing more, and outcomes and errors come back as words", async () => {
    const d = deps({ find: vi.fn(async () => reservation({ status: "cancelled" })) });
    expect(await loadManageState(TOKEN, { done: "cancelled" }, d)).toMatchObject({ kind: "ready", notice: "cancelled", days: [] });
    expect(d.read).not.toHaveBeenCalled();
    expect(await loadManageState(TOKEN, { error: "conflict" }, deps())).toMatchObject({ error: "That time can't be booked now. Pick another time, or reply to your booking email." });
    expect(await loadManageState(TOKEN, { error: "<script>" }, deps())).toMatchObject({ error: "That didn't go through, and your booking is unchanged. Try again in a minute." });
    expect(await loadManageState(TOKEN, { done: "hacked" }, deps())).not.toHaveProperty("notice");
  });
});

describe("manage link actions", () => {
  it("cancels through the public booking service with the link's own token", async () => {
    const d = deps();
    expect(await actOnManageLink(TOKEN, { action: "cancel", slotId: null }, d)).toEqual({ done: "cancelled" });
    expect(d.cancel).toHaveBeenCalledWith({ tenantId: "mooney", reservationId: "r-1", managementToken: TOKEN });
  });

  it("a cancel the calendar hasn't confirmed reads as pending", async () => {
    expect(await actOnManageLink(TOKEN, { action: "cancel", slotId: null }, deps({ cancel: vi.fn(async () => ({ status: "pending" as const })) }))).toEqual({ done: "pending" });
  });

  it("changes the time against the schedule version it was offered from", async () => {
    const d = deps();
    expect(await actOnManageLink(TOKEN, { action: "reschedule", slotId: "s-fri" }, d)).toEqual({ done: "rescheduled" });
    expect(d.change).toHaveBeenCalledWith({ tenantId: "mooney", reservationId: "r-1", managementToken: TOKEN, capabilityId: "consultations", capabilityVersion: 3, slotId: "s-fri" });
  });

  it("refuses an unknown token, a missing slot, an unknown action and reports a refused change", async () => {
    expect(await actOnManageLink("z".repeat(32), { action: "cancel", slotId: null }, deps())).toEqual({ error: "not_found" });
    expect(await actOnManageLink(TOKEN, { action: "reschedule", slotId: null }, deps())).toEqual({ error: "invalid" });
    expect(await actOnManageLink(TOKEN, { action: "delete", slotId: null }, deps())).toEqual({ error: "invalid" });
    const taken = deps({ change: vi.fn(async () => { throw new FakeBookingError("conflict"); }) });
    expect(await actOnManageLink(TOKEN, { action: "reschedule", slotId: "s-fri" }, taken)).toEqual({ error: "conflict" });
    const down = deps({ find: vi.fn(async () => { throw new Error("store down"); }) });
    expect(await actOnManageLink(TOKEN, { action: "cancel", slotId: null }, down)).toEqual({ error: "not_found" });
  });
});

describe("manage link route", () => {
  it("is off without its switch, and redirects with the outcome when on", async () => {
    vi.resetModules();
    const act = vi.fn(async () => ({ done: "cancelled" as const }));
    vi.doMock("@/platform/bookings/manage", () => ({ actOnManageLink: act }));
    vi.doMock("@/platform/bookings/manage-server", () => ({ manageDeps: () => ({}) }));
    vi.doMock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: async () => false, rateLimitKey: () => "k" }));
    const { POST } = await import("@/app/b/[token]/action/route");
    const request = () => new Request(`https://app.strelva.example/b/${TOKEN}/action`, {
      method: "POST", body: new URLSearchParams({ action: "cancel" }), headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    vi.stubEnv("STRELVA_BOOKING_MANAGE_PAGE", "");
    expect((await POST(request(), { params: Promise.resolve({ token: TOKEN }) })).status).toBe(404);
    expect(act).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_BOOKING_MANAGE_PAGE", "1");
    const res = await POST(request(), { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`https://app.strelva.example/b/${TOKEN}?done=cancelled`);
    expect(act).toHaveBeenCalledWith(TOKEN, { action: "cancel", slotId: null }, {});
    vi.unstubAllEnvs();
    vi.doUnmock("@/platform/bookings/manage");
    vi.doUnmock("@/platform/bookings/manage-server");
    vi.doUnmock("@/platform/infra/rate-limit");
  });
});
