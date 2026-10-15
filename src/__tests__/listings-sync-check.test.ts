import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queueListingsCheck, runListingsCheck, runQueuedListingsChecks, sweepListingsSync, type CheckDeps } from "@/products/listings-sync/check";
import type { SurfaceReading } from "@/products/listings-sync/contracts";
import type { ListingTargets } from "@/products/listings-sync/targets";

const WS = "7f000000-0000-4000-8000-000000000010";
const CHECK = { id: "7f000000-0000-4000-8000-0000000000c1", workspaceId: WS, claimToken: "7f000000-0000-4000-8000-0000000000c2", recordRevision: 3 };
const HOURS = { timezone: "America/New_York", weekly: [{ day: 1, opens: "09:00", closes: "17:00" }] };
const confirmed = { revision: 3, facts: { phone: "(716) 555-0100", hours: HOURS }, services: [] };

const targets = (over: Partial<ListingTargets> = {}): ListingTargets => ({ websites: [], google: [], booking: [], yelp: [], hasAgency: false, ...over });
const site = { surfaceKey: "website:tenant:t1", kind: "tenant" as const, label: "harbor.example.test", url: "https://harbor.example.test/", tenantId: "t1" };
const goodPage = { report: { present: true as const, businesses: [{ telephone: "(716) 555-0100" }] }, telHrefs: [], hrefs: [], text: "" };
const badPage = { report: { present: true as const, businesses: [{ telephone: "(716) 555-9999" }] }, telHrefs: [], hrefs: [], text: "" };
const googleRead = (phone: string) => ({ status: "read" as const, data: { phoneNumbers: { primaryPhone: phone }, regularHours: { periods: [{ openDay: "MONDAY", openTime: { hours: 9 }, closeDay: "MONDAY", closeTime: { hours: 17 } }] } } });

function deps(over: { targets?: ListingTargets; website?: unknown; google?: unknown; googleFix?: boolean; confirmedThrows?: boolean; surfaceTimeoutMs?: number } = {}) {
  const finish = vi.fn(async (..._args: unknown[]) => ({ checkId: CHECK.id, release: null as { number: number; recordedAt: string } | null }));
  const saveFixes = vi.fn(async (..._args: unknown[]) => []);
  const d = {
    store: {
      confirmedFacts: vi.fn(async () => { if (over.confirmedThrows) throw new Error("boom"); return confirmed; }),
      saveFixes, finish, claim: vi.fn(async () => []), queue: vi.fn(async () => CHECK.id), due: vi.fn(async () => []),
    },
    targets: vi.fn(async () => over.targets ?? targets()),
    readers: {
      website: vi.fn(async () => (over.website === undefined ? goodPage : over.website)),
      google: vi.fn(async () => over.google ?? googleRead("(716) 555-0100")),
      booking: vi.fn(async () => null),
      yelp: vi.fn(async () => null),
    },
    googleFix: vi.fn(async () => over.googleFix ?? false),
    available: vi.fn(async () => true),
    now: () => new Date("2026-10-15T12:00:00Z"),
    surfaceTimeoutMs: over.surfaceTimeoutMs ?? 1000,
  };
  return { d: d as unknown as CheckDeps, finish, saveFixes, raw: d };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("runListingsCheck", () => {
  it("clips a booking fix from the default hours when the booking settings are null", async () => {
    const { d, raw, saveFixes } = deps({ targets: targets({ booking: [{ surfaceKey: "booking:main", scope: "t1", label: "Booking" }] as never }) });
    const hours = { timezone: "America/New_York", weekly: [{ day: 2, opens: "13:00", closes: "17:00" }] };
    raw.store.confirmedFacts.mockResolvedValueOnce({ ...confirmed, facts: { ...confirmed.facts, hours } } as never);
    const context = { tenantStableId: null, workspaceId: WS, systemId: "s1", paused: false, services: [], hours, phone: null, settings: null };
    raw.readers.booking.mockResolvedValueOnce({ context, outside: [{ day: 1, opens: "08:00", closes: "20:00" }] } as never);
    await runListingsCheck(CHECK, d);
    const fixes = saveFixes.mock.calls[0]![2] as Array<{ kind: string; proposed: { weekly: unknown[] } }>;
    const booking = fixes.find(fix => fix.kind === "booking_hours");
    expect(booking?.proposed.weekly).toEqual([{ day: 2, opens: "13:00", closes: "17:00" }]);
    expect(fixes.every(fix => fix.kind !== "booking_hours" || fix.proposed.weekly.length > 0)).toBe(true);
  });

  it("finishes with no differences and carries the Release the store records", async () => {
    const { d, finish } = deps({ targets: targets({ websites: [site], google: [{ surfaceKey: "google:loc1", tenantId: "t1", locationId: "loc1", label: "Harbor" }] }) });
    finish.mockResolvedValueOnce({ checkId: CHECK.id, release: { number: 2, recordedAt: "2026-10-15T00:00:00Z" } });
    const result = await runListingsCheck(CHECK, d);
    expect(result).toEqual({ status: "done", differs: 0, release: { number: 2 } });
    expect(finish).toHaveBeenCalledWith(CHECK.id, CHECK.claimToken, "done", expect.any(Array), 0, expect.any(Number), null);
    expect((finish.mock.calls[0]![5] as number)).toBeGreaterThan(0);
  });

  it("makes a Google phone difference an owner to-do while the fix Release is off", async () => {
    const { d, saveFixes, finish } = deps({ targets: targets({ google: [{ surfaceKey: "google:loc1", tenantId: "t1", locationId: "loc1", label: "Harbor" }] }), google: googleRead("(716) 555-9999") });
    const result = await runListingsCheck(CHECK, d);
    expect(result.differs).toBe(1);
    expect(saveFixes.mock.calls[0]![2]).toEqual([expect.objectContaining({ surfaceKey: "google:loc1", factKey: "phone", kind: "owner_todo" })]);
    const readings = finish.mock.calls[0]![3] as SurfaceReading[];
    expect(readings[0]).toMatchObject({ kind: "google", changeBy: "owner" });
  });

  it("proposes a Google change when the fix Release is reached", async () => {
    const { d, saveFixes } = deps({ googleFix: true, targets: targets({ google: [{ surfaceKey: "google:loc1", tenantId: "t1", locationId: "loc1", label: "Harbor" }] }), google: googleRead("(716) 555-9999") });
    await runListingsCheck(CHECK, d);
    expect(saveFixes.mock.calls[0]![2]).toEqual([expect.objectContaining({ kind: "google_info", proposed: { tenantId: "t1", locationId: "loc1", infoFields: ["phone"] } })]);
  });

  it("files a site Request for a website difference when an agency exists", async () => {
    const { d, saveFixes } = deps({ website: badPage, targets: targets({ websites: [site], hasAgency: true }) });
    await runListingsCheck(CHECK, d);
    expect(saveFixes.mock.calls[0]![2]).toEqual([expect.objectContaining({ surfaceKey: site.surfaceKey, factKey: "page", kind: "site_request" })]);
  });

  it("reads one surface as unreadable when its reader throws and still compares the others", async () => {
    const { d, finish, raw } = deps({ targets: targets({ websites: [site], google: [{ surfaceKey: "google:loc1", tenantId: "t1", locationId: "loc1", label: "Harbor" }] }) });
    raw.readers.website.mockRejectedValueOnce(new Error("dns"));
    await runListingsCheck(CHECK, d);
    const readings = finish.mock.calls[0]![3] as SurfaceReading[];
    expect(readings.find(r => r.kind === "website")).toMatchObject({ state: "unreadable" });
    expect(readings.find(r => r.kind === "google")?.state).toBe("read");
  });

  it("gives up on a slow surface after the timeout", async () => {
    vi.useFakeTimers();
    const { d, finish, raw } = deps({ targets: targets({ websites: [site] }), surfaceTimeoutMs: 50 });
    raw.readers.website.mockImplementationOnce(() => new Promise(() => {}));
    const running = runListingsCheck(CHECK, d);
    await vi.advanceTimersByTimeAsync(60);
    await running;
    expect((finish.mock.calls[0]![3] as SurfaceReading[])[0]).toMatchObject({ state: "unreadable" });
  });

  it("marks Google as waiting without calling it a difference", async () => {
    const { d, finish } = deps({ targets: targets({ google: [{ surfaceKey: "google:loc1", tenantId: "t1", locationId: "loc1", label: "Harbor" }] }), google: { status: "waiting_on_google" } });
    const result = await runListingsCheck(CHECK, d);
    expect(result.differs).toBe(0);
    const reading = (finish.mock.calls[0]![3] as SurfaceReading[])[0]!;
    expect(reading.state).toBe("waiting_on_google");
    expect(reading.facts.every(f => f.state === "waiting_on_google")).toBe(true);
  });

  it("finishes failed with a short error when the confirmed facts cannot be read", async () => {
    const { d, finish } = deps({ confirmedThrows: true });
    expect(await runListingsCheck(CHECK, d)).toEqual({ status: "failed", differs: 0, release: null });
    expect(finish).toHaveBeenCalledWith(CHECK.id, CHECK.claimToken, "failed", [], 0, 0, "boom");
  });

  it("gives deep-equal, sorted, timestamp-free readings for the same inputs", async () => {
    const t = targets({ websites: [site], google: [{ surfaceKey: "google:loc1", tenantId: "t1", locationId: "loc1", label: "Harbor" }] });
    const a = deps({ targets: t });
    const b = deps({ targets: t });
    await runListingsCheck(CHECK, a.d);
    await runListingsCheck(CHECK, b.d);
    const readings = a.finish.mock.calls[0]![3] as SurfaceReading[];
    expect(readings).toEqual(b.finish.mock.calls[0]![3]);
    expect(readings.map(r => r.surfaceKey)).toEqual([...readings.map(r => r.surfaceKey)].sort());
    expect(JSON.stringify(readings)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe("queue, run and sweep", () => {
  it("queues nothing while the App is unavailable", async () => {
    const { d, raw } = deps();
    raw.available.mockResolvedValue(false);
    expect(await queueListingsCheck(WS, "check_now", "u1", d)).toBeNull();
    expect(raw.store.queue).not.toHaveBeenCalled();
  });

  it("queues with the trigger and requester when available", async () => {
    const { d, raw } = deps();
    expect(await queueListingsCheck(WS, "check_now", "u1", d)).toBe(CHECK.id);
    expect(raw.store.queue).toHaveBeenCalledWith(WS, "check_now", "u1");
  });

  it("claims one check when asked for a specific id", async () => {
    const { d, raw } = deps();
    raw.store.claim.mockResolvedValueOnce([{ ...CHECK, trigger: "check_now" }] as never);
    const result = await runQueuedListingsChecks({ checkId: CHECK.id }, d);
    expect(raw.store.claim).toHaveBeenCalledWith(1, CHECK.id);
    expect(result).toEqual({ ran: 1, failed: 0 });
  });

  it("sweeps only available businesses", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_LISTINGS_SYNC_RELEASE", "workspace");
    const other = "7f000000-0000-4000-8000-000000000011";
    const { d, raw } = deps();
    raw.store.due.mockResolvedValueOnce([WS, other] as never);
    (raw.available as unknown as { mockImplementation(fn: (id: string) => Promise<boolean>): void }).mockImplementation(async id => id === WS);
    const result = await sweepListingsSync({}, d);
    expect(raw.store.due).toHaveBeenCalledWith(50, "workspace");
    expect(raw.store.queue).toHaveBeenCalledTimes(1);
    expect(result.queued).toBe(1);
    vi.unstubAllEnvs();
  });

  it("does nothing while the App cannot be on", async () => {
    const { d, raw } = deps();
    expect(await sweepListingsSync({}, d)).toEqual({ queued: 0, ran: 0, failed: 0 });
    expect(raw.store.due).not.toHaveBeenCalled();
  });
});
