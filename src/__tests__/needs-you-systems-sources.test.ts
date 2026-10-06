import { describe, expect, it, vi } from "vitest";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { createInMemoryPossibilityRepository, createPossibility, markReady, recordRehearsal, rehearsePossibility, type Possibility, type PossibilityInput } from "@/platform/possibilities";
import {
  approvalProblem,
  createInMemoryActivationRepository,
  createInMemoryApprovalRecords,
  createInMemoryLiveSystems,
  createIsolatedAdapter,
  createMakeReal,
  effectApprovalSubject,
  planApprovalAuthority,
  planApprovalSubject,
  planFingerprint,
} from "@/platform/make-real";
import { prepareIsolatedPossibility } from "@/platform/make-real/sandbox";
import { uuidFromSeed } from "@/platform/business-record/tenant-import";
import { systemOriginId } from "@/platform/systems";
import {
  createInMemoryConnectionOwnership,
  createInMemoryVersionStore,
  createSystemVersions,
  createVersionReleaseGate,
  type JsonObject,
  type VersionActor,
} from "@/platform/system-versions";
import { createNeedsYouService } from "@/platform/needs-you/service";
import type { SourceAdapter } from "@/platform/needs-you/adapters";
import { makeRealAdapter, makeRealSourceId, needsYouMakeRealApprovals, type MakeRealSourcePorts, type ReadyPlan } from "@/platform/needs-you/sources/make-real";
import { needsYouVersionReleaseApprovals, versionReleaseAdapter, versionReleaseRevision, type PendingVersionRelease, type VersionReleaseSourcePorts } from "@/platform/needs-you/sources/version-release";
import { makeRealThroughNeedsYou } from "@/platform/needs-you/systems-sources";
import { needsYouMemoryStore } from "./support/needs-you-memory";

vi.mock("@/experience/systems/server", () => ({ makeRealForWorkspace: vi.fn(), readyMakeRealPlans: vi.fn() }));

const BIZ = uuidFromSeed("business:needs-you-make-real");
const owner: WorkspaceActor = { userId: "11111111-0000-4000-8000-0000000000a1", verifiedEmail: "owner@fixture.test" };
const admin: WorkspaceActor = { userId: "11111111-0000-4000-8000-0000000000a2", verifiedEmail: "admin@fixture.test" };
const SYS = { businessId: BIZ, systemId: systemOriginId(BIZ, { kind: "saved_work", ref: "booking-page" }) };
const at = "2026-10-06T12:00:00.000Z";

function service(store: ReturnType<typeof needsYouMemoryStore>["store"], adapters: SourceAdapter[]) {
  return createNeedsYouService({ store, adapters, appOrigin: "https://app.example.test", now: () => Date.parse(at), sendEmail: vi.fn() });
}

// ── The plan approval inside Make real ─────────────────────────────────────

async function world() {
  const live = createInMemoryLiveSystems();
  const r1 = live.seed(SYS, "Booking page", { headline: "Book a fitting", deposit: 0 });
  const adapters = [createIsolatedAdapter("calendar"), createIsolatedAdapter("payment"), createIsolatedAdapter("publish")];
  const possibilities = createInMemoryPossibilityRepository();
  const approvals = createInMemoryApprovalRecords();
  let n = 0;
  const makeReal = createMakeReal({
    possibilities, activations: createInMemoryActivationRepository(), live: live.port, adapters, approvals, clock: () => at, ids: () => `act-${++n}`,
    authority: { async check(actor) { return actor.userId === owner.userId ? { allowed: true, grantId: "grant" } : { allowed: false, reason: "not a member" }; } },
    checks: { async run() { return { passed: true, detail: "ok" }; } },
  });
  const input: PossibilityInput = {
    title: "Take deposits for fittings", intent: "Collect a deposit when a fitting is booked.",
    changes: [{ baseline: { ...SYS, revisionId: r1, number: 1 }, candidate: { summary: "Deposit on booking", content: { headline: "Book a fitting", deposit: 2500 } } }],
    effects: [
      { id: "slot", kind: "calendar", system: { systemId: SYS.systemId }, description: "Create the fitting booking type", request: { minutes: 45 } },
      { id: "charge", kind: "payment", system: { systemId: SYS.systemId }, description: "Create a $25 deposit link", request: { amountCents: 2500 } },
    ],
    checks: [{ id: "deposit-live", description: "A booking asks for the deposit" }],
  };
  async function ready(patch: Partial<PossibilityInput> = {}): Promise<Possibility> {
    let p = createPossibility({ ...input, ...patch }, { id: "p1", businessId: BIZ, actorId: owner.userId, at });
    p = recordRehearsal(p, await rehearsePossibility(p, live.port, adapters, at), p.revision, owner.userId, at);
    p = await markReady(p, live.port, p.revision, owner.userId, at);
    await possibilities.create(p);
    return p;
  }
  return { live, r1, approvals, makeReal, ready, possibilities };
}

describe("one owner approval per Make real plan", () => {
  it("one plan approval covers every effect that needs one, and the activation runs", async () => {
    const w = await world();
    const p = await w.ready();
    w.approvals.record({ id: "plan-1", businessId: BIZ, subject: planApprovalSubject(p), status: "approved", decidedBy: owner.userId, decidedAt: at });
    const started = await w.makeReal.start(owner, BIZ, "p1", { approvals: p.effects.map((e) => ({ effectId: e.id, approvalId: "plan-1" })) });
    expect(started.approvals.map((a) => [a.effectId, a.approvalId])).toEqual([["slot", "plan-1"], ["charge", "plan-1"]]);
    const done = await w.makeReal.run(owner, BIZ, started.id);
    expect(done.status).toBe("made_real");
    const receipts = done.steps.filter((s) => s.kind === "effect").map((s) => s.receipt?.approvalId);
    expect(receipts).toEqual(["plan-1", "plan-1"]);
  });

  it("each effect must sit inside the plan the owner approved", async () => {
    const w = await world();
    const p = await w.ready();
    const record = { id: "plan-1", businessId: BIZ, subject: planApprovalSubject(p), status: "approved" as const };
    expect(approvalProblem(record, BIZ, p, p.effects[0]!)).toBeNull();
    const stranger = { ...p.effects[0]!, id: "smuggled", request: { minutes: 600 } };
    expect(approvalProblem(record, BIZ, p, stranger)).toBe("the effect is not part of the approved plan");
    const changed = { ...p, effects: [{ ...p.effects[0]!, request: { minutes: 90 } }, p.effects[1]!] };
    expect(approvalProblem(record, BIZ, changed, changed.effects[0]!)).toBe("the approval was given for a different plan");
    expect(approvalProblem({ ...record, status: "pending" }, BIZ, p, p.effects[0]!)).toBe("the approval is pending");
    expect(approvalProblem({ ...record, businessId: "elsewhere" }, BIZ, p, p.effects[0]!)).toMatch(/no approval record/);
    // An effect approval still works the old way.
    expect(approvalProblem({ id: "e", businessId: BIZ, subject: effectApprovalSubject(p, p.effects[0]!), status: "approved" }, BIZ, p, p.effects[0]!)).toBeNull();
  });

  it("the fingerprint covers changes, effects, connections and introduced Systems", async () => {
    const w = await world();
    const p = await w.ready();
    const base = planFingerprint(p);
    expect(planFingerprint({ ...p, changes: [{ ...p.changes[0]!, candidate: { summary: "Deposit on booking", content: { deposit: 9999 } } }] })).not.toBe(base);
    expect(planFingerprint({ ...p, candidateRevision: p.candidateRevision + 1 })).not.toBe(base);
    expect(planFingerprint({ ...p, introduces: [{ key: "consult", name: "Consult booking", purpose: "Book consults", candidate: { summary: "x", content: {} }, extractedFrom: [], conflicts: [] }] })).not.toBe(base);
    // A pinned baseline revision is live state, checked separately: not part of what the owner approved.
    expect(planFingerprint({ ...p, changes: [{ ...p.changes[0]!, baseline: { ...p.changes[0]!.baseline, revisionId: "other-revision" } }] })).toBe(base);
  });

  it("a dismissal after start stops the next write", async () => {
    const w = await world();
    const p = await w.ready();
    w.approvals.record({ id: "plan-1", businessId: BIZ, subject: planApprovalSubject(p), status: "approved" });
    const started = await w.makeReal.start(owner, BIZ, "p1", { approvals: p.effects.map((e) => ({ effectId: e.id, approvalId: "plan-1" })) });
    w.approvals.setStatus("plan-1", "dismissed");
    const after = await w.makeReal.run(owner, BIZ, started.id);
    expect(after.status).not.toBe("made_real");
    expect(after.steps.filter((s) => s.kind === "effect").every((s) => s.status !== "completed")).toBe(true);
  });

  it("the activation authority holds only while the plan approval does", async () => {
    const w = await world();
    const p = await w.ready();
    w.approvals.record({ id: "plan-1", businessId: BIZ, subject: planApprovalSubject(p), status: "approved" });
    const base = { check: vi.fn(async () => ({ allowed: true as const, grantId: "g" })) };
    const authority = planApprovalAuthority(base, { approvals: w.approvals, businessId: BIZ, approvalId: "plan-1", plan: async () => p });
    expect(await authority.check(owner, { businessId: BIZ, scope: "system.activate" })).toEqual({ allowed: true, grantId: "g" });
    w.approvals.setStatus("plan-1", "dismissed");
    expect(await authority.check(owner, { businessId: BIZ, scope: "site.publish" })).toMatchObject({ allowed: false, reason: expect.stringMatching(/dismissed/) });
    // Other scopes are not the plan's to decide.
    expect(await authority.check(owner, { businessId: BIZ, scope: "calendar.write" })).toEqual({ allowed: true, grantId: "g" });
  });
});

// ── Make real through Needs you ────────────────────────────────────────────

function plan(over: Partial<ReadyPlan> = {}): ReadyPlan {
  return { possibilityId: "website-rebuild:w1", candidateRevision: 1, fingerprint: "a".repeat(64), title: "A rebuilt fixture.test", intent: "Replace fixture.test with the rebuild.", affects: ["fixture.test"], introducesSystem: false, systemId: SYS.systemId, ...over };
}

function makeRealPorts(over: Partial<MakeRealSourcePorts> & { plans?: ReadyPlan[] } = {}) {
  const state = { plans: over.plans ?? [plan()] };
  const start = vi.fn<MakeRealSourcePorts["start"]>(async () => ({ status: "in_progress", isolated: true, liveUnchanged: true, headline: "Nothing changed yet." }));
  const ports: MakeRealSourcePorts = {
    enabled: async () => true,
    readyPlans: async () => state.plans,
    policies: async () => [],
    start,
    ...over,
  };
  return { ports, start, state };
}

describe("the make_real source", () => {
  it("opens one owner item per Ready plan, bound to the plan fingerprint", async () => {
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner" } });
    const { ports } = makeRealPorts({ plans: [plan(), plan({ possibilityId: "website-rebuild:w2", fingerprint: "b".repeat(64), introducesSystem: true })] });
    const { items } = await service(mem.store, [makeRealAdapter(ports)]).list(owner, BIZ);
    expect(items.map((i) => [i.kind, i.route, i.sourceId, i.revisionHash, i.adminMayDecide])).toEqual([
      ["system.change_live", "owner_decides", makeRealSourceId("website-rebuild:w1", 1), "a".repeat(64), false],
      ["system.go_live", "owner_decides", makeRealSourceId("website-rebuild:w2", 1), "b".repeat(64), false],
    ]);
    expect(items[0]!.openHref).toContain("view=system");
  });

  it("Strelva's policy routes a change to its own review, never below the floor", async () => {
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner" } });
    const { ports } = makeRealPorts({ policies: async () => [{ layer: "strelva", systemId: null, kind: "system.change_live", route: "strelva_reviews" }] });
    await service(mem.store, [makeRealAdapter(ports)]).sync({ workspaceId: BIZ, actor: owner });
    expect([...mem.items.values()].map((i) => i.route)).toEqual(["strelva_reviews"]);
  });

  it("nothing opens while Systems is off for the business", async () => {
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner" } });
    const { ports } = makeRealPorts({ enabled: async () => false });
    expect((await service(mem.store, [makeRealAdapter(ports)]).list(owner, BIZ)).items).toEqual([]);
  });

  it("Approve starts Make real with the item as the plan approval, and the record reads as approved", async () => {
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner" } });
    const approvals = needsYouMakeRealApprovals((ws, id) => mem.store.read(ws, id));
    const { ports, start } = makeRealPorts();
    let seen: unknown = null;
    start.mockImplementation(async (_actor, _ws, _pid, approvalId) => {
      seen = await approvals.get(BIZ, approvalId);
      return { status: "in_progress", isolated: true, liveUnchanged: true, headline: "Nothing changed yet." };
    });
    const ny = service(mem.store, [makeRealAdapter(ports)]);
    const [item] = (await ny.list(owner, BIZ)).items;
    const result = await ny.decide({ workspaceId: BIZ, itemId: item!.id, revision: item!.revisionHash, decision: "approve", by: { kind: "session", actor: owner } });
    expect(start).toHaveBeenCalledWith(owner, BIZ, "website-rebuild:w1", item!.id);
    expect(seen).toMatchObject({ id: item!.id, status: "approved", subject: { kind: "make_real_plan", possibilityId: "website-rebuild:w1", candidateRevision: 1, fingerprint: "a".repeat(64) } });
    expect(result.status).toBe("done");
    // Honest: the isolated run changed nothing live.
    expect(result.item?.outcomeReason).toMatch(/isolated copy: nothing live changed/);
  });

  it("Not yet starts nothing and the record reads as dismissed", async () => {
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner" } });
    const { ports, start } = makeRealPorts();
    const ny = service(mem.store, [makeRealAdapter(ports)]);
    const [item] = (await ny.list(owner, BIZ)).items;
    await ny.decide({ workspaceId: BIZ, itemId: item!.id, revision: item!.revisionHash, decision: "not_yet", by: { kind: "session", actor: owner } });
    expect(start).not.toHaveBeenCalled();
    expect((await needsYouMakeRealApprovals((ws, id) => mem.store.read(ws, id)).get(BIZ, item!.id))?.status).toBe("dismissed");
  });

  it("a changed plan supersedes the item: the old revision refuses and nothing starts", async () => {
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner" } });
    const { ports, start, state } = makeRealPorts();
    const ny = service(mem.store, [makeRealAdapter(ports)]);
    const [item] = (await ny.list(owner, BIZ)).items;
    state.plans = [plan({ fingerprint: "c".repeat(64) })];
    const result = await ny.decide({ workspaceId: BIZ, itemId: item!.id, revision: item!.revisionHash, decision: "approve", by: { kind: "session", actor: owner } });
    expect(result.status).toBe("changed");
    expect(start).not.toHaveBeenCalled();
    // A new candidate revision is a new plan: the old item no longer waits on anyone.
    state.plans = [plan({ candidateRevision: 2, fingerprint: "d".repeat(64) })];
    expect(await makeRealAdapter(ports).currentRevision({ workspaceId: BIZ, actor: owner }, makeRealSourceId("website-rebuild:w1", 1))).toBeNull();
  });

  it("an admin cannot approve Make real; the owner can", async () => {
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner", [admin.userId]: "admin" } });
    const { ports, start } = makeRealPorts();
    const ny = service(mem.store, [makeRealAdapter(ports)]);
    const [item] = (await ny.list(owner, BIZ)).items;
    expect((await ny.decide({ workspaceId: BIZ, itemId: item!.id, revision: item!.revisionHash, decision: "approve", by: { kind: "session", actor: admin } })).status).toBe("forbidden");
    expect(start).not.toHaveBeenCalled();
  });

  it("a refused start is recorded as failed and the Possibility stays", async () => {
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner" } });
    const { ports } = makeRealPorts({ start: async () => { throw new Error("The live site changed since this was rehearsed."); } });
    const ny = service(mem.store, [makeRealAdapter(ports)]);
    const [item] = (await ny.list(owner, BIZ)).items;
    const result = await ny.decide({ workspaceId: BIZ, itemId: item!.id, revision: item!.revisionHash, decision: "approve", by: { kind: "session", actor: owner } });
    expect(result.status).toBe("failed");
    expect(result.item?.outcomeReason).toMatch(/make_real_refused: The live site changed/);
    // A failed outcome never approves a later write.
    expect((await needsYouMakeRealApprovals((ws, id) => mem.store.read(ws, id)).get(BIZ, item!.id))?.status).toBe("dismissed");
  });

  it("the approvals port refuses ids from another business or lifecycle", async () => {
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner" } });
    const other = await mem.store.open(BIZ, { kind: "request.scope", route: "owner_decides", title: "x", approveEffect: "x", notYetEffect: "x", sourceLifecycle: "service_request", sourceId: "s:proposed", revisionHash: "e".repeat(64), urgent: false, adminMayDecide: true });
    const approvals = needsYouMakeRealApprovals((ws, id) => mem.store.read(ws, id));
    expect(await approvals.get(BIZ, other.id)).toBeNull();
    expect(await approvals.get("another-business", other.id)).toBeNull();
    expect(await approvals.get(BIZ, "not-a-uuid")).toBeNull();
  });

  it("an isolated sandbox run starts under a Needs you plan approval, and refuses while it is still open", async () => {
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner" } });
    const sandbox = await prepareIsolatedPossibility({
      businessId: BIZ, possibilityId: "website-rebuild:w1", title: "A rebuilt fixture.test", intent: "Replace it.",
      systems: [{ ref: SYS, name: "fixture.test", content: { website: "fixture.test" } }],
      changes: [{ systemId: SYS.systemId, summary: "the rebuilt site", content: { website: "fixture.test", rebuildWorkId: "w1" } }],
      checks: [{ id: "site-serves", description: "It serves every page." }], ready: true, actorId: owner.userId, at,
    });
    const p = sandbox.possibility;
    const item = await mem.store.open(BIZ, { kind: "system.change_live", route: "owner_decides", title: "Make it live", approveEffect: "x", notYetEffect: "x", sourceLifecycle: "make_real", sourceId: makeRealSourceId(p.id, p.candidateRevision), revisionHash: planFingerprint(p), urgent: false, adminMayDecide: false });
    const approvals = needsYouMakeRealApprovals((ws, id) => mem.store.read(ws, id));
    await expect(sandbox.run(owner, { canActivate: true }, { planApproval: { approvalId: item.id, approvals } })).rejects.toThrow(/approval does not hold: the approval is pending/);
    await mem.store.claim({ workspaceId: BIZ, itemId: item.id, revision: item.revisionHash, decision: "approve", by: "session", actor: owner });
    const run = await sandbox.run(owner, { canActivate: true }, { planApproval: { approvalId: item.id, approvals } });
    expect(run.activation.status).toBe("in_progress");
    expect(run.view.liveUnchanged).toBe(true);
  });
});

describe("the System page's Make it live, through Needs you", () => {
  it("decides the plan's item in session and returns Make real's result", async () => {
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner" } });
    const result = { isolated: true as const, status: "in_progress", headline: "Nothing changed yet.", done: [], waiting: [], unknown: [], notStarted: ["Switch"], liveUnchanged: true, notConnected: [] };
    const adapter = (onResult: (r: typeof result) => void) => {
      const { ports } = makeRealPorts({ start: async () => { onResult(result); return { status: "in_progress", isolated: true, liveUnchanged: true, headline: "Nothing changed yet." }; } });
      return makeRealAdapter(ports);
    };
    const decided = await makeRealThroughNeedsYou(owner, BIZ, "website-rebuild:w1", { store: mem.store, appOrigin: "https://app.example.test", sendEmail: vi.fn(), adapter: adapter as never });
    expect(decided).toMatchObject({ status: "done", result });
    expect([...mem.items.values()][0]).toMatchObject({ state: "approved", outcome: "done" });
    // Nothing else is waiting: a second tap has no open decision.
    const again = await makeRealThroughNeedsYou(owner, BIZ, "website-rebuild:w1", { store: mem.store, appOrigin: "https://app.example.test", sendEmail: vi.fn(), adapter: adapter as never });
    expect(again).toBeNull();
  });

  it("a possibility with no open decision is not found", async () => {
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner" } });
    const adapter = () => makeRealAdapter(makeRealPorts({ plans: [] }).ports);
    expect(await makeRealThroughNeedsYou(owner, BIZ, "website-rebuild:w1", { store: mem.store, appOrigin: "x", sendEmail: vi.fn(), adapter })).toBeNull();
  });
});

// ── Version releases ───────────────────────────────────────────────────────

const definition: JsonObject = { followUp: { message: "We will call you back soon." }, routing: { minutes: 30 } };
const VBIZ = "22222222-0000-4000-8000-000000000001";

async function versionsWorld() {
  const versions = createSystemVersions({ store: createInMemoryVersionStore(), connections: createInMemoryConnectionOwnership() });
  const agency: VersionActor = { userId: crypto.randomUUID(), memberships: [{ businessId: "agency", role: "owner" }] };
  const vOwner: VersionActor = { userId: owner.userId, verifiedEmail: owner.verifiedEmail, memberships: [{ businessId: VBIZ, role: "owner" }] };
  const source = { businessId: "agency", systemId: "intake" };
  const v1 = await versions.publishSourceRevision(agency, { source, definition, summary: "Intake" });
  await versions.shareSource(agency, source, VBIZ);
  let lineage = await versions.createVersion(vOwner, { source: v1.source, version: { businessId: VBIZ, systemId: "inquiries" }, context: { kind: "agency_client", label: "The Mooney Firm" } });
  lineage = await versions.setOverride(vOwner, lineage.id, { path: "followUp.message", value: "We'll call you within one business day", expectedRowRevision: lineage.rowRevision });
  return { versions, vOwner, lineage };
}

function versionPorts(w: Awaited<ReturnType<typeof versionsWorld>>, mem: ReturnType<typeof needsYouMemoryStore>, over: Partial<VersionReleaseSourcePorts> = {}) {
  const release = vi.fn<VersionReleaseSourcePorts["release"]>(async (_actor, input) => {
    const gate = createVersionReleaseGate({ versions: w.versions, approvals: input.approvals });
    const done = await gate.release(w.vOwner, input.versionId, { expectedRowRevision: input.expectedRowRevision });
    return { releaseNumber: done.lineage.currentRelease };
  });
  const ports: VersionReleaseSourcePorts = {
    enabled: async () => true,
    async pending() {
      const view = await w.versions.readVersion(w.vOwner, w.lineage.id);
      const latest = view.releases.at(-1);
      if (latest && JSON.stringify(latest.definition) === JSON.stringify(view.workingDefinition)) return [];
      const row: PendingVersionRelease = { versionId: w.lineage.id, systemId: "33333333-0000-4000-8000-000000000001", label: view.context.label, rowRevision: w.lineage.rowRevision, nextRelease: (latest?.number ?? 0) + 1, changedPaths: ["followUp.message"] };
      return [row];
    },
    policies: async () => [],
    release,
    read: (ws, id) => mem.store.read(ws, id),
    ...over,
  };
  return { ports, release };
}

describe("the version_release source and the release gate", () => {
  it("Approve releases through the gate, which finds the approval in Needs you", async () => {
    const w = await versionsWorld();
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner" } });
    const { ports, release } = versionPorts(w, mem);
    const ny = service(mem.store, [versionReleaseAdapter(ports)]);
    const [item] = (await ny.list(owner, VBIZ)).items;
    expect(item).toMatchObject({ kind: "system.change_live", route: "owner_decides", sourceLifecycle: "version_release", sourceId: w.lineage.id, revisionHash: versionReleaseRevision(w.lineage.id, w.lineage.rowRevision), adminMayDecide: false });
    const result = await ny.decide({ workspaceId: VBIZ, itemId: item!.id, revision: item!.revisionHash, decision: "approve", by: { kind: "session", actor: owner } });
    expect(result.status).toBe("done");
    expect(release).toHaveBeenCalledOnce();
    expect((await w.versions.readVersion(w.vOwner, w.lineage.id)).currentRelease).toBe(1);
    expect(result.item?.receiptRef).toBe(`version_release:${w.lineage.id}:1`);
  });

  it("Not yet releases nothing", async () => {
    const w = await versionsWorld();
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner" } });
    const { ports, release } = versionPorts(w, mem);
    const ny = service(mem.store, [versionReleaseAdapter(ports)]);
    const [item] = (await ny.list(owner, VBIZ)).items;
    await ny.decide({ workspaceId: VBIZ, itemId: item!.id, revision: item!.revisionHash, decision: "not_yet", by: { kind: "session", actor: owner } });
    expect(release).not.toHaveBeenCalled();
    expect((await w.versions.readVersion(w.vOwner, w.lineage.id)).currentRelease).toBeNull();
  });

  it("the gate refuses without an approved item for this exact row revision", async () => {
    const w = await versionsWorld();
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner" } });
    const item = await mem.store.open(VBIZ, { kind: "system.change_live", route: "owner_decides", title: "x", approveEffect: "x", notYetEffect: "x", sourceLifecycle: "version_release", sourceId: w.lineage.id, revisionHash: versionReleaseRevision(w.lineage.id, w.lineage.rowRevision), urgent: false, adminMayDecide: false });
    const approvals = needsYouVersionReleaseApprovals(async (_actor, businessId) => mem.store.list(owner, businessId, true));
    const gate = createVersionReleaseGate({ versions: w.versions, approvals });
    // Still open: not an approval.
    await expect(gate.release(w.vOwner, w.lineage.id, { expectedRowRevision: w.lineage.rowRevision })).rejects.toThrow(/needs the owner's approval/);
    await mem.store.claim({ workspaceId: VBIZ, itemId: item.id, revision: item.revisionHash, decision: "approve", by: "session", actor: owner });
    // Approved for an older row revision: refused.
    expect(await approvals.approved(w.vOwner, { businessId: VBIZ, versionId: w.lineage.id, rowRevision: w.lineage.rowRevision + 1 })).toBeNull();
    // Another business's approval never counts.
    expect(await approvals.approved(w.vOwner, { businessId: "44444444-0000-4000-8000-000000000001", versionId: w.lineage.id, rowRevision: w.lineage.rowRevision })).toBeNull();
    const released = await gate.release(w.vOwner, w.lineage.id, { expectedRowRevision: w.lineage.rowRevision });
    expect(released.approvalId).toBe(item.id);
  });

  it("a Version changed after the email supersedes the item, and the old link refuses", async () => {
    const w = await versionsWorld();
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner" } });
    const { ports, release } = versionPorts(w, mem);
    const ny = service(mem.store, [versionReleaseAdapter(ports)]);
    const [item] = (await ny.list(owner, VBIZ)).items;
    w.lineage = await w.versions.setOverride(w.vOwner, w.lineage.id, { path: "routing.minutes", value: 10, expectedRowRevision: w.lineage.rowRevision });
    const result = await ny.decide({ workspaceId: VBIZ, itemId: item!.id, revision: item!.revisionHash, decision: "approve", by: { kind: "session", actor: owner } });
    expect(result.status).toBe("changed");
    expect(release).not.toHaveBeenCalled();
  });

  it("a failed release is recorded and nothing went live", async () => {
    const w = await versionsWorld();
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner" } });
    const { ports } = versionPorts(w, mem, { release: async () => { throw Object.assign(new Error("db down"), { name: "WorkspaceStoreError" }); } });
    const ny = service(mem.store, [versionReleaseAdapter(ports)]);
    const [item] = (await ny.list(owner, VBIZ)).items;
    const result = await ny.decide({ workspaceId: VBIZ, itemId: item!.id, revision: item!.revisionHash, decision: "approve", by: { kind: "session", actor: owner } });
    expect(result).toMatchObject({ status: "failed", item: { outcomeReason: "release_failed" } });
    expect((await w.versions.readVersion(w.vOwner, w.lineage.id)).currentRelease).toBeNull();
  });

  it("a lapse releases nothing", async () => {
    const w = await versionsWorld();
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(at) }, roles: { [owner.userId]: "owner" } });
    const { ports, release } = versionPorts(w, mem);
    const adapter = versionReleaseAdapter(ports);
    const [item] = (await service(mem.store, [adapter]).list(owner, VBIZ)).items;
    expect(await adapter.resolve({ workspaceId: VBIZ }, item!, "not_yet", { kind: "expiry" })).toEqual({ outcome: "done", reason: "Expired, nothing changed" });
    expect(release).not.toHaveBeenCalled();
  });
});
