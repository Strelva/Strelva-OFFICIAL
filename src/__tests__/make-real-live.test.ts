import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import {
  createInMemoryPossibilityRepository,
  createPossibility,
  markReady,
  recordRehearsal,
  rehearsePossibility,
  type DeclaredEffect,
  type Possibility,
  type PossibilityInput,
} from "@/platform/possibilities";
import {
  approvalProblem,
  createGovernedWorkApprovalRecords,
  createInMemoryActivationRepository,
  createInMemoryApprovalRecords,
  createInMemoryLiveSystems,
  createIsolatedAdapter,
  createNeedsYouApprovalRecords,
  effectApprovalSubject,
  planApprovalSubject,
  planFingerprint,
  selectAdapter,
  type ActivationRepository,
  type EffectAdapter,
} from "@/platform/make-real";
import {
  createBookingPageAdapter,
  createHostedWebsiteAdapter,
  createInquiryFormAdapter,
  createInternalAppAdapter,
  createTenantContentAdapter,
  createWaitingAdapter,
  type LiveChannelContext,
} from "@/platform/make-real/live-adapters";
import { createApprovalAuthority, createLiveMakeRealService, createLiveOperatingChecks, createMakeRealNeedsYouAdapter } from "@/platform/make-real/live";
import { customerActivationView } from "@/platform/make-real/view";
import type { OwnerDecision, ProposedItem } from "@/platform/needs-you/contracts";
import type { NeedsYouStore } from "@/platform/needs-you/repository";
import { createNeedsYouService } from "@/platform/needs-you/service";

/*
 * Make real with live channel adapters, plan approvals keyed by workspace,
 * and the durable runner's restart behavior. Every write path is a fake that
 * records calls; nothing reaches a provider.
 */

const BIZ = "b1000000-0000-4000-8000-000000000001";
const OWNER: WorkspaceActor = { userId: "b1000000-0000-4000-8000-0000000000a1", verifiedEmail: "owner@mooney.test" };
const AT = "2026-10-06T12:00:00.000Z";
const WORK = "b1000000-0000-4000-8000-0000000000c1";
const HASH = "a".repeat(64);

function ctx(on: Record<string, boolean> = {}): LiveChannelContext {
  return { actor: OWNER, enabled: async (channel) => on[channel] ?? true };
}

// Fakes for each write path -------------------------------------------------------

function hostedPorts() {
  const state = {
    status: "approved", approved: 3 as number | null, receipt: null as null | { receiptId: string; candidateRevision: number; providerUrl: string },
    readBack: null as null | { status: string; message: string }, launches: 0, failAfterWrite: false,
  };
  return {
    state,
    ports: {
      async read() { return { rebuild: { status: state.status, approvedCandidateRevision: state.approved, tenantId: "mooney", launch: { receipt: state.receipt, readBack: state.readBack } } }; },
      async launch(_a: WorkspaceActor, _w: string, selection: { candidateRevision: number }) {
        state.launches++;
        state.receipt = { receiptId: `hosted-${selection.candidateRevision}`, candidateRevision: selection.candidateRevision, providerUrl: "https://mooney.strelva.com/" };
        state.readBack = { status: "verified", message: "Serves every page." };
        state.status = "launched";
        if (state.failAfterWrite) throw new Error("Response lost after publish.");
        return { rebuild: { launch: { receipt: state.receipt, readBack: state.readBack } } };
      },
    },
  };
}

function hostedEffect(id = "publish-site", candidateRevision = 3): DeclaredEffect {
  return {
    id, kind: "publish", channel: "hosted_website", system: { systemId: "b1000000-0000-4000-8000-0000000000e1" }, description: "Publish the rebuilt site",
    request: { workId: WORK, expectedRevision: 7, candidateRevision, candidateContentHash: HASH }, after: [], publish: { section: "hero", data: { headline: "Mooney Firm" } },
  };
}

describe("live channel adapters", () => {
  it("select only their own channel; isolated fakes serve effects without one", () => {
    const iso = createIsolatedAdapter("publish");
    const hosted = createHostedWebsiteAdapter(hostedPorts().ports, ctx());
    expect(selectAdapter([iso, hosted], hostedEffect())).toBe(hosted);
    expect(selectAdapter([hosted], { kind: "publish" })).toBeUndefined();
    expect(selectAdapter([iso], hostedEffect())).toBe(iso);
    expect(selectAdapter([hosted], { kind: "publish", channel: "booking_page" })).toBeUndefined();
  });

  it("hosted website: launches through the rebuild service, reads back, finds an interrupted launch, and never auto-undoes", async () => {
    const { ports, state } = hostedPorts();
    const adapter = createHostedWebsiteAdapter(ports, ctx());
    expect(adapter.mode).toBe("live");
    await expect(adapter.ready!({ businessId: BIZ, effect: hostedEffect() })).resolves.toEqual({ ok: true });
    await expect(createHostedWebsiteAdapter(ports, ctx({ hosted_website: false })).ready!({ businessId: BIZ, effect: hostedEffect() }))
      .resolves.toMatchObject({ ok: false, reason: expect.stringMatching(/not live for the hosted website/) });
    await expect(adapter.find({ businessId: BIZ, idempotencyKey: "k", effect: hostedEffect() })).resolves.toEqual({ found: false });
    const result = await adapter.perform({ businessId: BIZ, effect: hostedEffect(), idempotencyKey: "k" });
    expect(result).toMatchObject({ status: "accepted", providerRef: `${WORK}:hosted-3` });
    await expect(adapter.readBack({ businessId: BIZ, providerRef: `${WORK}:hosted-3` })).resolves.toEqual({ ok: true, detail: "Serves every page." });
    await expect(adapter.find({ businessId: BIZ, idempotencyKey: "k", effect: hostedEffect() })).resolves.toEqual({ found: true, providerRef: `${WORK}:hosted-3` });
    await expect(adapter.compensate!({ businessId: BIZ, providerRef: `${WORK}:hosted-3`, idempotencyKey: "k:c" })).resolves.toMatchObject({ ok: false, detail: expect.stringMatching(/needs review/) });
    // A different approved candidate is refused before any write.
    state.status = "approved"; state.approved = 4;
    await expect(adapter.perform({ businessId: BIZ, effect: hostedEffect("again", 3), idempotencyKey: "k2" })).resolves.toMatchObject({ status: "rejected" });
    expect(state.launches).toBe(1);
    await expect(adapter.perform({ businessId: BIZ, effect: { ...hostedEffect(), request: {} }, idempotencyKey: "k3" })).resolves.toMatchObject({ status: "rejected" });
  });

  it("tenant content: governed publish with the step key on the version, read back, restore the previous version", async () => {
    const versions: Array<{ id: string; requestId?: string; data?: unknown }> = [{ id: "v_old", data: { headline: "Old" } }];
    let live: Record<string, unknown> = { headline: "Old" };
    const restore = vi.fn(async (_s: string, id: string) => { live = { ...(versions.find((v) => v.id === id)!.data as object) }; versions.unshift({ id: "v_restore" }); return { id: "v_restore" }; });
    let outcome: "published" | "queued" | "blocked" = "published";
    const ports = {
      tenantConfig: async (id: string) => (id === "mooney" ? { id } : null),
      apply: vi.fn(async (input: { data: Record<string, unknown>; requestId: string }) => {
        if (outcome !== "published") return { status: outcome, message: "Held." };
        live = { ...input.data }; versions.unshift({ id: "v_new", requestId: input.requestId, data: input.data }); return { status: "published" as const };
      }),
      versions: async () => versions,
      content: async () => live,
      restore,
    };
    const adapter = createTenantContentAdapter(ports, ctx());
    const effect: DeclaredEffect = { id: "hero", kind: "publish", channel: "tenant_content", system: { systemId: "b1000000-0000-4000-8000-0000000000e1" }, description: "Update the hero",
      request: { tenantId: "mooney", section: "hero", data: { headline: "New" } }, after: [], publish: { section: "hero", data: { headline: "New" } } };
    const accepted = await adapter.perform({ businessId: BIZ, effect, idempotencyKey: "mr:hero" });
    expect(accepted).toEqual({ status: "accepted", providerRef: "mooney|hero|v_new", result: { tenantId: "mooney", section: "hero" } });
    expect(ports.apply).toHaveBeenCalledWith(expect.objectContaining({ requestId: "mr:hero" }));
    await expect(adapter.find({ businessId: BIZ, idempotencyKey: "mr:hero", effect })).resolves.toEqual({ found: true, providerRef: "mooney|hero|v_new" });
    await expect(adapter.readBack({ businessId: BIZ, providerRef: "mooney|hero|v_new" })).resolves.toMatchObject({ ok: true });
    await expect(adapter.compensate!({ businessId: BIZ, providerRef: "mooney|hero|v_new", idempotencyKey: "c" })).resolves.toMatchObject({ ok: true });
    expect(live).toEqual({ headline: "Old" });
    // Anything after it means a person looks first.
    await expect(adapter.compensate!({ businessId: BIZ, providerRef: "mooney|hero|v_new", idempotencyKey: "c" })).resolves.toMatchObject({ ok: false });
    outcome = "queued";
    await expect(adapter.perform({ businessId: BIZ, effect, idempotencyKey: "mr:hero2" })).resolves.toMatchObject({ status: "rejected", reason: expect.stringMatching(/waits in review/) });
    await expect(adapter.perform({ businessId: BIZ, effect: { ...effect, request: { ...effect.request, tenantId: "gone" } }, idempotencyKey: "x" })).resolves.toMatchObject({ status: "rejected" });
    await expect(adapter.perform({ businessId: BIZ, effect: { ...effect, publish: { section: "about", data: {} } }, idempotencyKey: "x" })).resolves.toMatchObject({ status: "rejected" });
  });

  it("inquiry form: claims by the step key, executes, finds the accepted claim, and undoes with a new publication", async () => {
    const claims = new Map<string, { id: string; status: string; tenantId: string; businessId: string; requestId: string; capabilityId: string; changeId: string; version: number; action: string }>();
    const ports = {
      queue: vi.fn(async (input: { idempotencyKey: string; action: "make_live" | "undo"; tenantId: string; businessId: string; requestId: string; capabilityId: string; changeId: string; version: number }) => {
        const existing = claims.get(input.idempotencyKey);
        if (existing) return { claim: existing, acquired: false, reason: "already_claimed", eventId: existing.status === "claimed" ? `evt-${existing.id}` : null };
        const claim = { id: `claim-${claims.size + 1}`, status: "claimed", ...input };
        claims.set(input.idempotencyKey, claim);
        return { claim, acquired: true, eventId: `evt-${claim.id}` };
      }),
      execute: vi.fn(async (input: { claimId: string }) => { for (const c of claims.values()) if (c.id === input.claimId) c.status = "accepted"; return { accepted: true, verified: true }; }),
      claim: async (_t: string, id: string) => [...claims.values()].find((c) => c.id === id) ?? null,
    };
    const adapter = createInquiryFormAdapter(ports, ctx());
    const effect: DeclaredEffect = { id: "form", kind: "publish", channel: "inquiry_form", system: { systemId: "b1000000-0000-4000-8000-0000000000e2" }, description: "Publish the consult form",
      request: { tenantId: "mooney", businessId: "mooney-biz", requestId: "req-1", capabilityId: "contact", changeId: "chg-1", version: 2 }, after: [], publish: { section: "contact", data: {} } };
    await expect(adapter.perform({ businessId: BIZ, effect, idempotencyKey: "mr:form" })).resolves.toMatchObject({ status: "accepted", providerRef: "mooney|claim-1" });
    // A replay with the same key finds the accepted claim and executes nothing again.
    await expect(adapter.perform({ businessId: BIZ, effect, idempotencyKey: "mr:form" })).resolves.toMatchObject({ status: "accepted", providerRef: "mooney|claim-1" });
    expect(ports.execute).toHaveBeenCalledTimes(1);
    await expect(adapter.find({ businessId: BIZ, idempotencyKey: "mr:form", effect })).resolves.toEqual({ found: true, providerRef: "mooney|claim-1" });
    await expect(adapter.find({ businessId: BIZ, idempotencyKey: "mr:form" })).resolves.toBeNull();
    await expect(adapter.readBack({ businessId: BIZ, providerRef: "mooney|claim-1" })).resolves.toMatchObject({ ok: true });
    await expect(adapter.compensate!({ businessId: BIZ, providerRef: "mooney|claim-1", idempotencyKey: "mr:form:compensate" })).resolves.toMatchObject({ ok: true, detail: expect.stringMatching(/Inquiries already received are kept/) });
    expect(ports.queue).toHaveBeenLastCalledWith(expect.objectContaining({ action: "undo", idempotencyKey: "mr:form:compensate" }));
  });

  it("booking page: publishes the grant, finds it by capability, reads it back, revokes it", async () => {
    const grants: Array<Record<string, unknown>> = [];
    const ports = {
      publish: vi.fn(async (_a: WorkspaceActor, input: { capabilityId: string; capabilityVersion: number; workId: string }) => {
        if (grants.some((g) => g.capability_id === input.capabilityId)) throw new Error("duplicate key value violates unique constraint");
        const grant = { id: "grant-1", status: "published", capability_id: input.capabilityId, capability_version: input.capabilityVersion, work_id: input.workId };
        grants.push(grant); return grant;
      }),
      list: async () => grants,
      revoke: vi.fn(async (_a: WorkspaceActor, input: { grantId: string }) => { const g = grants.find((x) => x.id === input.grantId)!; g.status = "revoked"; return g; }),
    };
    const adapter = createBookingPageAdapter(ports, ctx());
    const request = { businessId: BIZ, tenantId: "mooney", workId: WORK, capabilityId: "consults", capabilityVersion: 1, inquiryCapabilityId: "contact", inquiryVersion: 1, provider: "google", displayName: "Consults", timeZone: "America/New_York" };
    const effect: DeclaredEffect = { id: "booking", kind: "publish", channel: "booking_page", system: { introducedKey: "booking" }, description: "Publish consult booking", request, after: [], publish: { section: "contact", data: {} } };
    await expect(adapter.perform({ businessId: "b1000000-0000-4000-8000-000000000099", effect, idempotencyKey: "k" })).resolves.toMatchObject({ status: "rejected" });
    expect(ports.publish).not.toHaveBeenCalled();
    await expect(adapter.perform({ businessId: BIZ, effect, idempotencyKey: "k" })).resolves.toMatchObject({ status: "accepted", providerRef: `${BIZ}|grant-1` });
    await expect(adapter.find({ businessId: BIZ, idempotencyKey: "k", effect })).resolves.toEqual({ found: true, providerRef: `${BIZ}|grant-1` });
    await expect(adapter.readBack({ businessId: BIZ, providerRef: `${BIZ}|grant-1` })).resolves.toMatchObject({ ok: true });
    await expect(adapter.compensate!({ businessId: BIZ, providerRef: `${BIZ}|grant-1`, idempotencyKey: "c" })).resolves.toMatchObject({ ok: true, detail: expect.stringMatching(/Bookings already made are kept/) });
    await expect(adapter.readBack({ businessId: BIZ, providerRef: `${BIZ}|grant-1` })).resolves.toMatchObject({ ok: false });
    await expect(adapter.find({ businessId: BIZ, idempotencyKey: "k", effect })).resolves.toEqual({ found: false });
  });

  it("internal app: releases through publishApplication, finds the release, rolls back to the previous one", async () => {
    const app = { release: { version: 1 } as { version: number } | null, releases: [{ version: 1 }], designRevision: 4 };
    const ports = {
      read: async () => ({ payload: structuredClone(app) }),
      publish: vi.fn(async () => { const v = (app.release?.version ?? 0) + 1; app.release = { version: v }; app.releases.push({ version: v }); app.designRevision++; return { payload: structuredClone(app) }; }),
      rollback: vi.fn(async (_a: WorkspaceActor, _w: string, raw: { version: number }) => { app.release = { version: raw.version }; app.designRevision++; return { payload: structuredClone(app) }; }),
    };
    const adapter = createInternalAppAdapter(ports, ctx());
    const effect: DeclaredEffect = { id: "release", kind: "publish", channel: "internal_app", system: { systemId: "b1000000-0000-4000-8000-0000000000e3" }, description: "Release the intake app",
      request: { workId: WORK, expectedCandidateRevision: 2, expectedReleaseVersion: 1 }, after: [], publish: { section: "settings", data: {} } };
    await expect(adapter.find({ businessId: BIZ, idempotencyKey: "k", effect })).resolves.toEqual({ found: false });
    await expect(adapter.perform({ businessId: BIZ, effect, idempotencyKey: "k" })).resolves.toMatchObject({ status: "accepted", providerRef: `${WORK}@v2` });
    await expect(adapter.find({ businessId: BIZ, idempotencyKey: "k", effect })).resolves.toEqual({ found: true, providerRef: `${WORK}@v2` });
    // The release moved, so a second attempt is refused before writing.
    await expect(adapter.perform({ businessId: BIZ, effect, idempotencyKey: "k" })).resolves.toMatchObject({ status: "rejected" });
    expect(ports.publish).toHaveBeenCalledTimes(1);
    await expect(adapter.readBack({ businessId: BIZ, providerRef: `${WORK}@v2` })).resolves.toMatchObject({ ok: true });
    await expect(adapter.compensate!({ businessId: BIZ, providerRef: `${WORK}@v2`, idempotencyKey: "c" })).resolves.toMatchObject({ ok: true });
    expect(ports.rollback).toHaveBeenCalledWith(OWNER, WORK, { expectedDesignRevision: 5, expectedReleaseVersion: 2, version: 1 });
    await expect(adapter.compensate!({ businessId: BIZ, providerRef: `${WORK}@v1`, idempotencyKey: "c" })).resolves.toMatchObject({ ok: false, detail: expect.stringMatching(/first release/) });
  });

  it("a channel that cannot write yet waits and is never attempted", async () => {
    const google = createWaitingAdapter("google_listing", "Google hasn't approved Strelva's access yet.");
    await expect(google.ready!({ businessId: BIZ, effect: hostedEffect() })).resolves.toEqual({ ok: false, reason: "Google hasn't approved Strelva's access yet." });
    expect(google.reversibility(hostedEffect())).toBe("irreversible");
  });
});

// Plan approvals ------------------------------------------------------------------

async function readyPossibility(input: Partial<PossibilityInput> & { effects: DeclaredEffect[] }) {
  const live = createInMemoryLiveSystems();
  const site = { businessId: BIZ, systemId: "b1000000-0000-4000-8000-0000000000e1" };
  const baseline = live.seed(site, "attymooney.com", { pages: 3 });
  let p = createPossibility({
    title: "consult booking", intent: "Add consult booking.",
    changes: [{ baseline: { ...site, revisionId: baseline, number: 1 }, candidate: { summary: "booking", content: { pages: 4 } } }],
    checks: [{ id: "site-serves", description: "attymooney.com serves every page." }],
    ...input,
  }, { id: randomUUID(), businessId: BIZ, actorId: OWNER.userId, at: AT });
  const rehearsal = await rehearsePossibility(p, live.port, [createIsolatedAdapter("publish"), createIsolatedAdapter("calendar")], AT);
  p = recordRehearsal(p, rehearsal, p.revision, OWNER.userId, AT);
  p = await markReady(p, live.port, p.revision, OWNER.userId, AT);
  return { p, live, site };
}

describe("plan approvals keyed by workspace", () => {
  it("one approval covers every effect of exactly this candidate; any effect change breaks it", async () => {
    const { p } = await readyPossibility({ effects: [hostedEffect(), { ...hostedEffect("google"), channel: "google_listing" }] });
    const approvals = createInMemoryApprovalRecords();
    approvals.record({ id: "a1", businessId: BIZ, subject: planApprovalSubject(p), status: "approved", decidedBy: "owner_link" });
    for (const effect of p.effects) expect(approvalProblem(await approvals.get(BIZ, "a1"), BIZ, p, effect)).toBeNull();
    const changed = { ...p, effects: [{ ...p.effects[0]!, request: { ...p.effects[0]!.request, candidateRevision: 4 } }, p.effects[1]!] };
    expect(approvalProblem(await approvals.get(BIZ, "a1"), BIZ, changed, changed.effects[0]!)).toMatch(/different/);
    expect(planFingerprint(changed)).not.toBe(planFingerprint(p));
    // A per-effect record is never a plan approval, and another business's record never resolves.
    approvals.record({ id: "a2", businessId: BIZ, subject: effectApprovalSubject(p, p.effects[0]!), status: "approved" });
    expect(approvalProblem(await approvals.get(BIZ, "a2"), BIZ, p, p.effects[0]!)).toBeNull();
    await expect(approvals.get("b1000000-0000-4000-8000-000000000099", "a1")).resolves.toBeNull();
  });

  it("reads approvals from Needs you by workspace, with no tenant involved", async () => {
    const { p } = await readyPossibility({ effects: [hostedEffect()] });
    const itemId = randomUUID();
    const row = { id: itemId, workspaceId: BIZ, sourceLifecycle: "make_real", sourceId: p.id, revisionHash: planFingerprint(p), state: "approved", decidedByKind: "owner_link", decidedAt: AT };
    const records = createNeedsYouApprovalRecords({ read: async (ws, id) => (ws === BIZ && id === itemId ? row : null) });
    const record = await records.get(BIZ, itemId);
    expect(record).toMatchObject({ status: "approved", subject: { kind: "make_real_plan", possibilityId: p.id } });
    expect(approvalProblem(record, BIZ, p, p.effects[0]!)).toBeNull();
    row.state = "withdrawn";
    expect((await records.get(BIZ, itemId))?.status).toBe("dismissed");
    await expect(records.get("b1000000-0000-4000-8000-000000000099", itemId)).resolves.toBeNull();
    await expect(createNeedsYouApprovalRecords({ read: async () => ({ ...row, sourceLifecycle: "tenant_event" }) }).get(BIZ, itemId)).resolves.toBeNull();
  });

  it("governed-work approvals name their business directly; the tenant lookup is only a fallback", async () => {
    const { p } = await readyPossibility({ effects: [hostedEffect()] });
    const subject = effectApprovalSubject(p, p.effects[0]!);
    const businessForTenant = vi.fn(async () => null);
    const records = createGovernedWorkApprovalRecords({
      readEvent: async (id) => ({ id, tenantId: "", source: "ai", type: "approval", title: "x", status: "approved", createdAt: AT, metadata: { makeRealEffect: subject, businessId: BIZ } } as never),
      businessForTenant,
    });
    await expect(records.get(BIZ, "evt-1")).resolves.toMatchObject({ businessId: BIZ, status: "approved" });
    expect(businessForTenant).not.toHaveBeenCalled();
  });
});

// The live service ----------------------------------------------------------------

function service(input: { p: Possibility; live: ReturnType<typeof createInMemoryLiveSystems>; adapters: EffectAdapter[]; activations?: ActivationRepository; clock?: { now: number } }) {
  const possibilities = createInMemoryPossibilityRepository();
  const activations = input.activations ?? createInMemoryActivationRepository();
  const approvals = createInMemoryApprovalRecords();
  const clock = input.clock ?? { now: Date.parse(AT) };
  const svc = createLiveMakeRealService({
    possibilities: () => possibilities, activations: () => activations, live: () => input.live.port,
    adapters: () => input.adapters, approvals, clock: () => new Date(clock.now).toISOString(),
  });
  return { svc, possibilities, activations, approvals, clock };
}

describe("live Make real service", () => {
  it("the moment: what lands stays, Google waits, the result reads Partly live, and nothing rolls back", async () => {
    const hosted = hostedPorts();
    const { p, live, site } = await readyPossibility({ effects: [hostedEffect(), { ...hostedEffect("google"), channel: "google_listing", description: "Add the booking link on Google" }] });
    const { svc, possibilities, approvals } = service({ p, live, adapters: [createHostedWebsiteAdapter(hosted.ports, ctx()), createWaitingAdapter("google_listing", "Google hasn't approved Strelva's access yet.")] });
    await possibilities.create(p);
    await expect(svc.startApproved({ actor: OWNER, workspaceId: BIZ, possibilityId: p.id, approvalId: "nope" })).rejects.toThrow(/no approval record with that id exists/);
    approvals.record({ id: "a1", businessId: BIZ, subject: planApprovalSubject(p), status: "approved", decidedBy: "owner_link" });
    const a = await svc.startApproved({ actor: OWNER, workspaceId: BIZ, possibilityId: p.id, approvalId: "a1" });
    expect(a.status).toBe("needs_attention");
    const view = customerActivationView(a, "consult booking");
    expect(view.headline).toBe("Partly live");
    expect(view.lines.find((l) => l.step === "effect:publish-site")).toMatchObject({ state: "Done", isolated: false });
    expect(view.lines.find((l) => l.step === "effect:google")).toMatchObject({ state: "Waiting", detail: "Google hasn't approved Strelva's access yet." });
    expect(view.lines.find((l) => l.step.startsWith("activate:"))).toMatchObject({ state: "Not started" });
    // Live is unchanged until every effect it depends on landed.
    expect((await live.port.current(site))!.content).toEqual({ pages: 3 });
    expect(hosted.state.launches).toBe(1);
    // Resume with Google still waiting: nothing repeats, still partly live.
    const again = await svc.resume(OWNER, BIZ, a.id, "operator ops@strelva.test");
    expect(again.status).toBe("needs_attention");
    expect(hosted.state.launches).toBe(1);
    expect(again.history.find((h) => h.kind === "resume")?.detail).toMatch(/operator ops@strelva.test/);
  });

  it("re-reads the approval before every step: a withdrawn approval stops the next write", async () => {
    const hosted = hostedPorts();
    const { p, live } = await readyPossibility({ effects: [hostedEffect()] });
    const { svc, possibilities, approvals } = service({ p, live, adapters: [createHostedWebsiteAdapter(hosted.ports, ctx())] });
    await possibilities.create(p);
    approvals.record({ id: "a1", businessId: BIZ, subject: planApprovalSubject(p), status: "approved" });
    // Withdraw between start and the first step by stubbing the store read order.
    approvals.setStatus("a1", "approved");
    const authority = createApprovalAuthority({ approvals, possibilities, possibilityId: p.id, approvalId: "a1" });
    await expect(authority.check(OWNER, { businessId: BIZ, scope: "site.publish" })).resolves.toMatchObject({ allowed: true });
    await expect(authority.check(OWNER, { businessId: BIZ, scope: "calendar.write" })).resolves.toMatchObject({ allowed: false });
    approvals.setStatus("a1", "dismissed");
    await expect(authority.check(OWNER, { businessId: BIZ, scope: "system.activate" })).resolves.toMatchObject({ allowed: false, reason: "the approval is dismissed" });
    await expect(svc.startApproved({ actor: OWNER, workspaceId: BIZ, possibilityId: p.id, approvalId: "a1" })).rejects.toThrow(/the approval is dismissed/);
    expect(hosted.state.launches).toBe(0);
  });

  it("a withdrawal between steps blocks the next write; what landed stays", async () => {
    const hosted = hostedPorts();
    const second = vi.fn(async () => ({ status: "accepted" as const, providerRef: "app@v2" }));
    const appAdapter: EffectAdapter = { ...createInternalAppAdapter({ read: async () => ({ payload: {} }), publish: async () => ({ payload: {} }), rollback: async () => ({ payload: {} }) }, ctx()), perform: second };
    const appEffect: DeclaredEffect = { id: "release", kind: "publish", channel: "internal_app", system: { systemId: "b1000000-0000-4000-8000-0000000000e1" }, description: "Release the app",
      request: { workId: WORK, expectedCandidateRevision: 1, expectedReleaseVersion: null }, after: ["publish-site"], publish: { section: "settings", data: {} } };
    const { p, live } = await readyPossibility({ effects: [hostedEffect(), appEffect] });
    const { svc, possibilities, approvals } = service({ p, live, adapters: [createHostedWebsiteAdapter({ ...hosted.ports, launch: async (...args) => { const r = await hosted.ports.launch(...args); approvals.setStatus("a1", "dismissed"); return r; } }, ctx()), appAdapter] });
    await possibilities.create(p);
    approvals.record({ id: "a1", businessId: BIZ, subject: planApprovalSubject(p), status: "approved" });
    const a = await svc.startApproved({ actor: OWNER, workspaceId: BIZ, possibilityId: p.id, approvalId: "a1" });
    expect(a.status).toBe("needs_attention");
    expect(a.steps.find((s) => s.id === "effect:publish-site")).toMatchObject({ status: "completed", effect: "accepted" });
    expect(a.steps.find((s) => s.id === "effect:release")).toMatchObject({ status: "blocked", reason: expect.stringMatching(/dismissed/) });
    expect(second).not.toHaveBeenCalled();
    expect(a.status).not.toBe("rolled_back");
  });

  it("refuses to start a plan with an isolated-only effect (calendar)", async () => {
    const { p, live } = await readyPossibility({ effects: [{ id: "hold", kind: "calendar", system: { systemId: "b1000000-0000-4000-8000-0000000000e1" }, description: "Hold a slot", request: {}, after: [] }] });
    const { svc, possibilities, approvals } = service({ p, live, adapters: [createHostedWebsiteAdapter(hostedPorts().ports, ctx())] });
    await possibilities.create(p);
    approvals.record({ id: "a1", businessId: BIZ, subject: planApprovalSubject(p), status: "approved" });
    await expect(svc.startApproved({ actor: OWNER, workspaceId: BIZ, possibilityId: p.id, approvalId: "a1" })).rejects.toThrow(/no calendar connection/);
  });

  it("made real: every effect read back confirmed, the pointer switched, the possibility closed", async () => {
    const hosted = hostedPorts();
    const { p, live, site } = await readyPossibility({ effects: [hostedEffect()] });
    const { svc, possibilities, approvals } = service({ p, live, adapters: [createHostedWebsiteAdapter(hosted.ports, ctx())] });
    await possibilities.create(p);
    approvals.record({ id: "a1", businessId: BIZ, subject: planApprovalSubject(p), status: "approved" });
    const a = await svc.startApproved({ actor: OWNER, workspaceId: BIZ, possibilityId: p.id, approvalId: "a1" });
    expect(a.status).toBe("made_real");
    expect(customerActivationView(a, "the rebuilt site").headline).toBe("Live.");
    expect((await live.port.current(site))!.content).toEqual({ pages: 4 });
    expect((await possibilities.get(BIZ, p.id))!.status).toBe("made_real");
  });

  it("a worker killed after the provider accepted and before the checkpoint: resume finds the write and never repeats it", async () => {
    const hosted = hostedPorts();
    const { p, live } = await readyPossibility({ effects: [hostedEffect()] });
    const memory = createInMemoryActivationRepository();
    let killAfterStart = true;
    const crashing: ActivationRepository = {
      get: (b, id) => memory.get(b, id), create: (v) => memory.create(v),
      async save(value, expected) {
        // The "outcome" checkpoint of the effect step is lost: the process died.
        if (killAfterStart && value.history.at(-1)?.kind === "outcome" && value.history.at(-1)?.detail?.startsWith("effect:")) { killAfterStart = false; throw new Error("worker killed"); }
        return memory.save(value, expected);
      },
    };
    const clock = { now: Date.parse(AT) };
    const { svc, possibilities, approvals } = service({ p, live, adapters: [createHostedWebsiteAdapter(hosted.ports, ctx())], activations: crashing, clock });
    await possibilities.create(p);
    approvals.record({ id: "a1", businessId: BIZ, subject: planApprovalSubject(p), status: "approved" });
    await expect(svc.startApproved({ actor: OWNER, workspaceId: BIZ, possibilityId: p.id, approvalId: "a1" })).rejects.toThrow("worker killed");
    const activationId = (await possibilities.get(BIZ, p.id))!.activationId!;
    const stuck = await memory.get(BIZ, activationId);
    expect(stuck!.steps.find((s) => s.kind === "effect")!.status).toBe("running");
    // Too soon: another worker may still be running it.
    expect((await svc.resumeDue([{ workspaceId: BIZ, activationId, actor: OWNER }])).results[0]).toMatchObject({ status: "error" });
    clock.now += 3 * 60_000;
    const resumed = await svc.resumeDue([{ workspaceId: BIZ, activationId, actor: OWNER }]);
    expect(resumed.results[0]).toMatchObject({ status: "made_real" });
    expect(hosted.state.launches).toBe(1);
    const done = await memory.get(BIZ, activationId);
    expect(done!.steps.find((s) => s.kind === "effect")!.receipt).toMatchObject({ reconciledBy: "provider_lookup", adapterMode: "live" });
  });

  it("an unknown outcome is never replayed, by the cron or a resume", async () => {
    const { p, live } = await readyPossibility({ effects: [hostedEffect()] });
    const perform = vi.fn(async () => { throw new Error("timeout after send"); });
    const blind: EffectAdapter = { ...createHostedWebsiteAdapter(hostedPorts().ports, ctx()), perform, find: async () => null };
    const { svc, possibilities, approvals } = service({ p, live, adapters: [blind] });
    await possibilities.create(p);
    approvals.record({ id: "a1", businessId: BIZ, subject: planApprovalSubject(p), status: "approved" });
    const a = await svc.startApproved({ actor: OWNER, workspaceId: BIZ, possibilityId: p.id, approvalId: "a1" });
    expect(a.status).toBe("needs_attention");
    expect(customerActivationView(a, "x").lines.find((l) => l.step.startsWith("effect:"))).toMatchObject({ state: "Not sure yet" });
    expect(customerActivationView(a, "x").checking).toBe(true);
    expect((await svc.resumeDue([{ workspaceId: BIZ, activationId: a.id, actor: OWNER }])).results[0]).toMatchObject({ status: "needs_attention" });
    await svc.resume(OWNER, BIZ, a.id);
    expect(perform).toHaveBeenCalledTimes(1);
    // The operator reconciles with evidence, then it finishes.
    const settled = await svc.reconcile(OWNER, BIZ, a.id, { stepId: "effect:publish-site", resolution: "completed", evidence: "Vercel shows the deploy", providerRef: `${WORK}:hosted-3`, note: "operator ops@strelva.test" });
    expect(settled.steps.find((s) => s.kind === "effect")!.status).toBe("completed");
  });

  it("checks are real: no Made real while a published change is unconfirmed or a check has no runner", async () => {
    const checks = createLiveOperatingChecks();
    const base = { businessId: BIZ, activation: { steps: [{ kind: "effect", effect: "accepted", label: "Publish", readBack: { status: "failed" } }] } as never };
    await expect(checks.run({ ...base, checkId: "site-serves" })).resolves.toMatchObject({ passed: false });
    await expect(checks.run({ ...base, checkId: "form-delivers" })).resolves.toMatchObject({ passed: false, detail: expect.stringMatching(/operator confirms/) });
  });
});

describe("operator queue", () => {
  it("lists each step of a partly live activation that needs a person, and nothing for a finished one", async () => {
    const { activationExceptions } = await import("@/products/operations/activation-exceptions");
    const hosted = hostedPorts();
    const { p, live } = await readyPossibility({ effects: [hostedEffect(), { ...hostedEffect("google"), channel: "google_listing", description: "Add the booking link on Google" }] });
    const { svc, possibilities, approvals } = service({ p, live, adapters: [createHostedWebsiteAdapter(hosted.ports, ctx()), createWaitingAdapter("google_listing", "Google hasn't approved Strelva's access yet.")] });
    await possibilities.create(p);
    approvals.record({ id: "a1", businessId: BIZ, subject: planApprovalSubject(p), status: "approved" });
    const a = await svc.startApproved({ actor: OWNER, workspaceId: BIZ, possibilityId: p.id, approvalId: "a1" });
    const rows = [{ id: "row-1", workspace_id: BIZ, payload: a }, { id: "row-2", workspace_id: BIZ, payload: { kind: "responsibility" } }];
    const out = activationExceptions(rows, new Map([[BIZ, "The Mooney Firm"]]), new Map([[OWNER.userId, OWNER.verifiedEmail]]));
    expect(out).toEqual([expect.objectContaining({
      source: "activation", workspaceName: "The Mooney Firm", stepId: "effect:google", stepStatus: "blocked", effect: "none", safeAction: "retry",
      reason: expect.stringMatching(/Google hasn't approved/), owner: { userId: OWNER.userId, email: OWNER.verifiedEmail },
      deepLink: expect.stringContaining(`activationId=${a.id}`),
    })]);
    expect(activationExceptions([{ id: "x", workspace_id: BIZ, payload: { ...a, status: "made_real" } }], new Map(), new Map())).toEqual([]);
  });
});

// Needs you -----------------------------------------------------------------------

function memoryNeedsYou() {
  const items = new Map<string, OwnerDecision>();
  const store = {
    async open(workspaceId: string, p: ProposedItem) {
      const same = [...items.values()].find((i) => i.workspaceId === workspaceId && i.sourceId === p.sourceId && i.revisionHash === p.revisionHash);
      if (same) return same;
      const row: OwnerDecision = {
        id: randomUUID(), workspaceId, systemId: p.systemId ?? null, kind: p.kind, route: p.route, title: p.title, detail: p.detail ?? null,
        approveEffect: p.approveEffect, notYetEffect: p.notYetEffect, sourceLifecycle: p.sourceLifecycle, sourceId: p.sourceId, revisionHash: p.revisionHash,
        urgent: p.urgent, signInRequired: false, adminMayDecide: p.adminMayDecide, openHref: p.openHref ?? null, state: "open", outcome: null, outcomeReason: null,
        receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "not_sent", operatorNote: null, openedAt: AT, expiresAt: "2026-10-20T12:00:00.000Z",
        reminded1At: null, reminded2At: null, deliveries: [],
      };
      items.set(row.id, row); return row;
    },
    async read(ws: string, id: string) { const i = items.get(id); return i && i.workspaceId === ws ? i : null; },
    async list(_a: WorkspaceActor, ws: string) { return [...items.values()].filter((i) => i.workspaceId === ws && i.state === "open"); },
    async claim(input: { itemId: string; decision: "approve" | "not_yet"; by: string }) {
      const i = items.get(input.itemId)!;
      const next = { ...i, state: input.decision === "approve" ? "approved" as const : "declined" as const, decidedAt: AT, decidedByKind: input.by };
      items.set(i.id, next); return { status: "claimed" as const, item: next };
    },
    async finish(_ws: string, id: string, outcome: OwnerDecision["outcome"], reason: string | null, receiptRef: string | null) { const next = { ...items.get(id)!, outcome, outcomeReason: reason, receiptRef }; items.set(id, next); return next; },
    async withdraw(_ws: string, id: string) { const next = { ...items.get(id)!, state: "withdrawn" as const }; items.set(id, next); return next; },
    async ownerActor(_ws: string, recipient: string) { return recipient === OWNER.verifiedEmail ? OWNER : null; },
  };
  return { items, store: store as unknown as NeedsYouStore };
}

describe("Make real through Needs you", () => {
  it("an owner who never signs in: one item per Ready plan, approve by link starts it, Not yet changes nothing", async () => {
    const hosted = hostedPorts();
    const { p, live } = await readyPossibility({ effects: [hostedEffect(), { ...hostedEffect("google"), channel: "google_listing", description: "Add the booking link on Google" }] });
    const possibilities = createInMemoryPossibilityRepository();
    await possibilities.create(p);
    const { items, store } = memoryNeedsYou();
    const svc = createLiveMakeRealService({
      possibilities: () => possibilities, activations: () => activations, live: () => live.port,
      adapters: () => [createHostedWebsiteAdapter(hosted.ports, ctx()), createWaitingAdapter("google_listing", "Google hasn't approved Strelva's access yet.")],
      approvals: createNeedsYouApprovalRecords({ read: (ws, id) => store.read(ws, id) }), clock: () => AT,
    });
    const activations = createInMemoryActivationRepository();
    const ready = async () => (await possibilities.list(BIZ)).filter((x) => x.status === "ready" && !x.activationId);
    const adapter = createMakeRealNeedsYouAdapter({ enabled: async (ws) => ws === BIZ, readReady: ready, systemNames: async () => new Map([[p.changes[0]!.baseline.systemId, "attymooney.com"]]), service: svc });
    const needsYou = createNeedsYouService({ store, adapters: [adapter], sendEmail: async () => ({ status: "suppressed", reason: "test" }) as never, appOrigin: "https://app.strelva.test", now: () => Date.parse(AT) });

    await expect(adapter.propose({ workspaceId: "b1000000-0000-4000-8000-000000000099" })).resolves.toEqual({ items: [], complete: true });
    const synced = await needsYou.sync({ workspaceId: BIZ });
    expect(synced.opened).toHaveLength(1);
    const item = synced.opened[0]!;
    expect(item).toMatchObject({ kind: "system.change_live", route: "owner_decides", sourceLifecycle: "make_real", sourceId: p.id, revisionHash: planFingerprint(p), title: "Make consult booking live?" });
    expect(item.detail).toMatch(/attymooney.com/);
    await needsYou.sync({ workspaceId: BIZ });
    expect(items.size).toBe(1);

    // A link from someone who is not the owner is refused before anything runs.
    await expect(needsYou.decide({ workspaceId: BIZ, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: "someone@else.test" } }))
      .resolves.toMatchObject({ status: "sign_in" });
    expect(hosted.state.launches).toBe(0);
    const decided = await needsYou.decide({ workspaceId: BIZ, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "owner_link", recipient: OWNER.verifiedEmail } });
    expect(decided.status).toBe("done_unverified");
    expect(decided.item?.outcomeReason).toBe("Partly live");
    expect(hosted.state.launches).toBe(1);
    // Being made real, it is no longer an open ask.
    await expect(adapter.currentRevision({ workspaceId: BIZ }, p.id)).resolves.toBeNull();
  });

  it("Not yet changes nothing and leaves the plan ready", async () => {
    const { p } = await readyPossibility({ effects: [hostedEffect()] });
    const startApproved = vi.fn();
    const adapter = createMakeRealNeedsYouAdapter({ enabled: async () => true, readReady: async () => [p], systemNames: async () => new Map(), service: { startApproved } });
    const item = { id: randomUUID(), sourceId: p.id, title: "Make x live?" } as OwnerDecision;
    await expect(adapter.resolve({ workspaceId: BIZ }, item, "not_yet", { kind: "session", actor: OWNER })).resolves.toMatchObject({ outcome: "done" });
    await expect(adapter.resolve({ workspaceId: BIZ }, item, "approve", { kind: "expiry" })).resolves.toMatchObject({ outcome: "failed" });
    expect(startApproved).not.toHaveBeenCalled();
    startApproved.mockRejectedValueOnce(new WorkspaceConflictError("Make real cannot start yet. the plan approval was refused"));
    await expect(adapter.resolve({ workspaceId: BIZ }, item, "approve", { kind: "session", actor: OWNER })).resolves.toMatchObject({ outcome: "failed", reason: expect.stringMatching(/cannot start/) });
  });
});
