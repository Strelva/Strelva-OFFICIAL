import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OwnerDecision, ProposedItem } from "@/platform/needs-you/contracts";
import type { ResolveBy } from "@/platform/needs-you/adapters";
import { websiteChangeAdapter, websiteChangeItem, type PendingSiteChangeReview, type WebsiteChangeReviewPorts } from "@/platform/needs-you/sources/website-change";

const captured = vi.hoisted(() => ({ deps: null as null | { emailAllowed(row: { sourceLifecycle: string; workspaceId: string; sourceId: string }): Promise<boolean> } }));
vi.mock("@/platform/needs-you/service", () => ({ createNeedsYouService: (deps: never) => { captured.deps = deps; return {}; } }));

const WS = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_WS = "aaaaaaaa-0000-4000-8000-000000000002";
const SYSTEM = "bbbbbbbb-0000-4000-8000-000000000001";
const REQUEST = "cccccccc-0000-4000-8000-000000000001";
const OWNER = { userId: "aaaaaaaa-0000-4000-8000-0000000000a1", verifiedEmail: "owner@example.test" };
const session: ResolveBy = { kind: "session", actor: OWNER };
const expiry: ResolveBy = { kind: "expiry" };
const ctx = { workspaceId: WS, actor: OWNER };

const review = (over: Partial<PendingSiteChangeReview> = {}): PendingSiteChangeReview => ({
  requestId: REQUEST, systemId: SYSTEM, request: "Add a menu page", page: "Menu", siteName: "Harbor Tavern", previewReceiptId: "dddddddd-0000-4000-8000-000000000001",
  previewUrl: "https://menu-git.example.test", summary: "A menu page with hours", ownerFacing: true, reportedBy: "coding_agent", recordedAt: "2026-10-15T12:00:00Z", ...over,
});

function setup(rows: PendingSiteChangeReview[], enabled = true) {
  const ports = {
    enabled: vi.fn(async () => enabled),
    pending: vi.fn(async (_actor: unknown, workspaceId: string) => workspaceId === WS ? rows : []),
    approve: vi.fn(async () => ({ id: "eeeeeeee-0000-4000-8000-000000000001", kind: "approved" })),
  } satisfies WebsiteChangeReviewPorts;
  return { ports, adapter: websiteChangeAdapter(ports) };
}
function asItem(p: ProposedItem): OwnerDecision {
  return {
    id: randomUUID(), workspaceId: WS, systemId: p.systemId ?? null, kind: p.kind, route: p.route, title: p.title, detail: p.detail ?? null,
    approveEffect: p.approveEffect, notYetEffect: p.notYetEffect, sourceLifecycle: p.sourceLifecycle, sourceId: p.sourceId,
    revisionHash: p.revisionHash, urgent: p.urgent, signInRequired: false, adminMayDecide: p.adminMayDecide, openHref: p.openHref ?? null,
    state: "approved", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "not_sent",
    operatorNote: null, openedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
    reminded1At: null, reminded2At: null, deliveries: [],
  } as unknown as OwnerDecision;
}

describe("website change Needs you source", () => {
  it("proposes nothing, and reads nothing, while sites_by_code is off", async () => {
    const { adapter, ports } = setup([review()], false);
    expect(await adapter.propose(ctx)).toEqual({ items: [], complete: true });
    expect(await adapter.currentRevision(ctx, REQUEST)).toBeNull();
    expect(ports.pending).not.toHaveBeenCalled();
  });

  it("proposes one owner-only Make it live item that opens the Request tab", async () => {
    const { adapter } = setup([review(), review({ requestId: "cccccccc-0000-4000-8000-000000000002" })]);
    const proposal = await adapter.propose(ctx);
    expect(proposal.items).toHaveLength(2);
    const item = proposal.items[0]!;
    expect(item).toMatchObject({
      kind: "system.change_live", route: "owner_decides", adminMayDecide: false, urgent: false, sourceLifecycle: "website_change", sourceId: REQUEST, systemId: SYSTEM,
      title: "Make the change to Harbor Tavern live",
    });
    expect(item.openHref).toBe(`/workspace/site?workspaceId=${WS}&system=${SYSTEM}&tab=request`);
    expect(item.detail).toContain("Preview: https://menu-git.example.test");
    expect(item.detail).not.toContain("No visible change");
    expect(websiteChangeItem(review({ ownerFacing: false }), WS).detail).toContain("No visible change");
    expect(item.revisionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(adapter).toMatchObject({ lifecycle: "website_change", needsMemberActor: true, ownerLinkWithoutAccount: false, ownerLinkApprovalRequiresSignIn: true });
  });

  it("treats a newer preview as a new revision", async () => {
    const first = websiteChangeItem(review(), WS).revisionHash;
    const second = websiteChangeItem(review({ previewReceiptId: "dddddddd-0000-4000-8000-000000000002" }), WS).revisionHash;
    expect(second).not.toBe(first);
  });

  it("approves once through the lifecycle's own command and returns its receipt", async () => {
    const { adapter, ports } = setup([review()]);
    const item = asItem((await adapter.propose(ctx)).items[0]!);
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "done", receiptRef: "website_change:eeeeeeee-0000-4000-8000-000000000001" });
    expect(ports.approve).toHaveBeenCalledTimes(1);
    expect(ports.approve).toHaveBeenCalledWith(OWNER, WS, REQUEST);
  });

  it("changes nothing for Not yet or a lapse", async () => {
    const { adapter, ports } = setup([review()]);
    const item = asItem((await adapter.propose(ctx)).items[0]!);
    expect(await adapter.resolve(ctx, item, "not_yet", session)).toEqual({ outcome: "done", reason: "Not yet" });
    expect(await adapter.resolve({ workspaceId: WS }, item, "not_yet", expiry)).toEqual({ outcome: "done", reason: "Expired, nothing changed" });
    expect(ports.approve).not.toHaveBeenCalled();
  });

  it("refuses an approval of a preview that changed, closes one already decided, and fails without a member", async () => {
    const { adapter, ports } = setup([review()]);
    const item = asItem((await adapter.propose(ctx)).items[0]!);
    expect(await adapter.resolve(ctx, { ...item, revisionHash: "f".repeat(64) }, "approve", session)).toEqual({ outcome: "failed", reason: "source_changed" });
    expect(await adapter.resolve(ctx, item, "approve", { kind: "expiry" })).toEqual({ outcome: "done", reason: "Expired, nothing changed" });
    expect(await adapter.resolve(ctx, item, "approve", { kind: "operator" } as unknown as ResolveBy)).toEqual({ outcome: "failed", reason: "owner_not_member" });
    ports.pending.mockResolvedValueOnce([]);
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "done", reason: "already_resolved" });
    ports.approve.mockRejectedValueOnce(new Error("website_change_owner_required"));
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "failed", reason: "resolver_failed" });
    ports.approve.mockResolvedValueOnce({ id: "x", kind: "declined" });
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "failed", reason: "not_approved" });
  });

  it("is scoped to its business and needs an actor", async () => {
    const { adapter } = setup([review()]);
    expect((await adapter.propose({ workspaceId: OTHER_WS, actor: OWNER })).items).toEqual([]);
    expect(await adapter.propose({ workspaceId: WS })).toEqual({ items: [], complete: false });
    expect(await adapter.currentRevision({ workspaceId: WS }, REQUEST)).toBeNull();
  });
});

describe("website change owner email", () => {
  afterEach(() => vi.unstubAllEnvs());
  const row = { sourceLifecycle: "website_change", workspaceId: WS, sourceId: REQUEST };

  it("is allowed only with both EMAIL_SENDING_ENABLED=true and STRELVA_SITE_CHANGE_OWNER_EMAIL=1", async () => {
    const { needsYouService } = await import("@/server/needs-you/server");
    needsYouService({} as never);
    const allowed = () => captured.deps!.emailAllowed(row);
    expect(await allowed()).toBe(false);
    vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
    expect(await allowed()).toBe(false);
    vi.stubEnv("STRELVA_SITE_CHANGE_OWNER_EMAIL", "1");
    expect(await allowed()).toBe(true);
    vi.stubEnv("EMAIL_SENDING_ENABLED", "");
    expect(await allowed()).toBe(false);
    expect(await captured.deps!.emailAllowed({ ...row, sourceLifecycle: "tenant_event" })).toBe(true);
  });
});
