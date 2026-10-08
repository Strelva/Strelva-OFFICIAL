import { afterEach, describe, expect, it, vi } from "vitest";
import { readAgentHoldRatioCohorts, setBookingStoreDb, type AgentHoldRatioCohort } from "@/platform/bookings/store";
import { readAgentHoldRatioAlerts } from "@/platform/operator-queue/agent-booking-ratio";
import { QUEUE_KINDS, type QueueContext, type QueueMark } from "@/platform/operator-queue/contracts";
import { projectQueue, type SourceRead } from "@/platform/operator-queue/project";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const iso = (time: number) => new Date(time).toISOString();
const BUSINESS = "03100000-0000-4000-8000-000000000050";
const actor = { userId: "03100000-0000-4000-8000-000000000001", verifiedEmail: "operator@example.test" };
const tenant = { id: "ratio-renamed-tenant", stableId: BUSINESS, siteName: "Fictional tenant" };

function cohort(overrides: Partial<AgentHoldRatioCohort> = {}): AgentHoldRatioCohort {
  return { businessId: BUSINESS, workspaceId: null, tenantId: tenant.id, matureHolds: 20,
    customerConfirmed: 3, unconfirmed: 17, firstMaturedAt: iso(NOW - 3600_000),
    latestUnconfirmedMaturedAt: iso(NOW - 1000), ...overrides };
}

function mark(overrides: Partial<QueueMark> = {}): QueueMark {
  return { source: "ops_alert", sourceRef: `agent-hold-ratio:tenant:${BUSINESS}`,
    assigneeUserId: actor.userId, assigneeEmail: actor.verifiedEmail, pinnedUntil: null,
    snoozedUntil: null, snoozeReason: null, closedState: null, closedReason: null,
    closedReceiptId: null, closedAt: null, ownerToldVia: null, ownerToldAt: null,
    revision: 1, updatedBy: actor.userId, updatedAt: iso(NOW - 500), notes: [], ...overrides };
}

const context = (marks: QueueMark[]): QueueContext => ({ marks, links: [], businesses: [],
  delegations: [], documentHealth: [], operators: [], readbackFailures: [] });
const project = (read: SourceRead, marks: QueueMark[], now = NOW) => projectQueue({ now, context: context(marks),
  tenants: [tenant], emailPaused: true,
  reads: [...QUEUE_KINDS.map(kind => ({ kind, source: kind, ok: true as const, rows: [] })), read] });

afterEach(() => { setBookingStoreDb(undefined); vi.restoreAllMocks(); });

describe("agent ratio tenant recovery regression", () => {
  it("keeps a recovered tenant cohort attached to its business", async () => {
    const saved = mark();
    const read = await readAgentHoldRatioAlerts(actor, context([saved]), NOW,
      async () => [cohort({ customerConfirmed: 4, unconfirmed: 16 })]);
    const queue = project(read, [saved]);
    expect(queue.items).toEqual([]);
    expect(queue.parked).toHaveLength(1);
    expect(queue.parked[0]?.business).toEqual({ kind: "tenant", tenantId: tenant.id, name: tenant.siteName });
    expect(queue.parked[0]?.sourceRef).toBe(saved.sourceRef);
  });

  it("resolves an aged-out tenant by stable ID after a slug rename", async () => {
    const saved = mark();
    const read = await readAgentHoldRatioAlerts(actor, context([saved]), NOW, async () => [], [tenant]);
    const queue = project(read, [saved]);
    expect(queue.parked).toHaveLength(1);
    expect(queue.parked[0]?.business).toEqual({ kind: "tenant", tenantId: tenant.id, name: tenant.siteName });
    expect(queue.parked[0]?.sourceRef).toBe(saved.sourceRef);
  });

  it("never assigns an unresolved aged-out tenant to Strelva", async () => {
    const saved = mark();
    const read = await readAgentHoldRatioAlerts(actor, context([saved]), NOW, async () => []);
    expect(project(read, [saved]).parked.some(row => row.business.kind === "strelva")).toBe(false);
  });

  it("describes conversion as a scope change when the linked business is still unhealthy", async () => {
    const workspaceId = "03100000-0000-4000-8000-000000000051";
    const saved = mark({ closedAt: iso(NOW - 500), closedState: "dismissed", closedReason: "Reviewed tenant evidence" });
    const linked = context([saved]);
    linked.links.push({ tenantId: tenant.id, tenantStableId: BUSINESS, workspaceId,
      workspaceName: "Fictional linked business", systemId: null });
    const read = await readAgentHoldRatioAlerts(actor, linked, NOW,
      async () => [cohort({ businessId: workspaceId, workspaceId })], [tenant]);
    const queue = projectQueue({ now: NOW, context: linked, tenants: [tenant], emailPaused: true,
      reads: [...QUEUE_KINDS.map(kind => ({ kind, source: kind, ok: true as const, rows: [] })), read] });
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.sourceRef).toBe(`agent-hold-ratio:workspace:${workspaceId}`);
    expect(queue.items[0]?.closed).toBeNull();
    expect(queue.parked).toHaveLength(1);
    expect(queue.parked[0]?.sourceRef).toBe(saved.sourceRef);
    expect(queue.parked[0]?.title).not.toContain("no longer meet");
    expect(queue.parked[0]?.closedElsewhere?.by).toContain("business-scoped");
    expect(queue.parked[0]?.business).toMatchObject({ kind: "workspace", workspaceId });
  });
});

describe("agent ratio repeated acknowledgment boundaries", () => {
  it.each([NOW - 1, NOW])("does not reopen evidence at or before acknowledgment (%i)", async (evidenceAt) => {
    const saved = mark({ closedAt: iso(NOW), closedState: "dismissed", closedReason: "Reviewed" });
    const read = await readAgentHoldRatioAlerts(actor, context([saved]), NOW,
      async () => [cohort({ latestUnconfirmedMaturedAt: iso(evidenceAt) })]);
    expect(project(read, [saved]).items).toEqual([]);
    expect(project(read, [saved]).parked[0]?.closed?.at).toBe(iso(NOW));
  });

  it("can acknowledge a reopened alert again without losing its notes or assignment", async () => {
    const saved = mark({ closedAt: iso(NOW), closedState: "done", closedReason: "Reviewed",
      notes: [{ id: "review-note", body: "Watch next batch", by: actor.userId, at: iso(NOW) }] });
    const read = await readAgentHoldRatioAlerts(actor, context([saved]), NOW + 2000,
      async () => [cohort({ latestUnconfirmedMaturedAt: iso(NOW + 1000) })]);
    const reopened = project(read, [saved], NOW + 2000);
    expect(reopened.items[0]).toMatchObject({ closed: null, state: "taken", notes: saved.notes });
    const reacknowledged = { ...saved, closedAt: iso(NOW + 2000) };
    const closed = project(read, [reacknowledged], NOW + 3000);
    expect(closed.items).toEqual([]);
    expect(closed.parked[0]).toMatchObject({ notes: saved.notes, closed: { at: iso(NOW + 2000) } });
    expect(saved.closedAt).toBe(iso(NOW));
  });

  it("does not let ratio-specific reopening change unrelated operations alerts", () => {
    const saved = mark({ sourceRef: "ordinary-alert", closedAt: iso(NOW - 1000), closedState: "done", closedReason: "Resolved" });
    const read: SourceRead = { kind: "ops_alert", source: "Other operations", ok: true, rows: [{
      kind: "ops_alert", sourceRef: saved.sourceRef, tenantId: tenant.id, workspaceId: null,
      title: "Ordinary operations alert", openedAt: iso(NOW - 3600_000), href: "/admin",
      facts: { severity: "high", newEvidenceAt: iso(NOW) },
    }] };
    expect(project(read, [saved]).items).toEqual([]);
    expect(project(read, [saved]).parked[0]).toMatchObject({ priority: "P1", state: "done" });
  });
});

describe("agent ratio malformed aggregate privacy", () => {
  it.each([
    cohort({ businessId: BUSINESS, workspaceId: "03100000-0000-4000-8000-000000000051" }),
    cohort({ customerConfirmed: 3.5, unconfirmed: 16.5 }),
    cohort({ firstMaturedAt: iso(NOW - 500), latestUnconfirmedMaturedAt: iso(NOW - 1000) }),
    cohort({ unconfirmed: 0, customerConfirmed: 20 }),
    { ...cohort(), customer: { email: "private@example.test" } },
  ])("makes malformed evidence unavailable without manufacturing recovery", async (data) => {
    setBookingStoreDb({ rpc: vi.fn().mockResolvedValue({ data: [data], error: null }) });
    const read = await readAgentHoldRatioAlerts(actor, context([mark()]), NOW);
    expect(read).toEqual({ kind: "ops_alert", source: "Agent hold confirmations", ok: false,
      reason: "Agent hold confirmation evidence unavailable" });
    const queue = project(read, [mark()]);
    expect(queue.complete).toBe(false);
    expect(queue.parked).toEqual([]);
    expect(JSON.stringify(queue)).not.toContain("private@example.test");
  });

  it("rejects non-finite scan clocks before any RPC", async () => {
    const rpc = vi.fn();
    setBookingStoreDb({ rpc });
    for (const now of [NaN, Infinity, -Infinity]) {
      await expect(readAgentHoldRatioCohorts(actor, now)).rejects.toThrow();
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});
