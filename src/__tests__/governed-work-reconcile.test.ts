import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedEvent } from "@/lib/types";

// ── Mock the Redis event source ───────────────────────────────────────────────
// reconcile.ts calls getEventsRaw (not getEvents) to read the Redis-authoritative
// event list. We verify the right function is called and control its output.
const mockGetEventsRaw = vi.fn();
const mockGetEvents = vi.fn();

vi.mock("@/lib/events", () => ({
  getEventsRaw: (...a: unknown[]) => mockGetEventsRaw(...a),
  getEvents: (...a: unknown[]) => mockGetEvents(...a),
}));

// ── Mock DB tenant listing ────────────────────────────────────────────────────
const mockListAllTenants = vi.fn();
vi.mock("@/lib/db/repositories", () => ({
  listAllTenants: (...a: unknown[]) => mockListAllTenants(...a),
}));

// ── Mock governed-work repository ────────────────────────────────────────────
const mockGetProposal = vi.fn();
const mockInsertProposal = vi.fn();
const mockUpdateProposalState = vi.fn();

vi.mock("@/lib/governed-work/repository", () => ({
  getProposal: (...a: unknown[]) => mockGetProposal(...a),
  insertProposal: (...a: unknown[]) => mockInsertProposal(...a),
  updateProposalState: (...a: unknown[]) => mockUpdateProposalState(...a),
  // shadow.ts imports these too; provide no-ops so the module loads cleanly.
  recordDecision: vi.fn(),
  startExecutionAttempt: vi.fn(),
  finishExecutionAttempt: vi.fn(),
  recordOutcome: vi.fn(),
  listGovernedEventsForTenant: vi.fn(),
  getGovernedEventById: vi.fn(),
}));

import { reconcileGovernedWork } from "@/lib/governed-work/reconcile";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<UnifiedEvent> = {}): UnifiedEvent {
  return {
    id: "evt_test",
    tenantId: "gldf",
    source: "ai",
    type: "content_update",
    title: "Update hero",
    body: "new copy",
    status: "pending",
    metadata: { kind: "agent_preview", section: "hero" },
    createdAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  } as UnifiedEvent;
}

afterEach(() => {
  vi.clearAllMocks();
});

// ── Test 4 (most structural): reconcile reads via getEventsRaw, not getEvents ─

describe("reconcile reads via getEventsRaw (not getEvents)", () => {
  beforeEach(() => {
    mockListAllTenants.mockResolvedValue([{ id: "gldf" }]);
    mockGetEventsRaw.mockResolvedValue([]);
    mockGetEvents.mockResolvedValue([]);
  });

  it("calls getEventsRaw and never calls getEvents", async () => {
    await reconcileGovernedWork({ tenants: ["gldf"] });
    expect(mockGetEventsRaw).toHaveBeenCalledWith("gldf", expect.anything());
    expect(mockGetEvents).not.toHaveBeenCalled();
  });

  it("skips non-governed events silently", async () => {
    // A booking observation is not governed work — no proposal write attempted.
    const booking = makeEvent({ type: "booking", metadata: undefined });
    mockGetEventsRaw.mockResolvedValue([booking]);
    mockGetProposal.mockResolvedValue(null);
    await reconcileGovernedWork({ tenants: ["gldf"] });
    expect(mockInsertProposal).not.toHaveBeenCalled();
    expect(mockUpdateProposalState).not.toHaveBeenCalled();
  });
});

// ── Test 1: Redis event with no PG row → insertProposal ──────────────────────

describe("missing Postgres row is inserted (drift recovery)", () => {
  it("inserts a proposal when Redis has a pending governed event but PG has no row", async () => {
    const event = makeEvent({ id: "evt_new", status: "pending" });
    mockListAllTenants.mockResolvedValue([{ id: "gldf" }]);
    mockGetEventsRaw.mockResolvedValue([event]);
    mockGetProposal.mockResolvedValue(null); // no existing PG row
    mockInsertProposal.mockResolvedValue({ id: "evt_new" });

    const result = await reconcileGovernedWork({ tenants: ["gldf"] });

    expect(mockInsertProposal).toHaveBeenCalledOnce();
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("reports correct tenant + governed counts in the result", async () => {
    const events = [
      makeEvent({ id: "evt_a", type: "content_update" }),
      makeEvent({ id: "evt_b", type: "newsletter_draft" }),
    ];
    mockListAllTenants.mockResolvedValue([{ id: "gldf" }]);
    mockGetEventsRaw.mockResolvedValue(events);
    mockGetProposal.mockResolvedValue(null);
    mockInsertProposal.mockResolvedValue({ id: "x" });

    const result = await reconcileGovernedWork({ tenants: ["gldf"] });

    expect(result.tenants).toBe(1);
    expect(result.governed).toBe(2);
    expect(result.inserted).toBe(2);
  });

  it("inserts for each of multiple tenants independently", async () => {
    mockListAllTenants.mockResolvedValue([{ id: "gldf" }, { id: "rohlax" }]);
    mockGetEventsRaw.mockResolvedValue([makeEvent()]);
    mockGetProposal.mockResolvedValue(null);
    mockInsertProposal.mockResolvedValue({ id: "x" });

    const result = await reconcileGovernedWork({ tenants: ["gldf", "rohlax"] });

    expect(result.tenants).toBe(2);
    expect(result.inserted).toBe(2); // one per tenant
  });
});

// ── Test 2: stale-pending PG row → updateProposalState ───────────────────────

describe("stale-pending PG row is re-synced when Redis event is resolved", () => {
  it("calls updateProposalState when PG row is pending but Redis event is approved", async () => {
    const resolvedEvent = makeEvent({ id: "evt_resolved", status: "approved" });
    const staleRow = {
      id: "evt_resolved",
      tenantId: "gldf",
      source: "ai",
      kind: "agent_preview",
      entityType: "content_update",
      title: "Update hero",
      body: "new copy",
      payload: {},
      status: "pending", // stale — PG missed the decision shadow
      createdAt: "2026-07-30T00:00:00.000Z",
    };

    mockListAllTenants.mockResolvedValue([{ id: "gldf" }]);
    mockGetEventsRaw.mockResolvedValue([resolvedEvent]);
    mockGetProposal.mockResolvedValue(staleRow);
    mockUpdateProposalState.mockResolvedValue({ ...staleRow, status: "approved" });

    const result = await reconcileGovernedWork({ tenants: ["gldf"] });

    expect(mockUpdateProposalState).toHaveBeenCalledWith(
      "evt_resolved",
      expect.objectContaining({ status: "approved" }),
    );
    expect(result.updated).toBe(1);
    expect(result.inserted).toBe(0);
  });

  it("records current (no update) when PG row status already matches Redis event", async () => {
    const event = makeEvent({ id: "evt_ok", status: "pending" });
    const currentRow = {
      id: "evt_ok",
      status: "pending",
      entityType: "content_update",
      tenantId: "gldf",
      source: "ai",
      kind: null,
      title: "Update hero",
      body: "new copy",
      payload: null,
      createdAt: "2026-07-30T00:00:00.000Z",
    };

    mockListAllTenants.mockResolvedValue([{ id: "gldf" }]);
    mockGetEventsRaw.mockResolvedValue([event]);
    mockGetProposal.mockResolvedValue(currentRow);

    const result = await reconcileGovernedWork({ tenants: ["gldf"] });

    expect(mockUpdateProposalState).not.toHaveBeenCalled();
    expect(mockInsertProposal).not.toHaveBeenCalled();
    expect(result.current).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.inserted).toBe(0);
  });
});

// ── Test 3: inserted count drives Slack alert (cron-level contract) ───────────

describe("reconcile result inserted count is the drift signal for Slack alerting", () => {
  it("returns inserted > 0 when PG rows were missing (the cron reads this to fire Slack)", async () => {
    mockListAllTenants.mockResolvedValue([{ id: "gldf" }]);
    mockGetEventsRaw.mockResolvedValue([
      makeEvent({ id: "evt_1" }),
      makeEvent({ id: "evt_2", type: "newsletter_draft" }),
    ]);
    mockGetProposal.mockResolvedValue(null);
    mockInsertProposal.mockResolvedValue({ id: "x" });

    const result = await reconcileGovernedWork({ tenants: ["gldf"] });

    // The cron route fires Slack when result.inserted > 0. Verify the contract.
    expect(result.inserted).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  it("returns inserted=0 and errors=[] when everything is already in sync", async () => {
    const event = makeEvent({ id: "evt_synced", status: "pending" });
    const row = {
      id: "evt_synced",
      status: "pending",
      entityType: "content_update",
      tenantId: "gldf",
      source: "ai",
      kind: null,
      title: "",
      body: "",
      payload: null,
      createdAt: "2026-07-30T00:00:00.000Z",
    };

    mockListAllTenants.mockResolvedValue([{ id: "gldf" }]);
    mockGetEventsRaw.mockResolvedValue([event]);
    mockGetProposal.mockResolvedValue(row);

    const result = await reconcileGovernedWork({ tenants: ["gldf"] });

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("records errors when getEventsRaw throws, and continues to remaining tenants", async () => {
    mockListAllTenants.mockResolvedValue([{ id: "bad" }, { id: "gldf" }]);
    mockGetEventsRaw
      .mockRejectedValueOnce(new Error("Redis timeout"))
      .mockResolvedValueOnce([makeEvent()]);
    mockGetProposal.mockResolvedValue(null);
    mockInsertProposal.mockResolvedValue({ id: "x" });

    const result = await reconcileGovernedWork({ tenants: ["bad", "gldf"] });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("bad");
    // gldf still processed despite bad tenant error
    expect(result.inserted).toBe(1);
  });
});

// ── Opts forwarding ───────────────────────────────────────────────────────────

describe("opts.tenants allows targeting specific tenants without listing all", () => {
  it("does not call listAllTenants when tenants is explicitly provided", async () => {
    mockListAllTenants.mockResolvedValue([]);
    mockGetEventsRaw.mockResolvedValue([]);

    await reconcileGovernedWork({ tenants: ["gldf"] });

    expect(mockListAllTenants).not.toHaveBeenCalled();
    expect(mockGetEventsRaw).toHaveBeenCalledWith("gldf", expect.anything());
  });

  it("calls listAllTenants when tenants is not provided", async () => {
    mockListAllTenants.mockResolvedValue([{ id: "gldf" }]);
    mockGetEventsRaw.mockResolvedValue([]);

    await reconcileGovernedWork();

    expect(mockListAllTenants).toHaveBeenCalledOnce();
  });
});
