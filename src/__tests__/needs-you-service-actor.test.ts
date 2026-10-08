/**
 * Owners who never sign in (product model rule 6): the hourly chase reads
 * every workspace source as Strelva (system), opens its items, and emails the
 * owner the morning digest. The service session reads and opens only; it
 * never reaches a resolver, and deciding still takes the owner's signed link.
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SendEmailInput } from "@/platform/infra/email/send";
import type { OwnerDecision, ProposedItem } from "@/platform/needs-you/contracts";
import { serviceRequestAdapter } from "@/platform/needs-you/adapters";
import type { SourceAdapter } from "@/platform/needs-you/adapters";
import type { NeedsYouStore } from "@/platform/needs-you/repository";
import { createNeedsYouService } from "@/platform/needs-you/service";
import { STRELVA_SYSTEM_LABEL, type ServiceSession } from "@/platform/needs-you/service-actor";
import { agencyGrantAdapter, type PendingAgencyGrant } from "@/platform/needs-you/sources/agency-grant";
import { applicationReleaseAdapter, type NativeAppView } from "@/platform/needs-you/sources/application-release";
import { makeRealAdapter } from "@/platform/needs-you/sources/make-real";
import { providerDeliveryAdapter } from "@/platform/needs-you/sources/provider-delivery";
import { standingResponsibilityAdapter } from "@/platform/needs-you/sources/standing-responsibility";
import { versionReleaseAdapter } from "@/platform/needs-you/sources/version-release";
import { websiteDocumentAdapter } from "@/platform/needs-you/sources/website-document";
import { workMoneyAdapter, type MoneyAllowanceView } from "@/platform/needs-you/sources/work-money";
import { workPlanAdapter, type WorkPlanView } from "@/platform/needs-you/sources/work-plan";
import { workResponsibilityAdapter, type WorkResponsibilityRecord } from "@/platform/needs-you/sources/work-responsibility";
import type { ProviderDelivery } from "@/platform/offerings/provider-delivery";
import type { ServiceRequest } from "@/platform/service-requests/types";
import type { StandingResponsibilityRecord } from "@/platform/work-execution/standing-repository";
import type { WebsiteRebuildRecord } from "@/products/websites/rebuild-contracts";
import type { WorkspaceActor } from "@/platform/workspaces/types";

const WS = "cccccccc-1000-4000-8000-000000000001";
const OTHER_WS = "cccccccc-1000-4000-8000-000000000002";
/** The owner: verified once (accepted the invitation), never signed in since. */
const OWNER: WorkspaceActor = { userId: "cccccccc-1000-4000-8000-0000000000a1", verifiedEmail: "owner@example.test" };
const DAY = 24 * 3600 * 1000;
const HASH = "a".repeat(64);
/** 07:00 in America/New_York (EDT). */
const MORNING = Date.parse("2026-10-07T11:00:00Z");

function session(over: Partial<ServiceSession> = {}): ServiceSession {
  return { kind: "strelva_system", label: STRELVA_SYSTEM_LABEL, sessionId: randomUUID(), workspaceId: WS, purpose: "needs_you_sync", onBehalf: { role: "owner" }, actor: OWNER, ...over };
}

function memoryStore(clock: { now: number }, sessionFor: (workspaceId: string) => Promise<ServiceSession | null>) {
  const items = new Map<string, OwnerDecision>();
  const opens: Array<{ via: "service" | "plain"; sessionId?: string; sourceLifecycle: string }> = [];
  function open(workspaceId: string, p: ProposedItem, openedBy: OwnerDecision["openedBy"]): OwnerDecision {
    const same = [...items.values()].find(i => i.workspaceId === workspaceId && i.sourceLifecycle === p.sourceLifecycle && i.sourceId === p.sourceId && i.revisionHash === p.revisionHash);
    if (same) return same;
    const row: OwnerDecision = {
      id: randomUUID(), workspaceId, systemId: null, kind: p.kind, route: p.route, title: p.title, detail: p.detail ?? null,
      approveEffect: p.approveEffect, notYetEffect: p.notYetEffect, sourceLifecycle: p.sourceLifecycle, sourceId: p.sourceId,
      revisionHash: p.revisionHash, urgent: p.urgent, signInRequired: ["access.grant", "money", "exit"].includes(p.kind), adminMayDecide: p.adminMayDecide,
      openHref: p.openHref ?? null, state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null,
      deliveryState: "not_sent", operatorNote: null, openedAt: new Date(clock.now).toISOString(), expiresAt: new Date(clock.now + 14 * DAY).toISOString(),
      reminded1At: null, reminded2At: null, openedBy, deliveries: [],
    };
    items.set(row.id, row);
    return row;
  }
  const store: NeedsYouStore = {
    async open(workspaceId, p) { opens.push({ via: "plain", sourceLifecycle: p.sourceLifecycle }); return open(workspaceId, p, null); },
    async openAsService(workspaceId, sessionId, p) { opens.push({ via: "service", sessionId, sourceLifecycle: p.sourceLifecycle }); return open(workspaceId, p, STRELVA_SYSTEM_LABEL); },
    serviceSession: sessionFor,
    async withdraw(_ws, id) { const i = items.get(id)!; const next = { ...i, state: "withdrawn" as const, decidedAt: "now" }; items.set(id, next); return next; },
    async read(ws, id) { const i = items.get(id); return i && i.workspaceId === ws ? i : null; },
    async list(_actor, ws) { return [...items.values()].filter(i => i.workspaceId === ws && i.state === "open" && i.route === "owner_decides"); },
    async claim(input) {
      const i = items.get(input.itemId)!;
      if (i.state !== "open") return { status: "already_handled", item: i };
      if (i.revisionHash !== input.revision) return { status: "changed", item: i };
      const next = { ...i, state: input.decision === "approve" ? "approved" as const : "declined" as const, decidedAt: "now", decidedByKind: input.by };
      items.set(i.id, next);
      return { status: "claimed", item: next };
    },
    async expire(_ws, id) { const i = items.get(id)!; const next = { ...i, state: "expired" as const, decidedAt: "now" }; items.set(id, next); return next; },
    async finish(_ws, id, outcome, reason, receiptRef) { const i = items.get(id)!; const next = { ...i, outcome, outcomeReason: reason, receiptRef }; items.set(id, next); return next; },
    async recordDelivery(_ws, id, kind, status) {
      const i = items.get(id)!;
      const next = { ...i, deliveryState: status === "sent" ? "sent" as const : status === "suppressed" ? "suppressed" as const : i.deliveryState, deliveries: [...i.deliveries, { kind, status, providerMessageId: null, reason: null, at: new Date(clock.now).toISOString() }] };
      items.set(id, next);
      return next;
    },
    async dueForDelivery() {
      return [...items.values()].filter(i => i.state === "open" && i.route === "owner_decides")
        .map(i => ({ ...i, businessName: "Mooney Fixture Firm", timezone: "America/New_York", recipient: { email: "owner@example.test", from: "owner_recipient" } }));
    },
    async linkedTenants() { return [{ workspaceId: WS, tenantId: "mooney-fixture" }]; },
    async ownerActor(_ws, recipient) { return recipient === OWNER.verifiedEmail ? OWNER : null; },
    async policies() { return []; },
    async setPolicy() { throw new Error("unused"); },
    async handled() { return []; },
  };
  return { store, items, opens };
}

// One pending ask per workspace source kind ----------------------------------------

/** Every read must come as the session's identity; anything else is refused, as the RPCs would. */
function asReader(actor: WorkspaceActor) {
  if (actor.userId !== OWNER.userId) throw new Error("access_denied");
}

function sources() {
  const resolvers = {
    serviceRequest: vi.fn(), websiteApprove: vi.fn(), websiteLaunch: vi.fn(), deliveryConfirm: vi.fn(async () => ({ ...delivery, customerDecision: "confirmed", revision: 4 }) as ProviderDelivery),
    standingApprove: vi.fn(), workApprove: vi.fn(), grant: vi.fn(), publishNative: vi.fn(), releaseCustom: vi.fn(), executePlan: vi.fn(),
    acceptCap: vi.fn(), acceptJob: vi.fn(), acceptPayer: vi.fn(), versionRelease: vi.fn(), makeRealStart: vi.fn(),
  };
  const reads: string[] = [];
  const read = (name: string, actor: WorkspaceActor) => { asReader(actor); reads.push(name); };
  const request = {
    id: "cccccccc-2000-4000-8000-000000000001", businessId: WS, status: "requested", request: "A booking page", outcome: "Clients book consults online",
    context: {}, scope: ["booking page"], provider: { kind: "strelva" },
    providerAcceptance: { status: "accepted", actorId: null, acceptedAt: null, note: null }, installationId: null, deliveryId: null,
    deliveryCommitment: { version: 1, status: "proposed", operatorId: OWNER.userId, termsReference: "Terms", deliveryDefinition: "A live booking page", scope: ["page"],
      proposedAt: "2026-10-01T00:00:00Z", startedAt: null, dueAt: null, customerAcceptedBy: null, customerAcceptedAt: null, blocker: null, result: null, decision: null },
    revision: 3, createdBy: OWNER.userId, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
  } as unknown as ServiceRequest;
  const website = {
    workId: "cccccccc-2000-4000-8000-000000000002", workspaceId: WS,
    rebuild: {
      revision: 4, title: "Mooney site", status: "review_ready",
      candidate: { revision: 2, contentHash: HASH, previewHref: "/api/websites/x", document: { siteName: "attymooney.com", facts: {}, nodes: {} } },
      approvedCandidateRevision: null, tenantId: null, launch: { receipt: null, readBack: null },
    },
  } as unknown as WebsiteRebuildRecord;
  const delivery = {
    id: "cccccccc-2000-4000-8000-000000000003", businessId: WS, installationId: "cccccccc-2000-4000-8000-000000000004",
    assignmentId: "cccccccc-2000-4000-8000-000000000005", status: "accepted", customerDecision: "pending", revision: 3,
    scope: ["Rebuild the contact form"], requestedBy: OWNER.userId, requestedAt: "2026-10-01T00:00:00.000Z",
    expiresAt: "2026-11-01T00:00:00.000Z", acceptedBy: null, acceptedAt: null, revokedBy: null, revokedAt: null,
    revocationReason: null, decidedBy: null, decidedAt: null, decisionNote: null, history: [],
  } as ProviderDelivery;
  const state = {
    standing: [{ id: "cccccccc-2000-4000-8000-000000000006", workspaceId: WS, policy: { version: 2, revision: 5, title: "Keep Google hours matching", intent: "Check weekly", ownerId: OWNER.userId, status: "proposed" } }] as unknown as StandingResponsibilityRecord[],
  };
  const work = { id: "cccccccc-2000-4000-8000-000000000007", workspaceId: WS, payload: { version: 1, revision: 2, title: "Fix the booking page", intent: "Repair the form", ownerId: OWNER.userId, status: "proposed", steps: [{ maximumCents: 0 }], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", history: [] } } as unknown as WorkResponsibilityRecord;
  const grant: PendingAgencyGrant = { target: "application", workspaceId: WS, deliveryId: "cccccccc-2000-4000-8000-000000000008", deliveryRevision: 2, targetId: "cccccccc-2000-4000-8000-000000000009", providerName: "Northside Studio", label: "your application" };
  const app: NativeAppView = {
    id: "cccccccc-2000-4000-8000-00000000000a", workspaceId: WS, title: "Intake tracker",
    candidate: { designRevision: 4, specVersion: 2, spec: { fields: ["name", "phone"] }, rehearsal: { specVersion: 2, checks: [{ passed: true }] } },
    release: { version: 1, spec: { fields: ["name"] } },
  };
  const plan: WorkPlanView = { workId: "cccccccc-2000-4000-8000-00000000000b", workspaceId: WS, status: "ready", userGoal: "Track intake calls", revision: 1, requiredDecisions: [], hasRequiredInputs: false, outputs: [{ id: "tracker", title: "Intake tracker", description: "A tracker for calls.", hasDraft: true }], executedOutputIds: [] };
  const allowance = { id: "cccccccc-2000-4000-8000-00000000000c", workspaceId: WS, payerId: OWNER.userId, status: "pending_cap_acceptance", spendingCapCents: 25_000, periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-11-01T00:00:00Z" } as MoneyAllowanceView;

  const adapters: SourceAdapter[] = [
    serviceRequestAdapter({ list: async (actor) => { read("service_request", actor); return [request]; }, change: resolvers.serviceRequest }),
    websiteDocumentAdapter({ list: async (actor) => { read("website_document", actor); return [website]; }, approve: resolvers.websiteApprove, launch: resolvers.websiteLaunch }),
    providerDeliveryAdapter({ list: async (actor) => { read("provider_delivery", actor); return [delivery]; }, workCompleted: async () => true, confirm: resolvers.deliveryConfirm }),
    standingResponsibilityAdapter({ list: async (actor) => { read("standing_responsibility", actor); return state.standing; }, approve: resolvers.standingApprove }),
    workResponsibilityAdapter({ list: async (actor) => { read("work_responsibility", actor); return [work]; }, approve: resolvers.workApprove }),
    agencyGrantAdapter({ pending: async (actor) => { read("agency_grant", actor); return [grant]; }, grant: resolvers.grant }),
    applicationReleaseAdapter({
      listNative: async (actor) => { read("application_release", actor); return [app]; }, listCustom: async () => [],
      readNative: async () => app, readCustom: async () => null, publishNative: resolvers.publishNative, releaseCustom: resolvers.releaseCustom,
    }),
    workPlanAdapter({ list: async (actor) => { read("work_plan", actor); return [plan]; }, read: async () => plan, execute: resolvers.executePlan }),
    workMoneyAdapter({
      allowances: async (actor) => { read("work_money", actor); return [allowance]; }, inbox: async () => ({ jobs: [], transitions: [] }), readJob: async () => null, payerChanges: async () => [],
      acceptAllowanceCap: resolvers.acceptCap, acceptJob: resolvers.acceptJob, acceptPayerChange: resolvers.acceptPayer,
    }),
    versionReleaseAdapter({
      enabled: async () => true, policies: async () => [], read: async () => null, release: resolvers.versionRelease,
      pending: async (actor) => { read("version_release", actor); return [{ versionId: "cccccccc-2000-4000-8000-00000000000d", systemId: "cccccccc-2000-4000-8000-00000000000e", label: "Mooney Firm, Buffalo office", rowRevision: 3, nextRelease: 2, changedPaths: ["hours"] }]; },
    }),
    makeRealAdapter({
      enabled: async () => true, policies: async () => [], start: resolvers.makeRealStart,
      readyPlans: async (actor) => { read("make_real", actor); return [{ possibilityId: "cccccccc-2000-4000-8000-00000000000f", candidateRevision: 1, fingerprint: "b".repeat(64), title: "A rebuilt attymooney.com", intent: "Replace the site.", affects: ["attymooney.com"], introducesSystem: false, systemId: "cccccccc-2000-4000-8000-000000000010" }]; },
    }),
  ];
  return { adapters, resolvers, reads, state };
}

const WORKSPACE_SOURCES = ["service_request", "website_document", "provider_delivery", "standing_responsibility", "work_responsibility", "agency_grant",
  "application_release", "work_plan", "work_money", "version_release", "make_real"];

let clock: { now: number };
let sent: SendEmailInput[];
const sendEmail = vi.fn(async (input: SendEmailInput) => { sent.push(input); return { status: "accepted" as const, providerMessageId: `msg-${sent.length}`, acceptedAt: new Date(clock.now).toISOString() }; });

function setup(sessionFor: (workspaceId: string) => Promise<ServiceSession | null>) {
  const mem = memoryStore(clock, sessionFor);
  const src = sources();
  const svc = createNeedsYouService({ store: mem.store, adapters: src.adapters, appOrigin: "https://app.example.test", now: () => clock.now, sendEmail });
  return { mem, src, svc };
}

beforeEach(() => {
  process.env.APPROVE_LINK_SECRET = "needs-you-service-actor-secret";
  clock = { now: MORNING };
  sent = [];
  sendEmail.mockClear();
});

describe("an owner who never signs in", () => {
  it("gets one morning email with an item from every workspace source, opened by Strelva (system)", async () => {
    const { mem, src, svc } = setup(async (workspaceId) => session({ workspaceId }));
    const summary = await svc.chase();
    expect(summary).toMatchObject({ digests: 1, failed: 0 });
    // Every workspace source was read, and only as the session's identity.
    expect(new Set(src.reads)).toEqual(new Set(WORKSPACE_SOURCES));
    const opened = [...mem.items.values()];
    expect(new Set(opened.map(item => item.sourceLifecycle))).toEqual(new Set(WORKSPACE_SOURCES));
    expect(opened.every(item => item.openedBy === "Strelva (system)" && item.state === "open")).toBe(true);
    expect(mem.opens.every(open => open.via === "service")).toBe(true);
    // One email, to the owner, with one decision per source.
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "owner@example.test", audience: "client", tags: { stream: "needs_you", kind: "digest" } });
    const decisions = sent[0]!.options!.decisions!;
    expect(decisions).toHaveLength(WORKSPACE_SOURCES.length);
    for (const item of opened) expect(decisions.map(d => d.title)).toContain(item.title);
    // Money, access and release lifecycles without atomic link gates need sign-in.
    const signIn = opened.filter(item => item.signInRequired);
    expect(signIn.map(item => item.sourceLifecycle).sort()).toEqual(["agency_grant", "work_money"]);
    for (const item of signIn) expect(decisions.find(d => d.title === item.title)).toMatchObject({ note: "This one needs you signed in. Open it to decide." });
    expect(decisions.filter(d => d.approve).length).toBe(WORKSPACE_SOURCES.length - signIn.length - 2);
    for (const lifecycle of ["application_release", "version_release"]) {
      const item = [...mem.items.values()].find(row => row.sourceLifecycle === lifecycle);
      expect(item).toBeDefined();
      expect(decisions.find(d => d.title === item!.title)).toMatchObject({ note: "This one needs you signed in. Open it to decide." });
      expect(decisions.find(d => d.title === item!.title)?.approve).toBeUndefined();
    }
    // Read and open only: no resolver ran.
    for (const resolver of Object.values(src.resolvers)) expect(resolver).not.toHaveBeenCalled();
  });

  it("deciding still takes the owner's signed link: Strelva (system) opened it, the owner's link resolves it", async () => {
    const { mem, src, svc } = setup(async (workspaceId) => session({ workspaceId }));
    await svc.chase();
    const item = [...mem.items.values()].find(row => row.sourceLifecycle === "provider_delivery")!;
    const result = await svc.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(result.status).toBe("done");
    expect(src.resolvers.deliveryConfirm).toHaveBeenCalledWith(OWNER, expect.objectContaining({ deliveryId: item.sourceId }));
    expect(mem.items.get(item.id)).toMatchObject({ decidedByKind: "owner_link" });
  });

  it("a source that moved on is withdrawn by the morning instead of being emailed", async () => {
    const { mem, src, svc } = setup(async (workspaceId) => session({ workspaceId }));
    clock.now = MORNING - 3 * 3600 * 1000; // 04:00: opens, no email yet
    await svc.chase();
    expect(sent).toHaveLength(0);
    src.state.standing = [];
    clock.now = MORNING;
    await svc.chase();
    const standing = [...mem.items.values()].find(row => row.sourceLifecycle === "standing_responsibility")!;
    expect(standing.state).toBe("withdrawn");
    expect(sent[0]!.options!.decisions!.map(d => d.title)).not.toContain(standing.title);
    expect(sent[0]!.options!.decisions!).toHaveLength(WORKSPACE_SOURCES.length - 1);
  });

  it("without a session (a business Strelva doesn't run, or no verified owner or admin) workspace sources stay unread", async () => {
    const { mem, src, svc } = setup(async () => null);
    const summary = await svc.chase();
    expect(src.reads).toEqual([]);
    expect(mem.items.size).toBe(0);
    expect(summary.digests).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("a session that fails to start, or names another business or purpose, is not used", async () => {
    for (const sessionFor of [
      async () => { throw new Error("database down"); },
      async () => session({ workspaceId: OTHER_WS }),
      async () => session({ purpose: "make_real_resume" }),
    ]) {
      const { mem, src, svc } = setup(sessionFor);
      await expect(svc.chase()).resolves.toMatchObject({ digests: 0 });
      expect(src.reads).toEqual([]);
      expect(mem.items.size).toBe(0);
    }
  });

  it("one session per business per chase", async () => {
    const sessionFor = vi.fn(async (workspaceId: string) => session({ workspaceId }));
    const { svc } = setup(sessionFor);
    await svc.chase();
    expect(sessionFor).toHaveBeenCalledTimes(1);
    expect(sessionFor).toHaveBeenCalledWith(WS);
  });
});
