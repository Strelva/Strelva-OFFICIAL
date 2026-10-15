import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListingsPlanChangedError, applyListingFixes, type ApplyDeps } from "@/products/listings-sync/apply";
import type { ListingFix } from "@/products/listings-sync/contracts";
import { ServiceRequestConflictError } from "@/platform/service-requests/types";
import { systemOriginId } from "@/platform/systems/invariants";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

const WS = "7f000000-0000-4000-8000-000000000010";
const actor = { userId: "7f000000-0000-4000-8000-0000000000a1", verifiedEmail: "owner@example.test" };
const STABLE = "7f000000-0000-4000-8000-0000000000b1";
let n = 0;
const fix = (over: Partial<ListingFix>): ListingFix => ({
  id: `7f000000-0000-4000-8000-00000000f${String(++n).padStart(3, "0")}`, surfaceKey: "x:1", factKey: "hours", kind: "booking_hours", proposed: {},
  status: "proposed", outcomeRef: null, reason: null, recordRevision: 3, ...over,
});

function setup(fixes: ListingFix[], over: Partial<ApplyDeps> = {}, hash = "h1") {
  const setFix = vi.fn(async (..._a: unknown[]) => fixes[0]!);
  const deps = {
    store: { setFix },
    record: vi.fn(async () => ({ access: "owner", revision: 3 })),
    reviews: () => ({ read: vi.fn(async () => null) }),
    openPlan: vi.fn(async () => ({ workspaceId: WS, recordRevision: 3, hash, lines: [], requests: 0, strelvaChanges: 0, fixes, readings: [] })),
    googleFix: vi.fn(async () => true),
    prepareGoogle: vi.fn(async () => ({ id: "ev1", status: "pending" })),
    approveGoogle: vi.fn(async () => ({ changed: true })),
    bookingHours: vi.fn(async () => ({ revision: 7 })),
    provider: vi.fn(async () => ({ kind: "agency" as const, agencyWorkspaceId: "7f000000-0000-4000-8000-0000000000c1" })),
    tenant: vi.fn(async () => ({ id: "t1", deliveryModel: "platform_template" })),
    requests: vi.fn(async () => ({ id: "req1" })),
    queue: vi.fn(async () => "check1"),
    run: vi.fn(async () => ({ ran: 1, failed: 0 })),
    ...over,
  };
  return { deps: deps as unknown as ApplyDeps, raw: deps, setFix };
}
const lastStatus = (setFix: ReturnType<typeof vi.fn>, id: string) => setFix.mock.calls.filter(c => c[1] === id).map(c => ({ to: c[3], patch: c[4] })).at(-1);

beforeEach(() => { n = 0; });

describe("applyListingFixes", () => {
  it("refuses a non-owner", async () => {
    const { deps } = setup([], { record: vi.fn(async () => ({ access: "admin", revision: 3 })) });
    await expect(applyListingFixes(actor, WS, "h1", deps)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("refuses a plan whose hash moved", async () => {
    const { deps, raw } = setup([fix({})]);
    await expect(applyListingFixes(actor, WS, "other", deps)).rejects.toBeInstanceOf(ListingsPlanChangedError);
    expect(raw.bookingHours).not.toHaveBeenCalled();
    expect(raw.queue).not.toHaveBeenCalled();
  });

  it("refuses a plan made from an older record revision before any write", async () => {
    const f = fix({ proposed: { scope: "scope1", weekly: [] } });
    const { deps, raw, setFix } = setup([f], { record: vi.fn(async () => ({ access: "owner", revision: 5 })) });
    (raw.openPlan as ReturnType<typeof vi.fn>).mockResolvedValue({ workspaceId: WS, recordRevision: 4, hash: "h1", lines: [], requests: 0, strelvaChanges: 0, fixes: [f], readings: [] });
    await expect(applyListingFixes(actor, WS, "h1", deps)).rejects.toBeInstanceOf(ListingsPlanChangedError);
    expect(setFix).not.toHaveBeenCalled();
    expect(raw.bookingHours).not.toHaveBeenCalled();
    expect(raw.prepareGoogle).not.toHaveBeenCalled();
    expect(raw.requests).not.toHaveBeenCalled();
    expect(raw.queue).toHaveBeenCalledWith(WS, "after_fix", actor.userId);
  });

  it("runs the after-fix check it queues for a stale plan, then refuses", async () => {
    const f = fix({ proposed: { scope: "scope1", weekly: [] } });
    const { deps, raw } = setup([f], { record: vi.fn(async () => ({ access: "owner", revision: 5 })) });
    (raw.openPlan as ReturnType<typeof vi.fn>).mockResolvedValue({ workspaceId: WS, recordRevision: 4, hash: "h1", lines: [], requests: 0, strelvaChanges: 0, fixes: [f], readings: [] });
    await expect(applyListingFixes(actor, WS, "h1", deps)).rejects.toBeInstanceOf(ListingsPlanChangedError);
    expect(raw.run).toHaveBeenCalledWith({ checkId: "check1", limit: 1, budgetMs: 30_000 });
  });

  it("fails a Google fix, and never prepares a draft, when the unconfirmed-edit read fails", async () => {
    const google = fix({ kind: "google_hours", proposed: { tenantId: "t1", locationId: "loc1" } });
    const booking = fix({ kind: "booking_hours", proposed: { scope: "s", weekly: [] } });
    const { deps, raw, setFix } = setup([google, booking], { reviews: () => ({ read: vi.fn(async () => { throw new Error("down"); }) }) });
    const result = await applyListingFixes(actor, WS, "h1", deps);
    expect(raw.prepareGoogle).not.toHaveBeenCalled();
    expect(raw.approveGoogle).not.toHaveBeenCalled();
    expect(result.failed).toContainEqual({ fixId: google.id, reason: "Confirm your changed details first." });
    expect(lastStatus(setFix, google.id)).toMatchObject({ to: "failed" });
    expect(raw.bookingHours).toHaveBeenCalled();
    expect(result.applied).toBe(1);
  });

  it("runs the queued after-fix check right away", async () => {
    const { deps, raw } = setup([fix({ proposed: { scope: "s", weekly: [] } })]);
    await applyListingFixes(actor, WS, "h1", deps);
    expect(raw.run).toHaveBeenCalledWith({ checkId: "check1", limit: 1, budgetMs: 30_000 });
  });

  it("does not run a check when none was queued, and survives a failing run", async () => {
    const none = setup([fix({ proposed: { scope: "s", weekly: [] } })], { queue: vi.fn(async () => { throw new Error("x"); }) as never });
    await applyListingFixes(actor, WS, "h1", none.deps);
    expect(none.raw.run).not.toHaveBeenCalled();
    const bad = setup([fix({ proposed: { scope: "s", weekly: [] } })], { run: vi.fn(async () => { throw new Error("x"); }) as never });
    await expect(applyListingFixes(actor, WS, "h1", bad.deps)).resolves.toMatchObject({ applied: 1 });
  });

  it("clips booking hours and records the revision", async () => {
    const f = fix({ proposed: { scope: "scope1", weekly: [{ day: 1, opens: "09:00", closes: "17:00" }] } });
    const { deps, raw, setFix } = setup([f]);
    const result = await applyListingFixes(actor, WS, "h1", deps);
    expect(raw.bookingHours).toHaveBeenCalledWith(WS, "scope1", [{ day: 1, opens: "09:00", closes: "17:00" }]);
    expect(lastStatus(setFix, f.id)).toMatchObject({ to: "applied", patch: { outcomeRef: "booking:7" } });
    expect(result).toEqual({ applied: 1, failed: [], checkId: "check1" });
    expect(raw.queue).toHaveBeenCalledWith(WS, "after_fix", actor.userId);
  });

  it("fails Google fixes without preparing when Release 2 is off", async () => {
    const f = fix({ kind: "google_hours", proposed: { tenantId: "t1", locationId: "loc1" } });
    const { deps, raw, setFix } = setup([f], { googleFix: vi.fn(async () => false) });
    const result = await applyListingFixes(actor, WS, "h1", deps);
    expect(raw.prepareGoogle).not.toHaveBeenCalled();
    expect(result.failed).toEqual([{ fixId: f.id, reason: "Google changes are off for this business." }]);
    expect(lastStatus(setFix, f.id)?.to).toBe("failed");
  });

  it("never lets an unconfirmed provider edit reach Google", async () => {
    const f = fix({ kind: "google_hours", proposed: { tenantId: "t1", locationId: "loc1" } });
    const { deps, raw } = setup([f], { reviews: () => ({ read: vi.fn(async () => ({ changes: [{ entity: "fact", id: "hours" }] })) }) });
    const result = await applyListingFixes(actor, WS, "h1", deps);
    expect(raw.prepareGoogle).not.toHaveBeenCalled();
    expect(result.failed[0]!.reason).toBe("Confirm your changed details first.");
  });

  it("prepares and approves a Google change", async () => {
    const f = fix({ kind: "google_info", factKey: "phone", proposed: { tenantId: "t1", locationId: "loc1", infoFields: ["phone"] } });
    const { deps, raw, setFix } = setup([f]);
    const result = await applyListingFixes(actor, WS, "h1", deps);
    expect(raw.prepareGoogle).toHaveBeenCalledWith(actor, { workspaceId: WS, tenantId: "t1", locationId: "loc1", kind: "info", commandId: f.id, expectedRecordRevision: 3, infoFields: ["phone"] });
    expect(raw.approveGoogle).toHaveBeenCalledWith("t1", "ev1", actor.userId);
    expect(lastStatus(setFix, f.id)).toMatchObject({ to: "applied", patch: { outcomeRef: "google:ev1" } });
    expect(result.applied).toBe(1);
  });

  it("counts an unconfirmed Google write as applied, with the reason", async () => {
    const f = fix({ kind: "google_hours", proposed: { tenantId: "t1", locationId: "loc1" } });
    const { deps, setFix } = setup([f], { approveGoogle: vi.fn(async () => ({ changed: false, reason: "google_write_unconfirmed" })) });
    await applyListingFixes(actor, WS, "h1", deps);
    expect(lastStatus(setFix, f.id)).toMatchObject({ to: "applied", patch: { reason: "Google's result couldn't be confirmed yet." } });
  });

  it("treats an already approved draft as applied and a declined one as failed", async () => {
    const a = fix({ kind: "google_hours", proposed: { tenantId: "t1", locationId: "loc1" } });
    const { deps, raw } = setup([a], { prepareGoogle: vi.fn(async () => ({ id: "ev2", status: "approved" })) });
    expect((await applyListingFixes(actor, WS, "h1", deps)).applied).toBe(1);
    expect(raw.approveGoogle).not.toHaveBeenCalled();
    const b = fix({ kind: "google_hours", proposed: { tenantId: "t1", locationId: "loc1" } });
    const declined = setup([b], { prepareGoogle: vi.fn(async () => ({ id: "ev3", status: "dismissed" })) });
    expect((await applyListingFixes(actor, WS, "h1", declined.deps)).failed[0]!.reason).toBe("This Google change was declined earlier.");
  });

  it("files a website Request through the existing command shape for a tenant site", async () => {
    const f = fix({ kind: "site_request", factKey: "page", proposed: { lines: ["Phone: change “1” to “2”"], kind: "tenant", tenantId: "t1", tenantStableId: STABLE, siteUrl: "https://harbor.example.test/" } });
    const { deps, raw, setFix } = setup([f]);
    await applyListingFixes(actor, WS, "h1", deps);
    expect(raw.requests).toHaveBeenCalledWith(actor, expect.objectContaining({
      action: "save", businessId: WS, status: "requested", scope: ["website.repo_change"], idempotencyKey: `listings-sync:${f.id}`,
      request: "Make the business details on harbor.example.test match the confirmed details. Phone: change “1” to “2”",
      context: expect.objectContaining({ source: "website_change", systemId: systemOriginId(WS, { kind: "tenant", ref: STABLE }), tenantStableId: STABLE }),
    }));
    expect(lastStatus(setFix, f.id)).toMatchObject({ to: "applied", patch: { outcomeRef: "request:req1" } });
  });

  it("files a plain Request for a connected site", async () => {
    const f = fix({ kind: "site_request", factKey: "page", proposed: { lines: ["Hours: x"], kind: "connected", siteId: "site1", siteUrl: "https://wix.example.test/", platform: "wix" } });
    const { deps, raw } = setup([f]);
    await applyListingFixes(actor, WS, "h1", deps);
    expect(raw.requests).toHaveBeenCalledWith(actor, expect.objectContaining({
      scope: ["website.platform_change"], idempotencyKey: `listings-sync:${f.id}`,
      context: { source: "listing_fix", connectedSiteId: "site1", siteUrl: "https://wix.example.test/", platform: "wix" },
    }));
  });

  it("fails a Request plainly when no agency is set up", async () => {
    const f = fix({ kind: "site_request", factKey: "page", proposed: { lines: [], kind: "connected", siteId: "s", siteUrl: "https://a.example.test/" } });
    const { deps, raw } = setup([f], { provider: vi.fn(async () => { throw new ServiceRequestConflictError("No active agency access is available for this business."); }) });
    const result = await applyListingFixes(actor, WS, "h1", deps);
    expect(result.failed).toEqual([{ fixId: f.id, reason: "No agency is set up to change your website." }]);
    expect(raw.requests).not.toHaveBeenCalled();
  });

  it("applies in order booking, Google, then website, and never touches owner to-dos", async () => {
    const todo = fix({ kind: "owner_todo", factKey: "address" });
    const site = fix({ kind: "site_request", factKey: "page", proposed: { lines: [], kind: "connected", siteId: "s", siteUrl: "https://a.example.test/" } });
    const google = fix({ kind: "google_hours", proposed: { tenantId: "t1", locationId: "loc1" } });
    const booking = fix({ proposed: { scope: "s", weekly: [] } });
    const order: string[] = [];
    const { deps, setFix } = setup([todo, site, google, booking], {
      bookingHours: vi.fn(async () => { order.push("booking"); return { revision: 1 }; }),
      prepareGoogle: vi.fn(async () => { order.push("google"); return { id: "e" }; }),
      requests: vi.fn(async () => { order.push("site"); return { id: "r" }; }),
    });
    await applyListingFixes(actor, WS, "h1", deps);
    expect(order).toEqual(["booking", "google", "site"]);
    expect(setFix.mock.calls.some(c => c[1] === todo.id)).toBe(false);
  });

  it("records a thrown failure as failed with a short reason and still queues the re-check", async () => {
    const f = fix({ proposed: { scope: "s", weekly: [] } });
    const { deps, raw } = setup([f], { bookingHours: vi.fn(async () => { throw new Error("booking_store_failed"); }) });
    const result = await applyListingFixes(actor, WS, "h1", deps);
    expect(result.failed[0]).toEqual({ fixId: f.id, reason: "booking_store_failed" });
    expect(raw.queue).toHaveBeenCalled();
  });
});
