import { describe, expect, it, vi } from "vitest";
import { listingsSyncAdapter, listingsSyncItem, type ListingsPlan, type ListingsSyncPorts } from "@/platform/needs-you/sources/listings-sync";
import { decisionPresentation } from "@/experience/workspace/needs-you-presentation";
import { SOURCE_LIFECYCLES, type OwnerDecision } from "@/platform/needs-you/contracts";

const WS = "7f000000-0000-4000-8000-000000000010";
const actor = { userId: "7f000000-0000-4000-8000-0000000000a1", verifiedEmail: "owner@example.test" };
const plan = (over: Partial<ListingsPlan> = {}): ListingsPlan => ({
  workspaceId: WS, recordRevision: 3, hash: "hash1", places: 2, requests: 0, strelvaChanges: 2,
  lines: ["Booking page: booking times outside your hours are removed (Monday 18:00–20:00).", "Google listing Harbor: hours set to your hours."], ...over,
});
function ports(over: Partial<ListingsSyncPorts> = {}) {
  const p = {
    enabled: vi.fn(async () => true), plan: vi.fn(async () => plan()),
    apply: vi.fn(async () => ({ applied: 2, failed: [], checkId: "c1" })), decline: vi.fn(async () => {}), ...over,
  };
  return { p, adapter: listingsSyncAdapter(p) };
}
const ctx = { workspaceId: WS };
const item = (over: Partial<OwnerDecision> = {}) => ({ sourceId: WS, revisionHash: "hash1", ...over }) as OwnerDecision;

describe("listings sync Needs you source", () => {
  it("is a known lifecycle", () => {
    expect(SOURCE_LIFECYCLES).toContain("listings_sync");
  });

  it("proposes one owner-only item with the exact copy", async () => {
    const { adapter } = ports();
    const out = await adapter.propose(ctx);
    expect(out.complete).toBe(true);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({
      kind: "system.change_live", route: "owner_decides", title: "Make your details match in 2 places", sourceLifecycle: "listings_sync", sourceId: WS,
      revisionHash: "hash1", urgent: false, adminMayDecide: false,
      approveEffect: "Strelva changes these places, then checks each one again.",
      notYetEffect: "Nothing changes. These places keep showing different details.",
      openHref: `/workspace/business-details?workspaceId=${WS}#listings`,
    });
    expect(out.items[0]!.detail).toContain("Google listing Harbor: hours set to your hours.");
  });

  it("says a Request when the agency is asked, and 1 place for one", () => {
    expect(listingsSyncItem(plan({ requests: 1, places: 1 })).title).toBe("Make your details match in 1 place");
    expect(listingsSyncItem(plan({ requests: 1 })).approveEffect).toBe("Strelva changes the places it can, asks your agency to change your website, then checks each place again.");
  });

  it("proposes nothing when disabled or when nothing is for Strelva or the agency to do", async () => {
    expect((await ports({ enabled: vi.fn(async () => false) }).adapter.propose(ctx)).items).toEqual([]);
    expect((await ports({ plan: vi.fn(async () => plan({ strelvaChanges: 0, requests: 0 })) }).adapter.propose(ctx)).items).toEqual([]);
    expect((await ports({ plan: vi.fn(async () => null) }).adapter.propose(ctx)).items).toEqual([]);
  });

  it("is incomplete when the plan cannot be read", async () => {
    const out = await ports({ plan: vi.fn(async () => { throw new Error("db"); }) }).adapter.propose(ctx);
    expect(out).toEqual({ items: [], complete: false });
  });

  it("reports a revision only for its own workspace", async () => {
    const { adapter } = ports();
    expect(await adapter.currentRevision(ctx, WS)).toBe("hash1");
    expect(await adapter.currentRevision(ctx, "other")).toBeNull();
  });

  it("shows the full lines only while the hash matches", async () => {
    const { adapter } = ports();
    expect(await adapter.review!(ctx, item())).toEqual(plan().lines);
    expect(await adapter.review!(ctx, item({ revisionHash: "old" }))).toBeNull();
  });

  it("changes nothing on expiry or Not yet, and records the decline", async () => {
    const a = ports();
    expect(await a.adapter.resolve(ctx, item(), "approve", { kind: "expiry" })).toEqual({ outcome: "done", reason: "Expired, nothing changed" });
    expect(a.p.decline).toHaveBeenCalledWith(WS, 3, null);
    const b = ports();
    expect(await b.adapter.resolve(ctx, item(), "not_yet", { kind: "session", actor })).toEqual({ outcome: "done", reason: "Not yet; nothing changed" });
    expect(b.p.decline).toHaveBeenCalledWith(WS, 3, actor.userId);
    expect(b.p.apply).not.toHaveBeenCalled();
  });

  it("never approves a stale plan", async () => {
    const { adapter, p } = ports();
    expect(await adapter.resolve(ctx, item({ revisionHash: "old" }), "approve", { kind: "session", actor })).toEqual({ outcome: "failed", reason: "source_changed" });
    expect(p.apply).not.toHaveBeenCalled();
    const gone = ports({ plan: vi.fn(async () => null) });
    expect((await gone.adapter.resolve(ctx, item(), "approve", { kind: "session", actor })).reason).toBe("source_changed");
  });

  it("applies with the actor and hash, then waits for the re-check", async () => {
    const { adapter, p } = ports();
    const out = await adapter.resolve(ctx, item(), "approve", { kind: "session", actor });
    expect(p.apply).toHaveBeenCalledWith(actor, WS, "hash1");
    expect(out).toEqual({ outcome: "done_unverified", reason: "checking_again", receiptRef: "listings_sync:c1" });
  });

  it("fails an approval with no member actor", async () => {
    const { adapter, p } = ports();
    expect(await adapter.resolve(ctx, item(), "approve", { kind: "owner_link", recipient: "o@example.test", actor: null })).toEqual({ outcome: "failed", reason: "owner_not_member" });
    expect(p.apply).not.toHaveBeenCalled();
  });

  it("fails with the first reason when nothing applied", async () => {
    const { adapter } = ports({ apply: vi.fn(async () => ({ applied: 0, failed: [{ reason: "Confirm your changed details first." }, { reason: "x" }], checkId: null })) });
    expect(await adapter.resolve(ctx, item(), "approve", { kind: "session", actor })).toEqual({ outcome: "failed", reason: "Confirm your changed details first." });
  });

  it("fails plainly when the resolver throws", async () => {
    const { adapter } = ports({ apply: vi.fn(async () => { throw new Error("boom"); }) });
    expect(await adapter.resolve(ctx, item(), "approve", { kind: "session", actor })).toEqual({ outcome: "failed", reason: "resolver_failed" });
  });

  it("is owner-only, signed-in and trusted-recipient only", () => {
    const { adapter } = ports();
    expect(adapter).toMatchObject({ lifecycle: "listings_sync", needsMemberActor: true, ownerLinkWithoutAccount: false, ownerLinkApprovalRequiresSignIn: true, trustedRecipientOnly: true });
  });

  it("presents the source as Your listings with the hold-to-make-it-live verb", () => {
    expect(decisionPresentation({ ...item(), kind: "system.change_live", sourceLifecycle: "listings_sync", detail: null, title: "x" } as OwnerDecision))
      .toMatchObject({ source: "Your listings", verb: "Hold to make it live" });
  });
});
