import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerDecision, ProposedItem } from "@/platform/needs-you/contracts";
import { NeedsYouRefusedError, type NeedsYouStore } from "@/platform/needs-you/repository";
import { createNeedsYouService } from "@/platform/needs-you/service";
import { ServiceSessionRefusedError, type ServiceSession } from "@/platform/needs-you/service-actor";
import { makeRealAdapter, makeRealSourceId, type ReadyPlan } from "@/platform/needs-you/sources/make-real";
import type { SourceAdapter } from "@/platform/needs-you/adapters";

// Make real for an owner with no account (owner-entry decision 6): a signed
// one-tap link decides the plan; Strelva (system) reads and runs it under a
// make_real_link session bound to the item; the plan fingerprint is checked
// before the claim and again before anything runs; the run is logged first.
// The SQL side is proven by tests/make-real-owner-link-schema.sql.

const WS = "bbbbbbbb-0000-4000-8000-000000000001";
const OWNER_EMAIL = "rae@example.test";
const OWNER = { userId: "bbbbbbbb-0000-4000-8000-0000000000a1", verifiedEmail: OWNER_EMAIL };
const STRELVA_ADMIN = { userId: "bbbbbbbb-0000-4000-8000-0000000000b1", verifiedEmail: "operator@strelva.example.test" };
const FINGERPRINT = "f".repeat(64);
const DAY = 24 * 3600 * 1000;

function plan(overrides: Partial<ReadyPlan> = {}): ReadyPlan {
  return {
    possibilityId: "website-rebuild:w1", candidateRevision: 2, fingerprint: FINGERPRINT, title: "A rebuilt website", intent: "Rebuild the site",
    affects: ["Website"], introducesSystem: false, systemId: "bbbbbbbb-0000-4000-8000-0000000000c1", ...overrides,
  };
}

function session(overrides: Partial<ServiceSession> = {}): ServiceSession {
  return { kind: "strelva_system", label: "Strelva (system)", sessionId: randomUUID(), workspaceId: WS, purpose: "make_real_link", onBehalf: { role: "admin" }, actor: STRELVA_ADMIN, ...overrides };
}

function memoryStore() {
  const items = new Map<string, OwnerDecision>();
  const state = { ownerMember: false, link: vi.fn<(ws: string, id: string, recipient: string) => Promise<ServiceSession | null>>(async () => session()) };
  const store: NeedsYouStore = {
    async open(workspaceId, p: ProposedItem) {
      const same = [...items.values()].find(i => i.workspaceId === workspaceId && i.sourceId === p.sourceId && i.revisionHash === p.revisionHash);
      if (same) return same;
      const row: OwnerDecision = {
        id: randomUUID(), workspaceId, systemId: null, kind: p.kind, route: p.route, title: p.title, detail: p.detail ?? null,
        approveEffect: p.approveEffect, notYetEffect: p.notYetEffect, sourceLifecycle: p.sourceLifecycle, sourceId: p.sourceId,
        revisionHash: p.revisionHash, urgent: p.urgent, signInRequired: ["access.grant", "money", "exit"].includes(p.kind), adminMayDecide: p.adminMayDecide,
        openHref: p.openHref ?? null, state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null,
        deliveryState: "not_sent", operatorNote: null, openedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 14 * DAY).toISOString(), reminded1At: null, reminded2At: null, deliveries: [],
      };
      items.set(row.id, row);
      return row;
    },
    async withdraw(_ws, id) { const i = items.get(id)!; const next = { ...i, state: "withdrawn" as const, decidedAt: "now" }; items.set(id, next); return next; },
    async read(ws, id) { const i = items.get(id); return i && i.workspaceId === ws ? i : null; },
    async list(_a, ws) { return [...items.values()].filter(i => i.workspaceId === ws && i.state === "open"); },
    async claim(input) {
      const i = items.get(input.itemId)!;
      if (i.state !== "open") return { status: "already_handled", item: i };
      if (i.revisionHash !== input.revision) return { status: "changed", item: i };
      if (input.by === "owner_link" && input.recipient !== OWNER_EMAIL) throw new NeedsYouRefusedError("owner_decision_recipient_not_owner", "x");
      const next = { ...i, state: input.decision === "approve" ? "approved" as const : "declined" as const, decidedAt: "now", decidedByKind: input.by };
      items.set(i.id, next);
      return { status: "claimed", item: next };
    },
    async expire() { throw new Error("unused"); },
    async finish(_ws, id, outcome, reason, receiptRef) { const i = items.get(id)!; const next = { ...i, outcome, outcomeReason: reason, receiptRef }; items.set(id, next); return next; },
    async recordDelivery() { throw new Error("unused"); },
    async dueForDelivery() { return []; },
    async linkedTenants() { return []; },
    async ownerActor(_ws, recipient) { return state.ownerMember && recipient === OWNER_EMAIL ? OWNER : null; },
    linkSession: (ws, id, recipient) => state.link(ws, id, recipient),
    async policies() { return []; },
    async setPolicy() { throw new Error("unused"); },
    async handled() { return []; },
  };
  return { store, items, state };
}

let mem: ReturnType<typeof memoryStore>;
let plans: ReadyPlan[];
let start: ReturnType<typeof vi.fn>;
let recordLinkRun: ReturnType<typeof vi.fn>;
let calls: string[];

function adapter(overrides: Partial<Parameters<typeof makeRealAdapter>[0]> = {}): SourceAdapter {
  return makeRealAdapter({
    enabled: async () => true,
    readyPlans: async () => plans,
    policies: async () => [],
    start: start as never,
    recordLinkRun: recordLinkRun as never,
    ...overrides,
  });
}

function service(adapters: SourceAdapter[] = [adapter()]) {
  return createNeedsYouService({ store: mem.store, appOrigin: "https://app.example.test", now: () => Date.now(), sendEmail: vi.fn() as never, adapters });
}

/** The item the hourly chase opened under Strelva (system)'s read session. */
async function openItem(kind: "system.change_live" | "money" = "system.change_live"): Promise<OwnerDecision> {
  return mem.store.open(WS, {
    kind, route: "owner_decides", systemId: plan().systemId, title: "Make it live: A rebuilt website", detail: null,
    approveEffect: "Strelva makes it live one step at a time and tells you what landed.", notYetEffect: "Nothing changes. It stays a Possibility you can open.",
    sourceLifecycle: "make_real", sourceId: makeRealSourceId(plan().possibilityId, plan().candidateRevision), revisionHash: FINGERPRINT,
    urgent: false, adminMayDecide: false, openHref: null,
  });
}

beforeEach(() => {
  mem = memoryStore();
  plans = [plan()];
  calls = [];
  recordLinkRun = vi.fn(async (s: ServiceSession, subject: string) => { calls.push(`log:${s.purpose}:${subject}`); });
  start = vi.fn(async (actor: { userId: string }, _ws: string, possibilityId: string, approvalId: string) => {
    calls.push(`start:${actor.userId}:${possibilityId}:${approvalId}`);
    return { status: "partial", isolated: true, liveUnchanged: true, headline: "Part of it landed on an isolated copy." };
  });
});

describe("Make real by signed link, owner with no account", () => {
  it("approves through Needs you, logs Strelva (system)'s one run, then starts the plan with the item as the approval", async () => {
    const item = await openItem();
    const result = await service().decide({ workspaceId: WS, itemId: item.id, revision: FINGERPRINT, decision: "approve", by: { kind: "owner_link", recipient: OWNER_EMAIL } });
    expect(result.status).toBe("done");
    expect(mem.state.link).toHaveBeenCalledWith(WS, item.id, OWNER_EMAIL);
    expect(calls).toEqual([
      "log:make_real_link:possibility:website-rebuild:w1@2",
      `start:${STRELVA_ADMIN.userId}:website-rebuild:w1:${item.id}`,
    ]);
    // The owner's link is the approver of record; the outcome is honest about the isolated copy.
    expect(mem.items.get(item.id)).toMatchObject({ state: "approved", decidedByKind: "owner_link", outcome: "done" });
    expect(mem.items.get(item.id)!.outcomeReason).toContain("isolated copy");
  });

  it("Not yet from the same link changes nothing and runs nothing", async () => {
    const item = await openItem();
    const result = await service().decide({ workspaceId: WS, itemId: item.id, revision: FINGERPRINT, decision: "not_yet", by: { kind: "owner_link", recipient: OWNER_EMAIL } });
    expect(result.status).toBe("done");
    expect(mem.items.get(item.id)).toMatchObject({ state: "declined", outcome: "done" });
    expect(recordLinkRun).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it("a plan that changed after the email was sent is refused before the claim", async () => {
    const item = await openItem();
    plans = [plan({ fingerprint: "e".repeat(64) })];
    const result = await service().decide({ workspaceId: WS, itemId: item.id, revision: FINGERPRINT, decision: "approve", by: { kind: "owner_link", recipient: OWNER_EMAIL } });
    expect(result.status).toBe("changed");
    expect(mem.items.get(item.id)!.state).not.toBe("approved");
    expect(start).not.toHaveBeenCalled();
  });

  it("a plan that changes between the claim and the run runs nothing", async () => {
    const item = await openItem();
    let reads = 0;
    const svc = service([adapter({ readyPlans: async () => (++reads > 1 ? [plan({ fingerprint: "d".repeat(64) })] : plans) })]);
    const result = await svc.decide({ workspaceId: WS, itemId: item.id, revision: FINGERPRINT, decision: "approve", by: { kind: "owner_link", recipient: OWNER_EMAIL } });
    expect(result.status).toBe("failed");
    expect(mem.items.get(item.id)).toMatchObject({ state: "approved", outcome: "failed" });
    expect(mem.items.get(item.id)!.outcomeReason).toMatch(/^plan_changed/);
    expect(recordLinkRun).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it("if the run can't be logged, nothing runs", async () => {
    const item = await openItem();
    recordLinkRun.mockRejectedValueOnce(new Error("strelva_service_access_denied"));
    const result = await service().decide({ workspaceId: WS, itemId: item.id, revision: FINGERPRINT, decision: "approve", by: { kind: "owner_link", recipient: OWNER_EMAIL } });
    expect(result.status).toBe("failed");
    expect(mem.items.get(item.id)!.outcomeReason).toMatch(/^service_log_failed/);
    expect(start).not.toHaveBeenCalled();
  });

  it("a link for anyone but the owner on record is refused and starts nothing", async () => {
    const item = await openItem();
    mem.state.link.mockRejectedValueOnce(new ServiceSessionRefusedError("owner_decision_recipient_not_owner"));
    const result = await service().decide({ workspaceId: WS, itemId: item.id, revision: FINGERPRINT, decision: "approve", by: { kind: "owner_link", recipient: "someone@example.test" } });
    expect(result.status).toBe("not_owner");
    expect(mem.items.get(item.id)!.state).toBe("open");
    expect(start).not.toHaveBeenCalled();
  });

  it("asks for a sign-in when Strelva doesn't run the business, or the session is the wrong kind", async () => {
    const item = await openItem();
    mem.state.link.mockResolvedValueOnce(null);
    expect((await service().decide({ workspaceId: WS, itemId: item.id, revision: FINGERPRINT, decision: "approve", by: { kind: "owner_link", recipient: OWNER_EMAIL } })).status).toBe("sign_in");
    mem.state.link.mockResolvedValueOnce(session({ purpose: "needs_you_sync" }));
    expect((await service().decide({ workspaceId: WS, itemId: item.id, revision: FINGERPRINT, decision: "approve", by: { kind: "owner_link", recipient: OWNER_EMAIL } })).status).toBe("sign_in");
    mem.state.link.mockResolvedValueOnce(session({ workspaceId: "bbbbbbbb-0000-4000-8000-000000000009" }));
    expect((await service().decide({ workspaceId: WS, itemId: item.id, revision: FINGERPRINT, decision: "approve", by: { kind: "owner_link", recipient: OWNER_EMAIL } })).status).toBe("sign_in");
    expect(mem.items.get(item.id)!.state).toBe("open");
    expect(start).not.toHaveBeenCalled();
  });

  it("access, money and exit still need a sign-in; no session is even asked for", async () => {
    const item = await openItem("money");
    const result = await service().decide({ workspaceId: WS, itemId: item.id, revision: FINGERPRINT, decision: "approve", by: { kind: "owner_link", recipient: OWNER_EMAIL } });
    expect(result.status).toBe("sign_in");
    expect(mem.state.link).not.toHaveBeenCalled();
  });

  it("an owner with an account decides as themselves; no Strelva session", async () => {
    mem.state.ownerMember = true;
    const item = await openItem();
    const result = await service().decide({ workspaceId: WS, itemId: item.id, revision: FINGERPRINT, decision: "approve", by: { kind: "owner_link", recipient: OWNER_EMAIL } });
    expect(result.status).toBe("done");
    expect(mem.state.link).not.toHaveBeenCalled();
    expect(recordLinkRun).not.toHaveBeenCalled();
    expect(calls).toEqual([`start:${OWNER.userId}:website-rebuild:w1:${item.id}`]);
  });

  it("only a lifecycle that opts in is decided without an account", async () => {
    const other: SourceAdapter = { ...adapter({ recordLinkRun: undefined }) };
    expect(other.ownerLinkWithoutAccount).toBe(false);
    const item = await openItem();
    const result = await service([other]).decide({ workspaceId: WS, itemId: item.id, revision: FINGERPRINT, decision: "approve", by: { kind: "owner_link", recipient: OWNER_EMAIL } });
    expect(result.status).toBe("sign_in");
    expect(mem.state.link).not.toHaveBeenCalled();
  });

  it("the adapter refuses a session that isn't a link session for this business", async () => {
    const item = { ...(await openItem()), state: "approved" as const };
    const outcome = await adapter().resolve({ workspaceId: WS }, item, "approve", { kind: "owner_link", recipient: OWNER_EMAIL, actor: STRELVA_ADMIN, service: session({ purpose: "make_real_resume" }) });
    expect(outcome).toMatchObject({ outcome: "failed", reason: expect.stringMatching(/^service_session_invalid/) });
    expect(start).not.toHaveBeenCalled();
  });
});

describe("the make_real_link session client", () => {
  it("starts a bound session, maps the database's refusals, and logs only one kind of step", async () => {
    const { setServiceActorDb, startMakeRealLinkSession, recordServiceAction } = await import("@/platform/needs-you/service-actor");
    const itemId = randomUUID();
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "strelva_make_real_link_session") {
        if (args.p_recipient === "someone@example.test") return { data: null, error: { message: "owner_decision_recipient_not_owner" } };
        if (args.p_recipient === "down@example.test") return { data: null, error: { message: "connection reset" } };
        return { data: { sessionId: randomUUID(), workspaceId: WS, purpose: "make_real_link", label: "Strelva (system)", role: "admin", userId: STRELVA_ADMIN.userId, verifiedEmail: STRELVA_ADMIN.verifiedEmail, decisionId: itemId }, error: null };
      }
      return { data: randomUUID(), error: null };
    });
    setServiceActorDb({ rpc });
    try {
      const started = await startMakeRealLinkSession(WS, itemId, OWNER_EMAIL);
      expect(started).toMatchObject({ purpose: "make_real_link", workspaceId: WS, actor: STRELVA_ADMIN, onBehalf: { role: "admin" } });
      expect(rpc).toHaveBeenCalledWith("strelva_make_real_link_session", { p_workspace_id: WS, p_decision_id: itemId, p_recipient: OWNER_EMAIL });
      await expect(startMakeRealLinkSession(WS, itemId, "someone@example.test")).rejects.toMatchObject({ code: "owner_decision_recipient_not_owner" });
      await expect(startMakeRealLinkSession(WS, itemId, "down@example.test")).rejects.not.toBeInstanceOf(ServiceSessionRefusedError);
      await expect(startMakeRealLinkSession(WS, "not-a-uuid", OWNER_EMAIL)).rejects.toThrow();
      // A link session logs one run and nothing else; a resume session keeps every step.
      await recordServiceAction(started!, "run", "possibility:website-rebuild:w1@2");
      await expect(recordServiceAction(started!, "rollback", "activation:a1")).rejects.toThrow("can't run Make real");
      await expect(recordServiceAction(session({ purpose: "needs_you_sync" }), "run", "x")).rejects.toThrow("can't run Make real");
      await recordServiceAction(session({ purpose: "make_real_resume" }), "rollback", "activation:a1");
    } finally {
      setServiceActorDb(null);
    }
  });
});

describe("the make_real_owner_link release flag (20261009140000)", () => {
  const ITEM = "bbbbbbbb-0000-4000-8000-0000000000d1";
  async function harness(rowState: "on" | "off" | null) {
    const { setReleaseFlagsDb } = await import("@/platform/release-flags/store");
    const { setServiceActorDb } = await import("@/platform/needs-you/service-actor");
    const { PostgresNeedsYouStore } = await import("@/platform/needs-you/repository");
    const flags = rowState ? { make_real_owner_link: { state: rowState, revision: 1, changedAt: "2026-10-06T00:00:00Z" } } : {};
    setReleaseFlagsDb({ rpc: vi.fn(async () => ({ data: { workspaceId: WS, flags, testers: [], testerEmails: [] }, error: null })) });
    const rpc = vi.fn(async () => ({
      data: { sessionId: randomUUID(), workspaceId: WS, purpose: "make_real_link", label: "Strelva (system)", role: "admin", userId: STRELVA_ADMIN.userId, verifiedEmail: STRELVA_ADMIN.verifiedEmail, decisionId: ITEM },
      error: null,
    }));
    setServiceActorDb({ rpc });
    return { rpc, linkSession: PostgresNeedsYouStore.linkSession!, reset: () => { setReleaseFlagsDb(null); setServiceActorDb(null); } };
  }

  it("is off by default: Needs you and Systems on are not enough, and no session is asked for", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_NEEDS_YOU_RELEASE", "1");
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "1");
    vi.stubEnv("STRELVA_MAKE_REAL_OWNER_LINK_RELEASE", "");
    const h = await harness("on");
    try {
      expect(await h.linkSession(WS, ITEM, OWNER_EMAIL)).toBeNull();
      expect(h.rpc).not.toHaveBeenCalled();
    } finally { h.reset(); vi.unstubAllEnvs(); }
  });

  it("under `workspace`, only a business whose row says on starts a session", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_MAKE_REAL_OWNER_LINK_RELEASE", "workspace");
    for (const [row, expected] of [["on", true], ["off", false], [null, false]] as const) {
      const h = await harness(row);
      try {
        const started = await h.linkSession(WS, ITEM, OWNER_EMAIL);
        expect(started !== null).toBe(expected);
        expect(h.rpc).toHaveBeenCalledTimes(expected ? 1 : 0);
      } finally { h.reset(); }
    }
    vi.unstubAllEnvs();
  });

  it("`1` turns it on except where a business's row says off; the workspace kill switch wins", async () => {
    vi.stubEnv("STRELVA_MAKE_REAL_OWNER_LINK_RELEASE", "1");
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    let h = await harness(null);
    try { expect(await h.linkSession(WS, ITEM, OWNER_EMAIL)).not.toBeNull(); } finally { h.reset(); }
    h = await harness("off");
    try { expect(await h.linkSession(WS, ITEM, OWNER_EMAIL)).toBeNull(); } finally { h.reset(); }
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "");
    h = await harness("on");
    try {
      expect(await h.linkSession(WS, ITEM, OWNER_EMAIL)).toBeNull();
      expect(h.rpc).not.toHaveBeenCalled();
    } finally { h.reset(); vi.unstubAllEnvs(); }
  });
});
