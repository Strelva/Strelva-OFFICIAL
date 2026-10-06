/**
 * Needs you adapters for app releases, work plan outputs, money and exit.
 * Each adapter is driven through its ports; the resolver it calls must be the
 * lifecycle's own, and the full service decides sign-in-only kinds.
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerDecision, ProposedItem } from "@/platform/needs-you/contracts";
import type { SourceAdapter } from "@/platform/needs-you/adapters";
import { NeedsYouRefusedError, type NeedsYouStore } from "@/platform/needs-you/repository";
import { createNeedsYouService } from "@/platform/needs-you/service";
import { applicationReleaseAdapter, type ApplicationReleasePorts, type CustomAppView, type NativeAppView } from "@/platform/needs-you/sources/application-release";
import { workPlanAdapter, type WorkPlanPorts, type WorkPlanView } from "@/platform/needs-you/sources/work-plan";
import { workMoneyAdapter, type MoneyAllowanceView, type MoneyJobView, type MoneyPayerChangeView, type WorkMoneyPorts } from "@/platform/needs-you/sources/work-money";
import { workspaceExitAdapter } from "@/platform/needs-you/sources/workspace-exit";

const WS = "bbbbbbbb-0000-4000-8000-000000000001";
const OTHER_WS = "bbbbbbbb-0000-4000-8000-000000000002";
const OWNER = { userId: "bbbbbbbb-0000-4000-8000-0000000000a1", verifiedEmail: "owner@example.test" };
const OTHER_OWNER = { userId: "bbbbbbbb-0000-4000-8000-0000000000a2", verifiedEmail: "partner@example.test" };
const DAY = 24 * 3600 * 1000;

function memoryStore(clock: { now: number }) {
  const items = new Map<string, OwnerDecision>();
  const store: NeedsYouStore = {
    async open(workspaceId, p: ProposedItem) {
      const same = [...items.values()].find(i => i.workspaceId === workspaceId && i.sourceLifecycle === p.sourceLifecycle && i.sourceId === p.sourceId && i.revisionHash === p.revisionHash);
      if (same) return same;
      for (const i of items.values()) if (i.workspaceId === workspaceId && i.sourceId === p.sourceId && i.state === "open") items.set(i.id, { ...i, state: "superseded", decidedAt: "now" });
      const row: OwnerDecision = {
        id: randomUUID(), workspaceId, systemId: null, kind: p.kind, route: p.route, title: p.title, detail: p.detail ?? null,
        approveEffect: p.approveEffect, notYetEffect: p.notYetEffect, sourceLifecycle: p.sourceLifecycle, sourceId: p.sourceId,
        revisionHash: p.revisionHash, urgent: p.urgent, signInRequired: ["access.grant", "money", "exit"].includes(p.kind), adminMayDecide: p.adminMayDecide,
        openHref: p.openHref ?? null, state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null,
        deliveryState: "not_sent", operatorNote: null, openedAt: new Date(clock.now).toISOString(), expiresAt: new Date(clock.now + 14 * DAY).toISOString(),
        reminded1At: null, reminded2At: null, deliveries: [],
      };
      items.set(row.id, row);
      return row;
    },
    async withdraw(_ws, id) { const i = items.get(id)!; const next = { ...i, state: "withdrawn" as const, decidedAt: "now" }; items.set(id, next); return next; },
    async read(ws, id) { const i = items.get(id); return i && i.workspaceId === ws ? i : null; },
    async list(_actor, ws) { return [...items.values()].filter(i => i.workspaceId === ws && i.state === "open" && i.route === "owner_decides"); },
    async claim(input) {
      const i = items.get(input.itemId)!;
      if (i.state !== "open") return { status: "already_handled", item: i };
      if (i.revisionHash !== input.revision) return { status: "changed", item: i };
      if (input.by === "owner_link" && i.signInRequired) throw new NeedsYouRefusedError("owner_decision_sign_in_required", "x");
      const next = { ...i, state: input.decision === "approve" ? "approved" as const : "declined" as const, decidedAt: "now", decidedByKind: input.by };
      items.set(i.id, next);
      return { status: "claimed", item: next };
    },
    async expire(_ws, id) { const i = items.get(id)!; const next = { ...i, state: "expired" as const, decidedAt: "now" }; items.set(id, next); return next; },
    async finish(_ws, id, outcome, reason, receiptRef) { const i = items.get(id)!; const next = { ...i, outcome, outcomeReason: reason, receiptRef }; items.set(id, next); return next; },
    async recordDelivery(_ws, id) { return items.get(id)!; },
    async dueForDelivery() {
      return [...items.values()].filter(i => i.state === "open" && i.route === "owner_decides")
        .map(i => ({ ...i, businessName: "Fixture", timezone: "America/New_York", recipient: { email: "owner@example.test", from: "owner_recipient" } }));
    },
    async linkedTenants() { return []; },
    async ownerActor(_ws, recipient) { return recipient === "owner@example.test" ? OWNER : null; },
    async policies() { return []; },
    async setPolicy() { throw new Error("unused"); },
    async handled() { return []; },
  };
  return { store, items };
}

let clock: { now: number };
let mem: ReturnType<typeof memoryStore>;

function service(adapters: SourceAdapter[]) {
  return createNeedsYouService({ store: mem.store, adapters, appOrigin: "https://app.example.test", now: () => clock.now, sendEmail: vi.fn(async () => ({ status: "suppressed" as const, reason: "gated" })) });
}

beforeEach(() => {
  process.env.APPROVE_LINK_SECRET = "needs-you-sources-b-secret";
  clock = { now: Date.parse("2026-10-06T15:00:00Z") };
  mem = memoryStore(clock);
});

// Apps ------------------------------------------------------------------------

const NATIVE_ID = "bbbbbbbb-0000-4000-8000-0000000000c1";
const CUSTOM_ID = "bbbbbbbb-0000-4000-8000-0000000000c2";
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

function native(over: Partial<NativeAppView> = {}): NativeAppView {
  return {
    id: NATIVE_ID, workspaceId: WS, title: "Intake tracker",
    candidate: { designRevision: 4, specVersion: 2, spec: { fields: ["name", "phone"] }, rehearsal: { specVersion: 2, checks: [{ passed: true }] } },
    release: { version: 1, spec: { fields: ["name"] } },
    ...over,
  };
}
function customApp(over: Partial<CustomAppView> = {}): CustomAppView {
  return {
    workId: CUSTOM_ID, workspaceId: WS, title: "Quote builder", status: "draft",
    candidate: { revision: 3, version: 1, artifact: { artifactDigest: DIGEST_A, review: { artifactDigest: DIGEST_A } } },
    currentReleaseVersion: null, releases: [],
    ...over,
  };
}

function appPorts(state: { native: NativeAppView[]; custom: CustomAppView[] }) {
  const ports: ApplicationReleasePorts & { publishNative: ReturnType<typeof vi.fn>; releaseCustom: ReturnType<typeof vi.fn> } = {
    listNative: async () => state.native,
    listCustom: async () => state.custom,
    readNative: async (_a, id) => state.native.find(app => app.id === id) ?? null,
    readCustom: async (_a, id) => state.custom.find(app => app.workId === id) ?? null,
    publishNative: vi.fn(async () => {
      state.native = state.native.map(app => ({ ...app, release: { version: (app.release?.version ?? 0) + 1, spec: app.candidate.spec } }));
    }),
    releaseCustom: vi.fn(async () => {
      state.custom = state.custom.map(app => ({ ...app, status: "released" as const, currentReleaseVersion: 1, releases: [{ version: 1, artifactDigest: app.candidate.artifact!.artifactDigest }] }));
    }),
  };
  return ports;
}

describe("app releases", () => {
  it("proposes a rehearsed native change and a reviewed first custom release, and nothing else", async () => {
    const state = {
      native: [native(), native({ id: "n-unrehearsed", candidate: { ...native().candidate, rehearsal: null } }), native({ id: "n-same", candidate: { ...native().candidate, spec: { fields: ["name"] } } }), native({ id: "n-foreign", workspaceId: OTHER_WS })],
      custom: [customApp(), customApp({ workId: "c-unreviewed", candidate: { revision: 1, version: 1, artifact: { artifactDigest: DIGEST_B, review: null } } })],
    };
    const { items } = await applicationReleaseAdapter(appPorts(state)).propose({ workspaceId: WS, actor: OWNER });
    expect(items.map(i => [i.sourceId, i.kind, i.adminMayDecide])).toEqual([
      [`native:${NATIVE_ID}`, "system.change_live", true],
      [`custom:${CUSTOM_ID}`, "system.go_live", false],
    ]);
    expect(items[1]!.openHref).toBe(`/custom-applications/${CUSTOM_ID}/manage`);
  });

  it("a member read is required; without one nothing is proposed or resolved", async () => {
    const adapter = applicationReleaseAdapter(appPorts({ native: [native()], custom: [] }));
    expect(await adapter.propose({ workspaceId: WS })).toEqual({ items: [], complete: false });
    expect(adapter.needsMemberActor).toBe(true);
  });

  it("approve publishes through the applications lifecycle at the opened revision, and the item clears", async () => {
    const state = { native: [native()], custom: [customApp()] };
    const ports = appPorts(state);
    const svc = service([applicationReleaseAdapter(ports)]);
    const { items } = await svc.list(OWNER, WS);
    const item = items.find(i => i.sourceId.startsWith("native"))!;
    const result = await svc.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "session", actor: OWNER } });
    expect(result.status).toBe("done");
    expect(ports.publishNative).toHaveBeenCalledWith(OWNER, NATIVE_ID, { expectedCandidateRevision: 4, expectedReleaseVersion: 1 });
    expect(ports.releaseCustom).not.toHaveBeenCalled();
    expect(await applicationReleaseAdapter(ports).currentRevision({ workspaceId: WS, actor: OWNER }, item.sourceId)).toBeNull();
  });

  it("approve on a custom app runs the custom release resolver; an email link works for a change but not as a non-member", async () => {
    const state = { native: [], custom: [customApp()] };
    const ports = appPorts(state);
    const svc = service([applicationReleaseAdapter(ports)]);
    const [item] = (await svc.list(OWNER, WS)).items;
    const refused = await svc.decide({ workspaceId: WS, itemId: item!.id, revision: item!.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "stranger@example.test" } });
    expect(refused.status).toBe("sign_in");
    const done = await svc.decide({ workspaceId: WS, itemId: item!.id, revision: item!.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(done.status).toBe("done");
    expect(ports.releaseCustom).toHaveBeenCalledWith(OWNER, CUSTOM_ID, { expectedCandidateRevision: 3, expectedReleaseVersion: null });
  });

  it("not yet and a lapse change nothing at the source", async () => {
    const ports = appPorts({ native: [native()], custom: [] });
    const svc = service([applicationReleaseAdapter(ports)]);
    const [item] = (await svc.list(OWNER, WS)).items;
    expect((await svc.decide({ workspaceId: WS, itemId: item!.id, revision: item!.revisionHash, decision: "not_yet", by: { kind: "session", actor: OWNER } })).status).toBe("done");
    const lapse = await applicationReleaseAdapter(ports).resolve({ workspaceId: WS }, item!, "not_yet", { kind: "expiry" });
    expect(lapse).toEqual({ outcome: "done", reason: "Expired, nothing changed" });
    expect(ports.publishNative).not.toHaveBeenCalled();
  });

  it("a resolver failure is failed and leaves the candidate unpublished", async () => {
    const ports = appPorts({ native: [native()], custom: [] });
    ports.publishNative.mockRejectedValueOnce(new Error("publish_application_candidate refused"));
    const svc = service([applicationReleaseAdapter(ports)]);
    const [item] = (await svc.list(OWNER, WS)).items;
    const result = await svc.decide({ workspaceId: WS, itemId: item!.id, revision: item!.revisionHash, decision: "approve", by: { kind: "session", actor: OWNER } });
    expect(result.status).toBe("failed");
    expect(result.item?.outcomeReason).toBe("resolver_failed");
  });

  it("a new candidate supersedes the emailed revision; another business's app is never resolved", async () => {
    const state = { native: [native()], custom: [] as CustomAppView[] };
    const ports = appPorts(state);
    const svc = service([applicationReleaseAdapter(ports)]);
    const [item] = (await svc.list(OWNER, WS)).items;
    state.native = [native({ candidate: { ...native().candidate, designRevision: 5 } })];
    const stale = await svc.decide({ workspaceId: WS, itemId: item!.id, revision: item!.revisionHash, decision: "approve", by: { kind: "session", actor: OWNER } });
    expect(stale.status).toBe("changed");
    const adapter = applicationReleaseAdapter(ports);
    expect(await adapter.currentRevision({ workspaceId: OTHER_WS, actor: OWNER }, item!.sourceId)).toBeNull();
    expect(await adapter.resolve({ workspaceId: OTHER_WS }, item!, "approve", { kind: "session", actor: OWNER })).toEqual({ outcome: "done", reason: "already_resolved" });
    expect(ports.publishNative).not.toHaveBeenCalled();
  });
});

// Work plans --------------------------------------------------------------------

const PLAN_ID = "bbbbbbbb-0000-4000-8000-0000000000d1";
function plan(over: Partial<WorkPlanView> = {}): WorkPlanView {
  return {
    workId: PLAN_ID, workspaceId: WS, status: "ready", userGoal: "Track intake calls", revision: 1, requiredDecisions: [], hasRequiredInputs: false,
    outputs: [
      { id: "tracker", title: "Intake tracker", description: "A tracker for calls.", hasDraft: true },
      { id: "nodraft", title: "Something without a draft", description: "Needs the product flow.", hasDraft: false },
    ],
    executedOutputIds: [],
    ...over,
  };
}
function planPorts(state: { plans: WorkPlanView[] }) {
  const ports: WorkPlanPorts & { execute: ReturnType<typeof vi.fn> } = {
    list: async () => state.plans,
    read: async (_a, ws, id) => state.plans.find(p => p.workId === id && p.workspaceId === ws) ?? null,
    execute: vi.fn(async (_actor, input: { outputId: string }) => {
      state.plans = state.plans.map(p => ({ ...p, executedOutputIds: [...p.executedOutputIds, input.outputId] }));
      return { status: "completed" as const, nativeWorkId: "bbbbbbbb-0000-4000-8000-0000000000d9" };
    }),
  };
  return ports;
}

describe("work plan outputs", () => {
  it("proposes only drafted, unexecuted outputs of a ready plan without open questions", async () => {
    const state = { plans: [plan(), plan({ workId: "p-decisions", requiredDecisions: [{ id: "budget" }] }), plan({ workId: "p-inputs", hasRequiredInputs: true }), plan({ workId: "p-scoping", status: "needs_scoping" }), plan({ workId: "p-done", executedOutputIds: ["tracker"] }), plan({ workId: "p-foreign", workspaceId: OTHER_WS })] };
    const { items } = await workPlanAdapter(planPorts(state)).propose({ workspaceId: WS, actor: OWNER });
    expect(items.map(i => [i.sourceId, i.kind, i.route])).toEqual([[`${PLAN_ID}:tracker`, "request.scope", "owner_decides"]]);
  });

  it("approve runs the plan's own output execution once; afterwards nothing waits", async () => {
    const state = { plans: [plan()] };
    const ports = planPorts(state);
    const svc = service([workPlanAdapter(ports)]);
    const [item] = (await svc.list(OWNER, WS)).items;
    const result = await svc.decide({ workspaceId: WS, itemId: item!.id, revision: item!.revisionHash, decision: "approve", by: { kind: "session", actor: OWNER } });
    expect(result.status).toBe("done");
    expect(result.item?.receiptRef).toContain(`work_plan_output:${PLAN_ID}:tracker`);
    expect(ports.execute).toHaveBeenCalledWith(OWNER, { workspaceId: WS, planWorkId: PLAN_ID, outputId: "tracker", expectedPlanRevision: 1 });
    expect((await svc.list(OWNER, WS)).items).toEqual([]);
  });

  it("not yet, lapse, failure and wrong business", async () => {
    const ports = planPorts({ plans: [plan()] });
    const svc = service([workPlanAdapter(ports)]);
    const [item] = (await svc.list(OWNER, WS)).items;
    const adapter = workPlanAdapter(ports);
    expect(await adapter.resolve({ workspaceId: WS }, item!, "not_yet", { kind: "session", actor: OWNER })).toEqual({ outcome: "done", reason: "Not yet" });
    expect(await adapter.resolve({ workspaceId: WS }, item!, "approve", { kind: "expiry" })).toEqual({ outcome: "done", reason: "Expired, nothing changed" });
    expect(await adapter.resolve({ workspaceId: OTHER_WS }, item!, "approve", { kind: "session", actor: OWNER })).toEqual({ outcome: "done", reason: "already_resolved" });
    expect(ports.execute).not.toHaveBeenCalled();
    ports.execute.mockRejectedValueOnce(new Error("A source used by this plan changed."));
    expect(await adapter.resolve({ workspaceId: WS }, item!, "approve", { kind: "session", actor: OWNER })).toEqual({ outcome: "failed", reason: "resolver_failed" });
  });
});

// Money ---------------------------------------------------------------------------

const ALLOWANCE_ID = "bbbbbbbb-0000-4000-8000-0000000000e1";
const JOB_ID = "bbbbbbbb-0000-4000-8000-0000000000e2";
const PAYER_ID = "bbbbbbbb-0000-4000-8000-0000000000e3";

function moneyState() {
  return {
    allowances: [{ id: ALLOWANCE_ID, workspaceId: WS, payerId: OWNER.userId, status: "pending_cap_acceptance", spendingCapCents: 25_000, periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-11-01T00:00:00Z" }] as MoneyAllowanceView[],
    jobs: [{ id: JOB_ID, workspaceId: WS, status: "draft", productId: "applications", estimateCents: 4_000, maxAuthorizedCents: 10_000 }] as MoneyJobView[],
    transitions: [{ id: PAYER_ID, workspaceId: WS, successorUserId: OWNER.userId, proposerEmail: "founder@example.test", status: "pending" }] as MoneyPayerChangeView[],
  };
}
function moneyPorts(state: ReturnType<typeof moneyState>) {
  const ports: WorkMoneyPorts & Record<"acceptAllowanceCap" | "acceptJob" | "acceptPayerChange", ReturnType<typeof vi.fn>> = {
    allowances: async () => state.allowances,
    inbox: async (actor) => ({ jobs: actor.userId === OWNER.userId ? state.jobs : [], transitions: state.transitions.filter(t => t.successorUserId === actor.userId) }),
    readJob: async (_a, id) => state.jobs.find(job => job.id === id) ?? null,
    payerChanges: async () => state.transitions,
    acceptAllowanceCap: vi.fn(async (_a, id: string) => { state.allowances = state.allowances.map(a => a.id === id ? { ...a, status: "active" } : a); }),
    acceptJob: vi.fn(async (_a, id: string) => { state.jobs = state.jobs.map(j => j.id === id ? { ...j, status: "accepted" } : j); }),
    acceptPayerChange: vi.fn(async (_a, id: string) => { state.transitions = state.transitions.map(t => t.id === id ? { ...t, status: "accepted" } : t); }),
  };
  return ports;
}

describe("money", () => {
  it("proposes the payer's own cap, job budget and payer change as sign-in, owner-only items", async () => {
    const { items } = await workMoneyAdapter(moneyPorts(moneyState())).propose({ workspaceId: WS, actor: OWNER });
    expect(items.map(i => i.sourceId)).toEqual([`allowance:${ALLOWANCE_ID}`, `job:${JOB_ID}`, `payer:${PAYER_ID}`]);
    for (const item of items) expect(item).toMatchObject({ kind: "money", route: "owner_decides", adminMayDecide: false, openHref: `/workspace/account?workspaceId=${WS}` });
  });

  it("nothing is proposed for a member who isn't the payer, and their view never withdraws the payer's items", async () => {
    const state = moneyState();
    const ports = moneyPorts(state);
    expect((await workMoneyAdapter(ports).propose({ workspaceId: WS, actor: OTHER_OWNER })).items).toEqual([]);
    const svc = service([workMoneyAdapter(ports)]);
    expect((await svc.list(OWNER, WS)).items).toHaveLength(3);
    state.allowances = [];
    // The partner can't see the allowance: unknown, not gone.
    expect((await svc.list(OTHER_OWNER, WS)).items).toHaveLength(3);
  });

  it("an email link never decides money; signed in, each item runs its own lifecycle resolver", async () => {
    const ports = moneyPorts(moneyState());
    const svc = service([workMoneyAdapter(ports)]);
    const items = (await svc.list(OWNER, WS)).items;
    for (const item of items) {
      const link = await svc.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
      expect(link.status).toBe("sign_in");
    }
    expect(ports.acceptAllowanceCap).not.toHaveBeenCalled();
    for (const item of items) {
      const result = await svc.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "session", actor: OWNER } });
      expect(result.status).toBe("done");
    }
    expect(ports.acceptAllowanceCap).toHaveBeenCalledWith(OWNER, ALLOWANCE_ID);
    expect(ports.acceptJob).toHaveBeenCalledWith(OWNER, JOB_ID);
    expect(ports.acceptPayerChange).toHaveBeenCalledWith(OWNER, PAYER_ID);
  });

  it("the adapter itself refuses a link resolution, and not yet / lapse change nothing", async () => {
    const ports = moneyPorts(moneyState());
    const adapter = workMoneyAdapter(ports);
    const [item] = (await service([adapter]).list(OWNER, WS)).items;
    expect(await adapter.resolve({ workspaceId: WS }, item!, "approve", { kind: "owner_link", recipient: "owner@example.test", actor: OWNER })).toEqual({ outcome: "failed", reason: "sign_in_required" });
    expect(await adapter.resolve({ workspaceId: WS }, item!, "not_yet", { kind: "session", actor: OWNER })).toEqual({ outcome: "done", reason: "Not yet" });
    expect(await adapter.resolve({ workspaceId: WS }, item!, "approve", { kind: "expiry" })).toEqual({ outcome: "done", reason: "Expired, nothing changed" });
    expect(ports.acceptAllowanceCap).not.toHaveBeenCalled();
  });

  it("a payer RPC refusal is failed and the source stays pending; another business's item is never resolved", async () => {
    const state = moneyState();
    const ports = moneyPorts(state);
    ports.acceptJob.mockRejectedValueOnce(new Error("Only the exact payer can accept this job limit."));
    const svc = service([workMoneyAdapter(ports)]);
    const job = (await svc.list(OWNER, WS)).items.find(i => i.sourceId.startsWith("job:"))!;
    const result = await svc.decide({ workspaceId: WS, itemId: job.id, revision: job.revisionHash, decision: "approve", by: { kind: "session", actor: OWNER } });
    expect(result.status).toBe("failed");
    expect(state.jobs[0]!.status).toBe("draft");
    const adapter = workMoneyAdapter(ports);
    expect(await adapter.resolve({ workspaceId: OTHER_WS }, job, "approve", { kind: "session", actor: OWNER })).toEqual({ outcome: "failed", reason: "resolver_failed" });
    expect(ports.acceptJob).toHaveBeenCalledTimes(1);
  });
});

// Exit --------------------------------------------------------------------------

describe("exit and export", () => {
  it("proposes nothing: exit and export are one owner command each, with nothing left waiting", async () => {
    const adapter = workspaceExitAdapter();
    expect(adapter.lifecycle).toBe("workspace_exit");
    expect(await adapter.propose({ workspaceId: WS, actor: OWNER })).toEqual({ items: [], complete: true });
    expect(await adapter.currentRevision({ workspaceId: WS, actor: OWNER }, "anything")).toBeNull();
  });

  it("an exit item can't be decided by link, and the adapter never runs an exit from Needs you", async () => {
    const adapter = workspaceExitAdapter();
    const exitItem: ProposedItem = {
      kind: "exit", route: "owner_decides", title: "Leave Strelva", approveEffect: "x", notYetEffect: "y",
      sourceLifecycle: "workspace_exit", sourceId: "exit-1", revisionHash: "c".repeat(64), urgent: false, adminMayDecide: false,
    };
    const opened = await mem.store.open(WS, exitItem);
    const svc = service([adapter]);
    const link = await svc.decide({ workspaceId: WS, itemId: opened.id, revision: opened.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(link.status).toBe("sign_in");
    expect(await adapter.resolve({ workspaceId: WS }, opened, "approve", { kind: "session", actor: OWNER })).toEqual({ outcome: "failed", reason: "exit_runs_from_its_own_screen" });
  });
});
