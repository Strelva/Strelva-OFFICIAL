import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENT_HOLD_RATIO_POLICY, agentHoldRatioAlertsEnabled, agentHoldRatioIsLow } from "@/platform/bookings/agent-proof";
import { BOOKING_STORE_TIMEOUT_MS, readAgentHoldRatioCohorts, setBookingStoreDb, type AgentHoldRatioCohort } from "@/platform/bookings/store";
import { readAgentHoldRatioAlerts } from "@/platform/operator-queue/agent-booking-ratio";
import { QUEUE_KINDS, type QueueContext, type QueueMark } from "@/platform/operator-queue/contracts";
import { projectQueue, type SourceRead } from "@/platform/operator-queue/project";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const iso = (time: number) => new Date(time).toISOString();
const BUSINESS = "03100000-0000-4000-8000-000000000010";
const actor = { userId: "03100000-0000-4000-8000-000000000001", verifiedEmail: "operator@example.test" };
function cohort(overrides: Partial<AgentHoldRatioCohort> = {}): AgentHoldRatioCohort {
  return { businessId: BUSINESS, workspaceId: BUSINESS, tenantId: "fixture", matureHolds: 20, customerConfirmed: 3,
    unconfirmed: 17, firstMaturedAt: iso(NOW - 3600_000), latestUnconfirmedMaturedAt: iso(NOW - 1000), ...overrides };
}
function mark(overrides: Partial<QueueMark> = {}): QueueMark {
  return { source: "ops_alert", sourceRef: `agent-hold-ratio:workspace:${BUSINESS}`, assigneeUserId: actor.userId,
    assigneeEmail: actor.verifiedEmail, pinnedUntil: null, snoozedUntil: null, snoozeReason: null,
    closedState: null, closedReason: null, closedReceiptId: null, closedAt: null, ownerToldVia: null, ownerToldAt: null,
    revision: 1, updatedBy: actor.userId, updatedAt: iso(NOW - 500), notes: [], ...overrides };
}
const context = (marks: QueueMark[] = []): QueueContext => ({ marks, links: [], businesses: [], delegations: [], documentHealth: [], operators: [], readbackFailures: [] });
const project = (read: SourceRead, marks: QueueMark[] = []) => projectQueue({ now: NOW, context: context(marks), tenants: [], emailPaused: true,
  reads: [...QUEUE_KINDS.map(kind => ({ kind, source: kind, ok: true as const, rows: [] })), read] });
afterEach(() => { setBookingStoreDb(undefined); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("provisional aggregate agent hold ratio policy", () => {
  it("is off by default and does not depend on enabling booking writes", () => {
    expect(agentHoldRatioAlertsEnabled({})).toBe(false);
    expect(agentHoldRatioAlertsEnabled({ STRELVA_BOOKING_AGENT_RATIO_ALERTS: "0" })).toBe(false);
    expect(agentHoldRatioAlertsEnabled({ STRELVA_BOOKING_AGENT_RATIO_ALERTS: "1" })).toBe(true);
    expect(AGENT_HOLD_RATIO_POLICY).toEqual({ windowHours: 24, minimumMaturityMinutes: 15, minimumSample: 20, minimumConfirmationPercent: 20 });
  });
  it.each([[19, 0, false], [20, 0, true], [20, 3, true], [20, 4, false], [20, 5, false], [100, 19, true], [100, 20, false], [100, 100, false]])(
    "minimum sample and strict percent boundary: %i / %i", (matureHolds, customerConfirmed, alarm) => {
      expect(agentHoldRatioIsLow({ matureHolds, customerConfirmed })).toBe(alarm);
    });
});

describe("bounded aggregate reader", () => {
  it("passes verified operator identity, accepts only aggregate schema and has no booking writer", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [cohort()], error: null }); setBookingStoreDb({ rpc });
    expect(await readAgentHoldRatioCohorts(actor, NOW)).toEqual([cohort()]);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_agent_hold_ratio", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_now: iso(NOW) });
  });
  it.each([null, {}, [cohort({ matureHolds: -1 })], [cohort({ customerConfirmed: 21 })], [cohort({ latestUnconfirmedMaturedAt: null })],
    [{ ...cohort(), email: "private@example.test" }], [cohort(), cohort()], [cohort({ latestUnconfirmedMaturedAt: iso(NOW + 1) })],
    [cohort({ firstMaturedAt: iso(NOW + 1) })], Array.from({ length: 1001 }, () => cohort())])("refuses malformed, private, duplicate or truncated data", async (data) => {
    setBookingStoreDb({ rpc: vi.fn().mockResolvedValue({ data, error: null }) });
    await expect(readAgentHoldRatioCohorts(actor, NOW)).rejects.toThrow();
  });
  it("returns no cohorts only on a successful empty read", async () => {
    setBookingStoreDb({ rpc: vi.fn().mockResolvedValue({ data: [], error: null }) });
    expect(await readAgentHoldRatioCohorts(actor, NOW)).toEqual([]);
    setBookingStoreDb(null); await expect(readAgentHoldRatioCohorts(actor, NOW)).rejects.toThrow();
    setBookingStoreDb({ rpc: vi.fn().mockResolvedValue({ data: [], error: { message: "no" } }) });
    await expect(readAgentHoldRatioCohorts(actor, NOW)).rejects.toThrow();
  });
  it("times out a stalled reader even when its client cannot abort", async () => {
    vi.useFakeTimers(); setBookingStoreDb({ rpc: () => new Promise(() => {}) });
    const pending = expect(readAgentHoldRatioCohorts(actor, NOW)).rejects.toThrow("booking_store_timeout");
    await vi.advanceTimersByTimeAsync(BOOKING_STORE_TIMEOUT_MS); await pending;
  });
});

describe("operator ratio observation lifecycle", () => {
  it("refreshes one stable business key, preserving take and notes without exposing customer/agent details", async () => {
    const read = vi.fn().mockResolvedValue([cohort()]);
    const one = await readAgentHoldRatioAlerts(actor, null, NOW, read);
    const two = await readAgentHoldRatioAlerts(actor, null, NOW + 1000, read);
    expect(one).toEqual(two); expect(read).toHaveBeenCalledWith(actor, NOW);
    const result = project(one, [mark()]);
    expect(result.items).toHaveLength(1); expect(result.items[0]).toMatchObject({ state: "taken", priority: "P2", key: `ops_alert:agent-hold-ratio:workspace:${BUSINESS}` });
    expect(JSON.stringify(one)).not.toMatch(/customerEmail|statusHash|agentName|ciphertext|private@/);
    expect(result.items[0]?.title).toContain("3 of 20 mature requests customer-confirmed");
  });
  it("isolates businesses, ignores healthy and low-sample cohorts", async () => {
    const read = vi.fn().mockResolvedValue([cohort(), cohort({ businessId: "03100000-0000-4000-8000-000000000011", workspaceId: null, tenantId: "other" }),
      cohort({ matureHolds: 19 }), cohort({ customerConfirmed: 4, unconfirmed: 16 })]);
    const result = project(await readAgentHoldRatioAlerts(actor, null, NOW, read));
    expect(result.items).toHaveLength(2); expect(new Set(result.items.map(row => row.key)).size).toBe(2);
    expect(result.items.map(row => row.business.kind)).toEqual(expect.arrayContaining(["workspace", "tenant"]));
  });
  it("closure holds through rescans; only newly matured failures reopen that business", async () => {
    const closed = mark({ closedState: "dismissed", closedAt: iso(NOW), closedReason: "Reviewed", notes: [{ id: "note", by: "operator", at: iso(NOW), body: "Watch next cohort" }] });
    const old = await readAgentHoldRatioAlerts(actor, null, NOW, async () => [cohort()]);
    expect(project(old, [closed]).items).toHaveLength(0); expect(project(old, [closed]).parked[0]?.state).toBe("dismissed");
    const next = await readAgentHoldRatioAlerts(actor, null, NOW + 2000, async () => [cohort({ latestUnconfirmedMaturedAt: iso(NOW + 1000) })]);
    expect(project(next, [closed]).items[0]).toMatchObject({ state: "taken", closed: null, notes: closed.notes });
  });
  it("recovery or an aged-out cohort closes only previously marked ratio observations", async () => {
    const recovered = await readAgentHoldRatioAlerts(actor, context([mark(), mark({ sourceRef: "unrelated" })]), NOW, async () => []);
    expect(project(recovered, [mark()]).parked).toHaveLength(1);
    expect(project(recovered, [mark()]).parked[0]?.closedElsewhere?.by).toBe("the current aggregate check");
    expect(project(await readAgentHoldRatioAlerts(actor, null, NOW, async () => [] )).items).toEqual([]);
    expect(project(await readAgentHoldRatioAlerts(actor, context([mark()]), NOW, async () => [cohort({ customerConfirmed: 4, unconfirmed: 16 })]), [mark()]).parked).toHaveLength(1);
  });
  it("an outage reports unavailable and never claims recovery or leaks an error payload", async () => {
    const result = await readAgentHoldRatioAlerts(actor, context([mark()]), NOW, async () => { throw new Error("private@example.test status-token"); });
    expect(result).toEqual({ kind: "ops_alert", source: "Agent hold confirmations", ok: false, reason: "Agent hold confirmation evidence unavailable" });
    expect(project(result).complete).toBe(false); expect(project(result).parked).toEqual([]);
  });
});
