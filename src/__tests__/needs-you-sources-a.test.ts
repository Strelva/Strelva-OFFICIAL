/**
 * Needs you adapters for website documents, provider delivery, standing and
 * finite responsibilities, and agency draft grants. Each one proposes from
 * the lifecycle's pending state and resolves only through that lifecycle's
 * own command (the mocked port), never a second write path.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { OwnerDecision, ProposedItem } from "@/platform/needs-you/contracts";
import { KIND_RULES } from "@/platform/needs-you/contracts";
import type { ResolveBy, SourceAdapter } from "@/platform/needs-you/adapters";
import type { WebsiteRebuildRecord } from "@/products/websites/rebuild-contracts";
import type { ProviderDelivery } from "@/platform/offerings/provider-delivery";
import type { StandingResponsibilityRecord } from "@/platform/work-execution/standing-repository";
import type { Responsibility } from "@/platform/work-execution/engine";
import { websiteDocumentAdapter, type WebsiteDocumentPorts } from "@/platform/needs-you/sources/website-document";
import { providerDeliveryAdapter, type ProviderDeliveryPorts } from "@/platform/needs-you/sources/provider-delivery";
import { standingResponsibilityAdapter, type StandingResponsibilityPorts } from "@/platform/needs-you/sources/standing-responsibility";
import { workResponsibilityAdapter, type WorkResponsibilityPorts, type WorkResponsibilityRecord } from "@/platform/needs-you/sources/work-responsibility";
import { agencyGrantAdapter, type AgencyGrantPorts, type PendingAgencyGrant } from "@/platform/needs-you/sources/agency-grant";

const WS = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_WS = "aaaaaaaa-0000-4000-8000-000000000002";
const OWNER = { userId: "aaaaaaaa-0000-4000-8000-0000000000a1", verifiedEmail: "owner@example.test" };
const ADMIN = { userId: "aaaaaaaa-0000-4000-8000-0000000000a2", verifiedEmail: "admin@example.test" };
const HASH = "a".repeat(64);
const session: ResolveBy = { kind: "session", actor: OWNER };
const link: ResolveBy = { kind: "owner_link", recipient: OWNER.verifiedEmail, actor: OWNER };
const expiry: ResolveBy = { kind: "expiry" };
const ctx = { workspaceId: WS, actor: OWNER };

function asItem(p: ProposedItem): OwnerDecision {
  return {
    id: randomUUID(), workspaceId: WS, systemId: null, kind: p.kind, route: p.route, title: p.title, detail: p.detail ?? null,
    approveEffect: p.approveEffect, notYetEffect: p.notYetEffect, sourceLifecycle: p.sourceLifecycle, sourceId: p.sourceId,
    revisionHash: p.revisionHash, urgent: p.urgent, signInRequired: p.kind in KIND_RULES && KIND_RULES[p.kind as keyof typeof KIND_RULES].signInRequired,
    adminMayDecide: p.adminMayDecide, openHref: p.openHref ?? null, state: "approved", outcome: null, outcomeReason: null, receiptRef: null,
    decidedByKind: null, decidedAt: null, deliveryState: "not_sent", operatorNote: null, openedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(), reminded1At: null, reminded2At: null, deliveries: [],
  };
}

/** The checks every adapter must pass: one item per pending ask, scoped to its business, valid for owner_decisions. */
async function proposeOne(adapter: SourceAdapter): Promise<OwnerDecision> {
  const proposal = await adapter.propose(ctx);
  expect(proposal.complete).toBe(true);
  expect(proposal.items).toHaveLength(1);
  const item = proposal.items[0]!;
  expect(item.sourceLifecycle).toBe(adapter.lifecycle);
  expect(item.revisionHash).toMatch(/^[0-9a-f]{64}$/);
  expect(item.title.length).toBeLessThanOrEqual(200);
  expect(item.openHref).toMatch(/^\/workspace\?workspaceId=aaaaaaaa-0000-4000-8000-000000000001/);
  expect(await adapter.currentRevision(ctx, item.sourceId)).toBe(item.revisionHash);
  return asItem(item);
}

async function commonFailurePaths(adapter: SourceAdapter, item: OwnerDecision, resolver: ReturnType<typeof vi.fn>) {
  // Not yet and lapse change nothing at the source.
  expect(await adapter.resolve(ctx, item, "not_yet", session)).toEqual({ outcome: "done", reason: "Not yet" });
  expect(await adapter.resolve({ workspaceId: WS }, item, "not_yet", expiry)).toEqual({ outcome: "done", reason: "Expired, nothing changed" });
  expect(resolver).not.toHaveBeenCalled();
  // No member identity: the cron can't read, and nothing resolves.
  expect(await adapter.propose({ workspaceId: WS })).toEqual({ items: [], complete: false });
  expect(await adapter.currentRevision({ workspaceId: WS }, item.sourceId)).toBeNull();
  // Another business never sees this source.
  expect((await adapter.propose({ workspaceId: OTHER_WS, actor: OWNER })).items).toEqual([]);
  expect(await adapter.currentRevision({ workspaceId: OTHER_WS, actor: OWNER }, item.sourceId)).toBeNull();
  expect(adapter.needsMemberActor).toBe(true);
}

// Website documents ---------------------------------------------------------------

function website(over: Partial<WebsiteRebuildRecord["rebuild"]> = {}, facts: Record<string, unknown> = {}): WebsiteRebuildRecord {
  return {
    workId: "bbbbbbbb-0000-4000-8000-000000000001",
    workspaceId: WS,
    rebuild: {
      revision: 4, title: "Mooney site", status: "review_ready",
      candidate: { revision: 2, contentHash: HASH, previewHref: "/api/websites/x", document: { siteName: "attymooney.com", facts, nodes: {} } },
      approvedCandidateRevision: null, tenantId: null, launch: { receipt: null, readBack: null },
      ...over,
    },
  } as unknown as WebsiteRebuildRecord;
}

function websitePorts(rows: WebsiteRebuildRecord[]) {
  const ports = {
    list: vi.fn(async (_actor: unknown, workspaceId: string) => rows.filter(row => row.workspaceId === workspaceId)),
    approve: vi.fn(async () => website({ status: "approved", approvedCandidateRevision: 2 })),
    launch: vi.fn(async () => website({ status: "published", approvedCandidateRevision: 2, tenantId: "mooney",
      launch: { receipt: { receiptId: "hosted-1" }, readBack: { status: "verified", checkedAt: "2026-10-06T00:00:00.000Z", message: "ok" } } as never })),
  } satisfies WebsiteDocumentPorts;
  return ports;
}

describe("website documents", () => {
  it("proposes approve for a clean review-ready preview and resolves through approveWebsiteRebuild", async () => {
    const ports = websitePorts([website()]);
    const adapter = websiteDocumentAdapter(ports);
    const item = await proposeOne(adapter);
    expect(item.kind).toBe("system.go_live");
    expect(item.sourceId).toBe("bbbbbbbb-0000-4000-8000-000000000001:approve");
    // A first launch is owner only.
    expect(item.adminMayDecide).toBe(false);
    await commonFailurePaths(adapter, item, ports.approve);
    const result = await adapter.resolve(ctx, item, "approve", link);
    expect(result.outcome).toBe("done");
    expect(ports.approve).toHaveBeenCalledWith(OWNER, "bbbbbbbb-0000-4000-8000-000000000001", { expectedRevision: 4, candidateRevision: 2, candidateContentHash: HASH });
    expect(ports.launch).not.toHaveBeenCalled();
  });

  it("asks a live site's change as change_live, which an admin may approve", async () => {
    const adapter = websiteDocumentAdapter(websitePorts([website({ tenantId: "mooney", launch: { receipt: { receiptId: "r" }, readBack: null } as never })]));
    const item = await proposeOne(adapter);
    expect(item.kind).toBe("system.change_live");
    expect(item.adminMayDecide).toBe(true);
  });

  it("doesn't propose a preview with unresolved facts: the owner edits it first", async () => {
    const adapter = websiteDocumentAdapter(websitePorts([website({}, { price: { origin: "source", highRisk: true, verification: { supported: true, confidence: 1 } } })]));
    expect((await adapter.propose(ctx)).items).toEqual([]);
  });

  it("launch publishes through launchWebsiteRebuild; an unconfirmed read-back is done_unverified", async () => {
    const ports = websitePorts([website({ status: "approved", approvedCandidateRevision: 2 })]);
    ports.launch.mockResolvedValueOnce(website({ status: "published", tenantId: "mooney", approvedCandidateRevision: 2,
      launch: { receipt: { receiptId: "hosted-1" }, readBack: { status: "failed", checkedAt: "2026-10-06T00:00:00.000Z", message: "Live, but we couldn't confirm the public document yet." } } as never }));
    const adapter = websiteDocumentAdapter(ports);
    const item = await proposeOne(adapter);
    expect(item.sourceId).toMatch(/:launch$/);
    expect(item.adminMayDecide).toBe(false);
    const result = await adapter.resolve(ctx, item, "approve", session);
    expect(result).toMatchObject({ outcome: "done_unverified", receiptRef: "website_document:bbbbbbbb-0000-4000-8000-000000000001:hosted-1" });
    expect(ports.launch).toHaveBeenCalledTimes(1);
    expect(ports.approve).not.toHaveBeenCalled();
  });

  it("a resolver failure is failed and leaves the source pending; a moved source is already resolved", async () => {
    const ports = websitePorts([website()]);
    const adapter = websiteDocumentAdapter(ports);
    const item = await proposeOne(adapter);
    ports.approve.mockRejectedValueOnce(new Error("Resolve the flagged facts"));
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "failed", reason: "resolver_failed" });
    ports.list.mockResolvedValue([]);
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "done", reason: "already_resolved" });
    expect(await adapter.resolve(ctx, item, "approve", { kind: "owner_link", recipient: "x@example.test", actor: null })).toEqual({ outcome: "failed", reason: "owner_not_member" });
  });
});

// Provider delivery -----------------------------------------------------------------

function delivery(over: Partial<ProviderDelivery> = {}): ProviderDelivery {
  return {
    id: "cccccccc-0000-4000-8000-000000000001", businessId: WS, installationId: "cccccccc-0000-4000-8000-000000000002",
    assignmentId: "cccccccc-0000-4000-8000-000000000003", status: "accepted", customerDecision: "pending", revision: 3,
    scope: ["Rebuild the contact form"], requestedBy: OWNER.userId, requestedAt: "2026-10-01T00:00:00.000Z",
    expiresAt: "2026-11-01T00:00:00.000Z", acceptedBy: null, acceptedAt: null, revokedBy: null, revokedAt: null,
    revocationReason: null, decidedBy: null, decidedAt: null, decisionNote: null, history: [], ...over,
  };
}

describe("provider delivery", () => {
  function ports(rows: ProviderDelivery[], completed = true) {
    return {
      list: vi.fn(async (_actor: unknown, businessId: string) => rows.filter(row => row.businessId === businessId)),
      workCompleted: vi.fn(async () => completed),
      confirm: vi.fn(async () => delivery({ customerDecision: "confirmed", revision: 4 })),
    } satisfies ProviderDeliveryPorts;
  }

  it("asks the owner to confirm completed work and resolves through decide_provider_delivery", async () => {
    const p = ports([delivery()]);
    const adapter = providerDeliveryAdapter(p);
    const item = await proposeOne(adapter);
    expect(item.kind).toBe("request.scope");
    expect(item.adminMayDecide).toBe(true);
    await commonFailurePaths(adapter, item, p.confirm);
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "done", receiptRef: "provider_delivery:cccccccc-0000-4000-8000-000000000001:4" });
    expect(p.confirm).toHaveBeenCalledWith(OWNER, { deliveryId: "cccccccc-0000-4000-8000-000000000001", expectedRevision: 3, note: "Confirmed from Needs you." });
  });

  it("asks nothing before the work is completed, or once decided", async () => {
    expect((await providerDeliveryAdapter(ports([delivery()], false)).propose(ctx)).items).toEqual([]);
    expect((await providerDeliveryAdapter(ports([delivery({ customerDecision: "confirmed" })])).propose(ctx)).items).toEqual([]);
    expect((await providerDeliveryAdapter(ports([delivery({ status: "requested" })])).propose(ctx)).items).toEqual([]);
  });

  it("a refused decide is failed and the delivery stays pending", async () => {
    const p = ports([delivery()]);
    p.confirm.mockRejectedValueOnce(new Error("changed"));
    const adapter = providerDeliveryAdapter(p);
    const item = await proposeOne(adapter);
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "failed", reason: "resolver_failed" });
  });
});

// Standing responsibilities ---------------------------------------------------------

function standing(status: "proposed" | "active" = "proposed", ownerId = OWNER.userId): StandingResponsibilityRecord {
  return {
    id: "dddddddd-0000-4000-8000-000000000001", workspaceId: WS,
    policy: { version: 2, revision: 5, title: "Keep Google hours matching", intent: "Check weekly", ownerId, status } as never,
  };
}

describe("standing responsibilities (Running)", () => {
  function ports(rows: StandingResponsibilityRecord[]) {
    return {
      list: vi.fn(async (_actor: unknown, workspaceId: string) => rows.filter(row => row.workspaceId === workspaceId)),
      approve: vi.fn(async () => ({ ...standing("active") })),
    } satisfies StandingResponsibilityPorts;
  }

  it("asks once per proposed policy version and approves through the standing approve command", async () => {
    const p = ports([standing()]);
    const adapter = standingResponsibilityAdapter(p);
    const item = await proposeOne(adapter);
    expect(item.kind).toBe("running.approve");
    await commonFailurePaths(adapter, item, p.approve);
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "done", receiptRef: "standing_responsibility:dddddddd-0000-4000-8000-000000000001:v2" });
    expect(p.approve).toHaveBeenCalledWith(OWNER, "dddddddd-0000-4000-8000-000000000001", 5);
  });

  it("an active policy asks nothing: later runs are handled", async () => {
    expect((await standingResponsibilityAdapter(ports([standing("active")])).propose(ctx)).items).toEqual([]);
  });

  it("someone other than the creator can't approve today; the policy keeps waiting", async () => {
    const p = ports([standing("proposed", ADMIN.userId)]);
    const adapter = standingResponsibilityAdapter(p);
    const item = await proposeOne(adapter);
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "failed", reason: "not_creator" });
    expect(p.approve).not.toHaveBeenCalled();
    p.approve.mockRejectedValueOnce(new Error("conflict"));
    const own = standingResponsibilityAdapter({ ...ports([standing()]), approve: p.approve });
    expect(await own.resolve(ctx, item, "approve", session)).toEqual({ outcome: "failed", reason: "resolver_failed" });
  });
});

// Finite responsibilities -----------------------------------------------------------

function work(over: Partial<Responsibility> = {}): WorkResponsibilityRecord {
  return {
    id: "eeeeeeee-0000-4000-8000-000000000001", workspaceId: WS,
    payload: { version: 1, revision: 2, title: "Fix the booking page", intent: "Repair the form", ownerId: OWNER.userId, status: "proposed",
      steps: [{ maximumCents: 0 }], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", history: [], ...over } as never,
  };
}

describe("finite responsibilities", () => {
  function ports(rows: WorkResponsibilityRecord[]) {
    return {
      list: vi.fn(async (_actor: unknown, workspaceId: string) => rows.filter(row => row.workspaceId === workspaceId)),
      approve: vi.fn(async () => work({ status: "ready", revision: 3, approvedAt: "2026-10-06T00:00:00.000Z" })),
    } satisfies WorkResponsibilityPorts;
  }

  it("asks to agree proposed work and approves through the responsibility command", async () => {
    const p = ports([work()]);
    const adapter = workResponsibilityAdapter(p);
    const item = await proposeOne(adapter);
    expect(item.kind).toBe("request.scope");
    await commonFailurePaths(adapter, item, p.approve);
    expect(await adapter.resolve(ctx, item, "approve", link)).toEqual({ outcome: "done", receiptRef: "work_responsibility:eeeeeeee-0000-4000-8000-000000000001:3" });
    expect(p.approve).toHaveBeenCalledWith(OWNER, "eeeeeeee-0000-4000-8000-000000000001", 2);
  });

  it("paid work without an accepted budget isn't proposed; the payer decides that first", async () => {
    expect((await workResponsibilityAdapter(ports([work({ steps: [{ maximumCents: 500 }] as never })])).propose(ctx)).items).toEqual([]);
    expect((await workResponsibilityAdapter(ports([work({ status: "ready" })])).propose(ctx)).items).toEqual([]);
  });

  it("refusals map to failed", async () => {
    const p = ports([work({ ownerId: ADMIN.userId })]);
    const adapter = workResponsibilityAdapter(p);
    const item = await proposeOne(adapter);
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "failed", reason: "not_creator" });
    expect(p.approve).not.toHaveBeenCalled();
  });
});

// Agency draft grants ---------------------------------------------------------------

function pendingGrant(over: Partial<PendingAgencyGrant> = {}): PendingAgencyGrant {
  return { target: "application", workspaceId: WS, deliveryId: "ffffffff-0000-4000-8000-000000000001", deliveryRevision: 2,
    targetId: "ffffffff-0000-4000-8000-000000000002", providerName: "Northside Studio", label: "your application", ...over };
}

describe("agency draft grants", () => {
  function ports(rows: PendingAgencyGrant[]) {
    return {
      pending: vi.fn(async (_actor: unknown, workspaceId: string) => rows.filter(row => row.workspaceId === workspaceId)),
      grant: vi.fn(async () => ({ id: "ffffffff-0000-4000-8000-000000000009", status: "active" as const, expiresAt: "2026-11-01T00:00:00.000Z" })),
    } satisfies AgencyGrantPorts;
  }

  it("is access: owner only, sign-in, and granted through the grant RPC when signed in", async () => {
    const p = ports([pendingGrant()]);
    const adapter = agencyGrantAdapter(p);
    const item = await proposeOne(adapter);
    expect(item.kind).toBe("access.grant");
    expect(item.signInRequired).toBe(true);
    expect(item.adminMayDecide).toBe(false);
    await commonFailurePaths(adapter, item, p.grant);
    // Never from an email link, even if one reached the adapter.
    expect(await adapter.resolve(ctx, item, "approve", link)).toEqual({ outcome: "failed", reason: "sign_in_required" });
    expect(p.grant).not.toHaveBeenCalled();
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "done", receiptRef: "agency_grant:application:ffffffff-0000-4000-8000-000000000009" });
    expect(p.grant).toHaveBeenCalledWith(OWNER, { target: "application", deliveryId: "ffffffff-0000-4000-8000-000000000001", targetId: "ffffffff-0000-4000-8000-000000000002" });
  });

  it("website grants name the binding; a refused grant is failed", async () => {
    const p = ports([pendingGrant({ target: "website", targetId: "ffffffff-0000-4000-8000-000000000003", label: "your website" })]);
    p.grant.mockRejectedValueOnce(new Error("owner only"));
    const adapter = agencyGrantAdapter(p);
    const item = await proposeOne(adapter);
    expect(item.sourceId).toBe("ffffffff-0000-4000-8000-000000000001:website");
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "failed", reason: "resolver_failed" });
    p.pending.mockResolvedValue([]);
    expect(await adapter.resolve(ctx, item, "approve", session)).toEqual({ outcome: "done", reason: "already_resolved" });
  });
});

describe("wiring", () => {
  it("registers one adapter per lifecycle, each needing a member identity", async () => {
    const { workspaceSourceAdaptersA } = await import("@/platform/needs-you/sources/server");
    const adapters = workspaceSourceAdaptersA();
    expect(adapters.map(adapter => adapter.lifecycle).sort()).toEqual(["agency_grant", "provider_delivery", "standing_responsibility", "website_document", "work_responsibility"]);
    expect(adapters.every(adapter => adapter.needsMemberActor)).toBe(true);
    // The hourly cron has no actor: nothing is read, nothing is called.
    for (const adapter of adapters) expect(await adapter.propose({ workspaceId: WS })).toEqual({ items: [], complete: false });
  });
});
