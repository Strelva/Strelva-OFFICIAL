import { describe, expect, it } from "vitest";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import {
  comparePossibility,
  createInMemoryPossibilityRepository,
  createPossibility,
  markReady,
  recordRehearsal,
  rehearsePossibility,
  resolveConflict,
  type AuthorityScope,
  type Possibility,
  type PossibilityInput,
} from "@/platform/possibilities";
import {
  createInMemoryActivationRepository,
  createInMemoryApprovalRecords,
  effectApprovalSubject,
  createInMemoryLiveSystems,
  createInMemoryRevisionContent,
  createIsolatedAdapter,
  createMakeReal,
  createSystemStoreLiveSystems,
  describeActivation,
  RUNNING_STEP_GRACE_MS,
  type Activation,
  type ActivationRepository,
  type AuthorityPort,
  type LiveSystemsPort,
  type OperatingChecksPort,
} from "@/platform/make-real";
import { canonicalJson, sha256, uuidFromSeed } from "@/platform/business-record/tenant-import";
import { createMemorySystemStore, systemOriginId, type ConnectionKind, type SystemRef } from "@/platform/systems";

/*
 * Proof scenario (all effects are ISOLATED FAKES; no provider is called):
 * Acme Studio has a Commercial Proposal System that reads a Pricing System.
 * The "self-service package purchase" Possibility changes both, extracts a
 * shared Package Pricing System, books a kickoff type, creates a checkout
 * link, notifies the team and publishes a packages section.
 *
 * Live System state runs on two backends: the small Make real fake, and the
 * spine's in-memory SystemStore through createSystemStoreLiveSystems. The
 * main scenario runs on both.
 */

const BIZ = uuidFromSeed("business:acme-studio");
const OTHER_BIZ = uuidFromSeed("business:other");
const owner: WorkspaceActor = { userId: "owner-1", verifiedEmail: "owner@acme.test" };
const PROPOSAL = { businessId: BIZ, systemId: systemOriginId(BIZ, { kind: "saved_work", ref: "commercial-proposal" }) };
const PRICING = { businessId: BIZ, systemId: systemOriginId(BIZ, { kind: "saved_work", ref: "pricing" }) };

interface IssuedTerms { outputId: string; systemId: string; revisionId: string; terms: Record<string, unknown>; issuedAt: string; audience: string }

/** What the scenario reads and seeds, whichever backend holds live state. */
interface LiveFixture {
  port: LiveSystemsPort;
  writes?: Record<string, number>;
  seed(ref: SystemRef, name: string, content: Record<string, unknown>): Promise<string> | string;
  seedConnection(businessId: string, from: string, to: string, kind: ConnectionKind, purpose: string): Promise<unknown> | unknown;
  edit(ref: SystemRef, content: Record<string, unknown>): Promise<string> | string;
  issueOutput(ref: SystemRef, audience: string, at: string): Promise<IssuedTerms> | IssuedTerms;
  outputs(): Promise<IssuedTerms[]> | IssuedTerms[];
  system(ref: SystemRef): Promise<{ lifecycle: string; current: string | null; revisions: string[] } | null> | { lifecycle: string; current: string | null; revisions: string[] } | null;
  connections(businessId: string): Promise<Array<{ from: string; kind: string; to: string; active: boolean }>> | Array<{ from: string; kind: string; to: string; active: boolean }>;
}

/** The spine's SystemStore, seen through the Make real adapter. */
function storeFixture(): LiveFixture {
  const store = createMemorySystemStore({ access: (actor, businessId) => (actor.userId === owner.userId && businessId === BIZ ? "owner" : null) });
  const content = createInMemoryRevisionContent();
  const port = createSystemStoreLiveSystems({ store, content, actor: owner });
  let n = 0;
  const cmd = () => uuidFromSeed(`fixture-command:${++n}`);
  const termsOf = async (ref: SystemRef, revisionId: string) => {
    const { revisions } = await store.readSystem(owner, ref);
    return (await content.get(ref.businessId, revisions.find((r) => r.id === revisionId)!.implementation))!;
  };
  const issued: Array<{ ref: SystemRef; outputId: string; audience: string }> = [];
  const asTerms = async (ref: SystemRef, outputId: string, audience: string): Promise<IssuedTerms> => {
    const output = (await store.readSystem(owner, ref)).outputs.find((o) => o.id === outputId)!;
    return { outputId, systemId: ref.systemId, revisionId: output.revision.revisionId, terms: await termsOf(ref, output.revision.revisionId), issuedAt: output.issuedAt, audience };
  };
  return {
    port,
    async seed(ref, name, body) {
      const origin = { kind: "saved_work" as const, ref: name === "Pricing" ? "pricing" : "commercial-proposal" };
      const system = await store.createSystem(owner, ref.businessId, { name, kind: "other", origin }, cmd());
      expect(system.id).toBe(ref.systemId);
      const implementation = await content.put(ref.businessId, body);
      const { system: withRevision, revision } = await store.recordRevision(owner, ref, system.changeNumber, { implementation, summary: "Initial" }, cmd());
      await store.transitionLifecycle(owner, ref, withRevision.changeNumber, "live");
      return revision.id;
    },
    async seedConnection(businessId, from, to, kind, purpose) {
      return store.connect(owner, { source: { businessId, systemId: from }, kind, target: { type: "system", system: { businessId, systemId: to } }, purpose }, cmd());
    },
    async edit(ref, body) {
      const { system } = await store.readSystem(owner, ref);
      const implementation = await content.put(ref.businessId, body);
      return (await store.recordRevision(owner, ref, system.changeNumber, { implementation, summary: "Direct edit" }, cmd())).revision.id;
    },
    async issueOutput(ref, audience) {
      const current = (await port.current(ref))!;
      const output = await store.issueOutput(owner, ref, { kind: "proposal", title: `Proposal for ${audience}`, snapshotHash: sha256(canonicalJson(current.content)) }, cmd());
      issued.push({ ref, outputId: output.id, audience });
      return asTerms(ref, output.id, audience);
    },
    async outputs() {
      return Promise.all(issued.map((o) => asTerms(o.ref, o.outputId, o.audience)));
    },
    async system(ref) {
      const { system, revisions } = await store.readSystem(owner, ref);
      return { lifecycle: system.lifecycle, current: system.currentRevision?.revisionId ?? null, revisions: revisions.map((r) => r.id) };
    },
    async connections(businessId) {
      const graph = await store.readGraph(owner, businessId);
      return graph.connections.map((c) => ({ from: c.source.systemId, kind: c.kind, to: c.target.type === "system" ? c.target.system.systemId : c.target.type, active: c.state === "connected" }));
    },
  };
}

async function world(backend: "fake" | "store" = "fake") {
  let t = Date.parse("2026-10-04T12:00:00.000Z");
  const clock = () => new Date(t).toISOString();
  const advance = (ms: number) => { t += ms; };
  let n = 0;
  const ids = () => `id-${++n}`;

  const live: LiveFixture = backend === "fake" ? createInMemoryLiveSystems() : storeFixture();
  const proposalR1 = await live.seed(PROPOSAL, "Commercial Proposal", {
    title: "Brand refresh proposal",
    packages: { starter: { name: "Starter", priceCents: 120000 } },
    checkout: "none",
  });
  const pricingR1 = await live.seed(PRICING, "Pricing", {
    hourlyRateCents: 15000,
    packages: { starter: { hours: 10, priceCents: 150000 } },
  });
  await live.seedConnection(BIZ, PROPOSAL.systemId, PRICING.systemId, "read", "Proposal quotes the hourly rate");
  const issued = await live.issueOutput(PROPOSAL, "Mooney Firm", clock());

  const revoked = new Set<AuthorityScope>();
  const authority: AuthorityPort = {
    async check(actor, input) {
      if (actor.userId !== owner.userId || input.businessId !== BIZ) return { allowed: false, reason: "No membership in this business." };
      if (revoked.has(input.scope)) return { allowed: false, reason: `${input.scope} was revoked.` };
      return { allowed: true, grantId: `grant-${input.scope}` };
    },
  };

  const calendar = createIsolatedAdapter("calendar");
  const message = createIsolatedAdapter("message");
  const payment = createIsolatedAdapter("payment");
  const publish = createIsolatedAdapter("publish");
  const adapters = [calendar, message, payment, publish];

  const failingChecks = new Set<string>();
  const checks: OperatingChecksPort = {
    async run({ checkId, activation }) {
      if (failingChecks.has(checkId)) return { passed: false, detail: `${checkId} forced to fail` };
      if (checkId === "proposal-quotes-package-pricing") {
        const intro = activation.introduced.find((i) => i.key === "package-pricing");
        const pkg = intro?.systemId ? await live.port.current({ businessId: BIZ, systemId: intro.systemId }) : null;
        const proposal = await live.port.current(PROPOSAL);
        const price = (pkg?.content.packages as { starter?: { priceCents?: number } } | undefined)?.starter?.priceCents;
        const ok = proposal?.content.packagesFrom === "package-pricing" && price === 150000;
        return { passed: ok, detail: ok ? "Proposal reads Package Pricing at $1,500" : "Proposal does not resolve package prices" };
      }
      if (checkId === "kickoff-bookable") return { passed: calendar.ledger.some((e) => e.state === "accepted"), detail: "Isolated calendar slot type present" };
      if (checkId === "checkout-active") return { passed: payment.ledger.some((e) => e.state === "accepted"), detail: "Isolated checkout link active" };
      return { passed: false, detail: "Unknown check" };
    },
  };

  const possibilities = createInMemoryPossibilityRepository();
  const activationStore = createInMemoryActivationRepository();
  let saveFault: ((a: Activation) => boolean) | null = null;
  const activations: ActivationRepository = {
    get: activationStore.get,
    create: activationStore.create,
    async save(value, expected) {
      if (saveFault?.(value)) { saveFault = null; throw new WorkspaceStoreError("Simulated process loss before the checkpoint was written."); }
      return activationStore.save(value, expected);
    },
  };
  const approvalRecords = createInMemoryApprovalRecords();
  const makeReal = createMakeReal({ possibilities, activations, live: live.port, authority, adapters, checks, approvals: approvalRecords, clock, ids });

  const input: PossibilityInput = {
    title: "Self-service package purchase",
    intent: "Let a client pick a package from the proposal, pay, and book a kickoff call without a back-and-forth.",
    changes: [
      { baseline: { ...PROPOSAL, revisionId: proposalR1, number: 1 }, candidate: { summary: "Package selection, checkout and onboarding", content: { title: "Brand refresh proposal", packagesFrom: "package-pricing", checkout: "self-service", onboarding: "kickoff-call" } } },
      { baseline: { ...PRICING, revisionId: pricingR1, number: 1 }, candidate: { summary: "Packages move to Package Pricing", content: { hourlyRateCents: 15000, packagesFrom: "package-pricing" } } },
    ],
    introduces: [{
      key: "package-pricing", name: "Package Pricing", purpose: "One source of package prices for proposals, checkout and the website.",
      candidate: { summary: "Extracted from Proposal and Pricing", content: { packages: { starter: { name: "Starter", hours: 10, priceCents: null } } } },
      extractedFrom: [PROPOSAL, PRICING],
      conflicts: [{ path: "packages.starter.priceCents", values: [{ systemId: PROPOSAL.systemId, value: 120000 }, { systemId: PRICING.systemId, value: 150000 }] }],
    }],
    connections: [
      { id: "proposal-reads-packages", from: { systemId: PROPOSAL.systemId }, to: { introducedKey: "package-pricing" }, kind: "read", purpose: "Proposal shows current package prices" },
      { id: "packages-depend-on-rates", from: { introducedKey: "package-pricing" }, to: { systemId: PRICING.systemId }, kind: "depend", purpose: "Package prices are derived from the hourly rate" },
    ],
    effects: [
      { id: "kickoff-calendar", kind: "calendar", system: { systemId: PROPOSAL.systemId }, description: "Create a kickoff call booking type for package buyers", request: { title: "Kickoff call", minutes: 30 } },
      { id: "team-notice", kind: "message", system: { systemId: PROPOSAL.systemId }, description: "Tell the Acme team that self-service packages are live", request: { to: "team", body: "Packages can now be bought from proposals." } },
      { id: "checkout-link", kind: "payment", system: { introducedKey: "package-pricing" }, description: "Create a Starter package checkout link", request: { amountCents: 150000, currency: "USD" } },
      { id: "packages-page", kind: "publish", system: { systemId: PROPOSAL.systemId }, description: "Publish the packages section on the website", request: { section: "services" }, after: ["kickoff-calendar", "team-notice", "checkout-link"], publish: { section: "services", data: { items: [{ title: "Starter", price: "$1,500" }] } } },
    ],
    checks: [
      { id: "proposal-quotes-package-pricing", description: "A new proposal quotes Starter at $1,500 from Package Pricing" },
      { id: "kickoff-bookable", description: "A buyer can book a kickoff call" },
      { id: "checkout-active", description: "The Starter checkout link accepts payment" },
    ],
  };

  async function readyPossibility(): Promise<Possibility> {
    let p = createPossibility(input, { id: "poss-1", businessId: BIZ, actorId: owner.userId, at: clock() });
    p = resolveConflict(p, { introducedKey: "package-pricing", path: "packages.starter.priceCents", fromSystemId: PRICING.systemId }, p.revision, owner.userId, clock());
    p = recordRehearsal(p, await rehearsePossibility(p, live.port, adapters, clock()), p.revision, owner.userId, clock());
    p = await markReady(p, live.port, p.revision, owner.userId, clock());
    await possibilities.create(p);
    // Recorded owner approvals for exactly these effects of this candidate.
    for (const effect of p.effects) approvalRecords.record({ id: `approval-${effect.id}`, businessId: BIZ, subject: effectApprovalSubject(p, effect), status: "approved", decidedBy: owner.userId, decidedAt: clock() });
    return p;
  }

  return { approvalRecords, clock, advance, live, proposalR1, pricingR1, issued, revoked, adapters, calendar, message, payment, publish, failingChecks, possibilities, activations, makeReal, input, readyPossibility, setSaveFault: (f: (a: Activation) => boolean) => { saveFault = f; } };
}

const approvals = ["kickoff-calendar", "team-notice", "checkout-link", "packages-page"].map((effectId) => ({ effectId, approvalId: `approval-${effectId}` }));

describe("Possibility: exploring is isolated", () => {
  it("rehearses with isolated adapters only and never writes live state or calls a provider", async () => {
    const w = await world();
    const p = createPossibility(w.input, { id: "poss-1", businessId: BIZ, actorId: owner.userId, at: w.clock() });
    expect(p.status).toBe("exploring");
    const rehearsal = await rehearsePossibility(p, w.live.port, w.adapters, w.clock());
    expect(rehearsal.ok).toBe(true);
    expect(rehearsal.effects.every((e) => e.mode === "isolated")).toBe(true);
    expect(Object.values(w.live.writes!).every((n) => n === 0)).toBe(true);
    expect(w.adapters.every((a) => a.ledger.length === 0 && a.calls.perform === 0)).toBe(true);
    const liveAdapter = { ...createIsolatedAdapter("payment"), mode: "live" as const };
    await expect(rehearsePossibility(p, w.live.port, [liveAdapter], w.clock())).rejects.toThrow(/live payment adapter/);
  });

  it("will not be ready until the owner chooses the authoritative extracted price and rehearses that candidate", async () => {
    const w = await world();
    let p = createPossibility(w.input, { id: "poss-1", businessId: BIZ, actorId: owner.userId, at: w.clock() });
    p = recordRehearsal(p, await rehearsePossibility(p, w.live.port, w.adapters, w.clock()), p.revision, owner.userId, w.clock());
    await expect(markReady(p, w.live.port, p.revision, owner.userId, w.clock())).rejects.toThrow(/authoritative value for package-pricing.packages.starter.priceCents/);
    p = resolveConflict(p, { introducedKey: "package-pricing", path: "packages.starter.priceCents", fromSystemId: PRICING.systemId }, p.revision, owner.userId, w.clock());
    expect(p.rehearsal).toBeUndefined();
    await expect(markReady(p, w.live.port, p.revision, owner.userId, w.clock())).rejects.toThrow(/Rehearse the current candidate/);
    p = recordRehearsal(p, await rehearsePossibility(p, w.live.port, w.adapters, w.clock()), p.revision, owner.userId, w.clock());
    p = await markReady(p, w.live.port, p.revision, owner.userId, w.clock());
    expect(p.status).toBe("ready");
    expect((p.introduces[0]!.candidate.content.packages as { starter: { priceCents: number } }).starter.priceCents).toBe(150000);
  });

  it("compares against the current baseline per System", async () => {
    const w = await world();
    const p = await w.readyPossibility();
    const cmp = await comparePossibility(p, w.live.port);
    const proposal = cmp.changes.find((c) => c.systemId === PROPOSAL.systemId)!;
    expect(proposal.stale).toBe(false);
    expect(proposal.differences).toContainEqual({ path: "checkout", current: "none", candidate: "self-service" });
    expect(proposal.differences).toContainEqual({ path: "packages.starter.priceCents", current: 120000, candidate: undefined });
    expect(cmp.introduces).toEqual([{ key: "package-pricing", name: "Package Pricing", extractedFrom: [PROPOSAL.systemId, PRICING.systemId], unresolved: [] }]);
  });

  it("refuses Make real while exploring, and sends a ready possibility back to Exploring when a baseline moved", async () => {
    const w = await world();
    const exploring = createPossibility(w.input, { id: "poss-x", businessId: BIZ, actorId: owner.userId, at: w.clock() });
    await w.possibilities.create(exploring);
    await expect(w.makeReal.start(owner, BIZ, "poss-x")).rejects.toThrow(/Only a ready possibility/);

    await w.readyPossibility();
    await w.live.edit(PRICING, { hourlyRateCents: 17500, packages: { starter: { hours: 10, priceCents: 175000 } } });
    await expect(w.makeReal.start(owner, BIZ, "poss-1", { approvals })).rejects.toThrow(/changed since this was rehearsed/);
    expect((await w.possibilities.get(BIZ, "poss-1"))!.status).toBe("exploring");
    expect(w.calendar.calls.perform).toBe(0);
  });

  it("is invisible to another business", async () => {
    const w = await world();
    await w.readyPossibility();
    expect(await w.possibilities.get(OTHER_BIZ, "poss-1")).toBeNull();
    await expect(w.makeReal.start(owner, OTHER_BIZ, "poss-1")).rejects.toBeInstanceOf(WorkspaceAccessError);
  });
});

describe.each(["fake", "store"] as const)("Make real on the %s live backend: the interrupted self-service package purchase", (backend) => {
  it("resumes after an interruption and a revoked grant without duplicating the accepted calendar effect", async () => {
    const w = await world(backend);
    await w.readyPossibility();

    // Preflight: publish touches prices, so governance requires an explicit approval.
    await expect(w.makeReal.start(owner, BIZ, "poss-1")).rejects.toThrow(/packages-page: needs approval/);
    const started = await w.makeReal.start(owner, BIZ, "poss-1", { approvals });
    expect(started.pinned).toEqual([
      { systemId: PROPOSAL.systemId, baselineRevisionId: w.proposalR1 },
      { systemId: PRICING.systemId, baselineRevisionId: w.pricingR1 },
    ]);

    // The calendar provider accepts, then the process dies before the step log records it.
    w.setSaveFault((a) => a.steps.some((s) => s.id === "effect:kickoff-calendar" && s.status === "completed"));
    await expect(w.makeReal.run(owner, BIZ, started.id)).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(w.calendar.ledger).toHaveLength(1);
    const interrupted = await w.makeReal.get(BIZ, started.id);
    expect(interrupted.steps.find((s) => s.id === "effect:kickoff-calendar")!.status).toBe("running");

    // Message authority is revoked before the retry.
    w.revoked.add("message.send");
    await expect(w.makeReal.resume(owner, BIZ, started.id)).rejects.toThrow(/may still be running/);
    w.advance(RUNNING_STEP_GRACE_MS + 1000);
    const partial = await w.makeReal.resume(owner, BIZ, started.id);

    const calendarStep = partial.steps.find((s) => s.id === "effect:kickoff-calendar")!;
    expect(calendarStep).toMatchObject({ status: "completed", effect: "accepted", attempts: 1 });
    expect(calendarStep.receipt).toMatchObject({ reconciledBy: "provider_lookup", adapterMode: "isolated" });
    expect(w.calendar.ledger).toHaveLength(1);
    expect(w.calendar.calls.perform).toBe(1);
    expect(w.message.calls.perform).toBe(0);

    // Partial activation is surfaced, and live behavior is untouched.
    expect(partial.status).toBe("needs_attention");
    const view = describeActivation(partial);
    expect(view.liveUnchanged).toBe(true);
    expect(view.headline).toMatch(/Partly done.*Your live Systems are unchanged/);
    expect(view.done.map((d) => d.step)).toEqual(expect.arrayContaining([`stage:${PROPOSAL.systemId}`, `stage:${PRICING.systemId}`, "introduce:package-pricing", "effect:kickoff-calendar"]));
    expect(view.done.find((d) => d.step === "effect:kickoff-calendar")).toMatchObject({ mode: "isolated", readBack: "confirmed" });
    expect(view.waiting).toEqual([{ step: "effect:team-notice", label: "Tell the Acme team that self-service packages are live", reason: expect.stringMatching(/message.send was revoked/) }]);
    expect(view.notStarted).toEqual(expect.arrayContaining(["effect:packages-page", `activate:${PROPOSAL.systemId}`, "verify"]));
    expect((await w.live.port.current(PROPOSAL))!.revisionId).toBe(w.proposalR1);
    expect((await w.live.port.current(PRICING))!.revisionId).toBe(w.pricingR1);
    const pkgId = partial.introduced[0]!.systemId!;
    expect((await w.live.system({ businessId: BIZ, systemId: pkgId }))!.lifecycle).toBe("draft");
    expect((await w.possibilities.get(BIZ, "poss-1"))!.status).toBe("ready");

    // Still revoked: resume re-checks and stays blocked rather than sending.
    expect((await w.makeReal.resume(owner, BIZ, started.id)).status).toBe("needs_attention");
    expect(w.message.calls.perform).toBe(0);

    // Authority restored: only unfinished steps run.
    w.revoked.delete("message.send");
    const done = await w.makeReal.resume(owner, BIZ, started.id);
    expect(done.status).toBe("made_real");
    expect(done.checks.every((c) => c.status === "passed")).toBe(true);
    expect(w.calendar.ledger).toHaveLength(1);
    expect(w.calendar.calls.perform).toBe(1);
    expect(w.message.ledger).toHaveLength(1);
    expect(w.payment.ledger).toHaveLength(1);
    expect(w.publish.ledger).toHaveLength(1);
    expect(done.approvals[0]!.consumedAt).toBeDefined();
    expect(done.steps.find((s) => s.id === "effect:packages-page")!.receipt).toMatchObject({ approvalId: "approval-packages-page", grantId: "grant-site.publish" });
    expect((await w.possibilities.get(BIZ, "poss-1"))!.status).toBe("made_real");

    // Same System identity, new revision; the extracted System is live and connected.
    const proposalR2 = (await w.live.system(PROPOSAL))!.revisions[1]!;
    expect(await w.live.port.current(PROPOSAL)).toMatchObject({ revisionId: proposalR2, number: 2 });
    expect((await w.live.system(PROPOSAL))!.revisions).toEqual([w.proposalR1, proposalR2]);
    expect((await w.live.system({ businessId: BIZ, systemId: pkgId }))!.lifecycle).toBe("live");
    expect((await w.live.connections(BIZ)).filter((c) => c.active).map((c) => `${c.from}-${c.kind}->${c.to}`)).toEqual([
      `${PROPOSAL.systemId}-read->${PRICING.systemId}`,
      `${PROPOSAL.systemId}-read->${pkgId}`,
      `${pkgId}-depend->${PRICING.systemId}`,
    ]);

    // The proposal issued to Mooney Firm keeps its original terms.
    const outputs = await w.live.outputs();
    expect(outputs[0]).toEqual(w.issued);
    expect((outputs[0]!.terms.packages as { starter: { priceCents: number } }).starter.priceCents).toBe(120000);
    const fresh = await w.live.issueOutput(PROPOSAL, "New client", w.clock());
    expect(fresh.terms.packagesFrom).toBe("package-pricing");
  });
});

describe.each(["fake", "store"] as const)("Make real on the %s live backend: bounded recovery and honest outcomes", (backend) => {
  it("rolls back a stalled activation: compensates what it can and never sends the revoked message", async () => {
    const w = await world(backend);
    await w.readyPossibility();
    const a = await w.makeReal.start(owner, BIZ, "poss-1", { approvals });
    w.revoked.add("message.send");
    const stalled = await w.makeReal.run(owner, BIZ, a.id);
    expect(stalled.status).toBe("needs_attention");
    const rolled = await w.makeReal.rollback(owner, BIZ, a.id);
    expect(rolled.status).toBe("rolled_back");
    expect(rolled.steps.find((s) => s.id === "effect:kickoff-calendar")!.status).toBe("compensated");
    expect(w.calendar.ledger[0]!.state).toBe("compensated");
    expect(w.message.ledger).toHaveLength(0);
    expect(describeActivation(rolled).cannotUndo).toEqual([]);
    expect((await w.live.port.current(PROPOSAL))!.revisionId).toBe(w.proposalR1);
    const p = (await w.possibilities.get(BIZ, "poss-1"))!;
    expect(p.status).toBe("ready");
    expect(p.activationId).toBeUndefined();
  });

  it("never marks made real when an operating check fails, and rollback names the message it cannot unsend", async () => {
    const w = await world(backend);
    await w.readyPossibility();
    w.failingChecks.add("checkout-active");
    const a = await w.makeReal.start(owner, BIZ, "poss-1", { approvals });
    const result = await w.makeReal.run(owner, BIZ, a.id);
    expect(result.status).toBe("needs_attention");
    expect(result.steps.find((s) => s.id === "verify")).toMatchObject({ status: "failed", reason: expect.stringMatching(/checkout-active/) });
    expect((await w.possibilities.get(BIZ, "poss-1"))!.status).toBe("ready");
    expect(describeActivation(result).liveUnchanged).toBe(false);

    const rolled = await w.makeReal.rollback(owner, BIZ, a.id);
    expect((await w.live.port.current(PROPOSAL))!.revisionId).toBe(w.proposalR1);
    expect((await w.live.port.current(PRICING))!.revisionId).toBe(w.pricingR1);
    // A live System never returns to draft: undoing the introduction pauses it.
    expect((await w.live.system({ businessId: BIZ, systemId: rolled.introduced[0]!.systemId! }))!.lifecycle).toBe("paused");
    expect((await w.live.connections(BIZ)).filter((c) => c.active)).toHaveLength(1);
    const view = describeActivation(rolled);
    expect(view.cannotUndo).toEqual(["Tell the Acme team that self-service packages are live"]);
    expect(rolled.steps.find((s) => s.id === "effect:team-notice")).toMatchObject({ status: "completed", effect: "accepted", reason: "Already happened and cannot be undone." });
    expect(w.payment.ledger[0]!.state).toBe("compensated");
  });

  it("leaves an unconfirmed payment unknown, never replays it, and continues only after evidence", async () => {
    const w = await world(backend);
    const payment = createIsolatedAdapter("payment", { supportsLookup: false, idempotentByKey: false });
    const adapters = [w.calendar, w.message, payment, w.publish];
    const makeReal = createMakeReal({ possibilities: w.possibilities, activations: w.activations, live: w.live.port, authority: { check: async () => ({ allowed: true, grantId: "g" }) }, adapters, checks: { run: async () => ({ passed: true, detail: "ok" }) }, approvals: w.approvalRecords, clock: w.clock });
    await w.readyPossibility();
    const a = await makeReal.start(owner, BIZ, "poss-1", { approvals });
    payment.faults.acceptThenThrow = true;
    const stuck = await makeReal.run(owner, BIZ, a.id);
    expect(stuck.steps.find((s) => s.id === "effect:checkout-link")).toMatchObject({ status: "unknown", effect: "unknown" });
    expect((await makeReal.resume(owner, BIZ, a.id)).status).toBe("needs_attention");
    expect(payment.calls.perform).toBe(1);
    await expect(makeReal.reconcile(owner, BIZ, a.id, { stepId: "effect:checkout-link", resolution: "completed", evidence: "" })).rejects.toBeInstanceOf(WorkspaceConflictError);
    await makeReal.reconcile(owner, BIZ, a.id, { stepId: "effect:checkout-link", resolution: "completed", evidence: "Isolated payment dashboard shows link isolated-payment-1", providerRef: "isolated-payment-1" });
    const done = await makeReal.resume(owner, BIZ, a.id);
    expect(done.status).toBe("made_real");
    expect(payment.calls.perform).toBe(1);
    expect(done.steps.find((s) => s.id === "effect:checkout-link")!.receipt).toMatchObject({ reconciledBy: "operator_evidence" });
  });

  it("records a failed read-back beside the accepted write and does not retry it", async () => {
    const w = await world(backend);
    await w.readyPossibility();
    w.calendar.faults.failReadBack = true;
    const a = await w.makeReal.start(owner, BIZ, "poss-1", { approvals });
    const result = await w.makeReal.run(owner, BIZ, a.id);
    const step = result.steps.find((s) => s.id === "effect:kickoff-calendar")!;
    expect(step).toMatchObject({ status: "completed", effect: "accepted", readBack: { status: "failed" } });
    expect(w.calendar.calls.perform).toBe(1);
    expect(result.status).toBe("made_real");
  });

  it("stops a System switch whose baseline moved mid-activation and surfaces the partial switch", async () => {
    const w = await world(backend);
    await w.readyPossibility();
    const a = await w.makeReal.start(owner, BIZ, "poss-1", { approvals });
    for (let i = 0; i < 20; i++) {
      const r = await w.makeReal.runNext(owner, BIZ, a.id);
      if (r.ran === `activate:${PROPOSAL.systemId}`) break;
    }
    const edited = await w.live.edit(PRICING, { hourlyRateCents: 17500 });
    const result = await w.makeReal.run(owner, BIZ, a.id);
    expect(result.steps.find((s) => s.id === `activate:${PRICING.systemId}`)).toMatchObject({ status: "blocked", reason: expect.stringContaining(`${PRICING.systemId} changed after Make real started`) });
    expect((await w.live.port.current(PROPOSAL))!.revisionId).toBe((await w.live.system(PROPOSAL))!.revisions[1]);
    expect((await w.live.port.current(PRICING))!.revisionId).toBe(edited);
    const view = describeActivation(result);
    expect(view.liveUnchanged).toBe(false);
    expect(view.headline).toMatch(/Some live Systems already switched/);
    // Resume re-checks and stays blocked; it never overwrites the owner's edit.
    expect((await w.makeReal.resume(owner, BIZ, a.id)).status).toBe("needs_attention");
    expect((await w.live.port.current(PRICING))!.revisionId).toBe(edited);
  });
});
