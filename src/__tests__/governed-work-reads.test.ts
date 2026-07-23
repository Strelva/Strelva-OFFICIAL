import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedEvent } from "@/lib/types";
import type { Decision, ExecutionAttempt, Outcome, Proposal } from "@/lib/governed-work/types";

// Mock Redis so getEvents/getEvent read our fixtures (getRedis is imported as
// "./redis" from events.ts).
const mockRedis = {
  zrange: vi.fn(),
  mget: vi.fn(),
  get: vi.fn(),
};
let redisClient: typeof mockRedis | null = mockRedis;
vi.mock("../lib/redis", () => ({ getRedis: () => redisClient }));

// Stub the governed-work repository so we can assert whether the Postgres READ
// path is touched (and, when it is, substitute a reconstructed event). Provide
// the write exports too — shadow.ts (pulled in transitively by events.ts) imports
// them.
const mockListGovernedEventsForTenant = vi.fn();
const mockGetGovernedEventById = vi.fn();
vi.mock("@/lib/governed-work/repository", () => ({
  listGovernedEventsForTenant: (...a: unknown[]) => mockListGovernedEventsForTenant(...a),
  getGovernedEventById: (...a: unknown[]) => mockGetGovernedEventById(...a),
  insertProposal: vi.fn(),
  recordDecision: vi.fn(),
  startExecutionAttempt: vi.fn(),
  finishExecutionAttempt: vi.fn(),
  recordOutcome: vi.fn(),
  getProposal: vi.fn(),
}));

import { getEvent, getEvents } from "@/lib/events";
import { eventToProposal } from "@/lib/governed-work/shadow";
import { proposalToEvent, isGovernedScopeEvent } from "@/lib/governed-work/read";

function evt(p: Partial<UnifiedEvent>): UnifiedEvent {
  return {
    id: p.id ?? "evt_1",
    tenantId: p.tenantId ?? "gldf",
    source: p.source ?? "ai",
    type: p.type ?? "content_update",
    title: p.title ?? "Update the hero",
    body: p.body ?? "hero: new copy",
    status: p.status ?? "pending",
    metadata: p.metadata,
    createdAt: p.createdAt ?? "2026-07-14T00:00:00.000Z",
    ...(p.resolvedAt ? { resolvedAt: p.resolvedAt } : {}),
  } as UnifiedEvent;
}

/** Build the domain Proposal that a stored `proposals` row would map to for an
 *  event, so a round-trip mirrors what the repository reconstructs. */
function proposalFor(e: UnifiedEvent): Proposal {
  const p = eventToProposal(e);
  if (!p) throw new Error("not governed work");
  return {
    id: p.id,
    tenantId: p.tenantId,
    source: p.source,
    kind: p.kind ?? null,
    entityType: p.entityType,
    title: p.title ?? null,
    body: p.body ?? null,
    payload: p.payload ?? null,
    status: p.status ?? "pending",
    createdAt: e.createdAt,
  };
}

const original = process.env.GOVERNED_WORK_READ_PG;
afterEach(() => {
  vi.clearAllMocks();
  redisClient = mockRedis;
  if (original === undefined) delete process.env.GOVERNED_WORK_READ_PG;
  else process.env.GOVERNED_WORK_READ_PG = original;
});

describe("flag OFF — getEvents/getEvent never touch the Postgres read path", () => {
  beforeEach(() => {
    delete process.env.GOVERNED_WORK_READ_PG;
  });

  it("getEvents returns the Redis events unchanged and makes no PG call", async () => {
    const gov = evt({ id: "evt_gov", type: "content_update", metadata: { kind: "agent_preview" } });
    const obs = evt({ id: "evt_obs", type: "booking", metadata: undefined });
    mockRedis.zrange.mockResolvedValue(["evt_gov", "evt_obs"]);
    mockRedis.mget.mockResolvedValue([gov, obs]);

    const result = await getEvents("gldf");

    expect(result).toEqual([gov, obs]);
    expect(mockListGovernedEventsForTenant).not.toHaveBeenCalled();
    expect(mockGetGovernedEventById).not.toHaveBeenCalled();
  });

  it("getEvent returns the Redis event unchanged and makes no PG call", async () => {
    const gov = evt({ id: "evt_gov", type: "content_update", metadata: { kind: "agent_preview" } });
    mockRedis.get.mockResolvedValue(gov);

    const result = await getEvent("evt_gov");

    expect(result).toEqual(gov);
    expect(mockGetGovernedEventById).not.toHaveBeenCalled();
  });
});

describe("flag ON — governed events are served from Postgres, observations stay on Redis", () => {
  beforeEach(() => {
    process.env.GOVERNED_WORK_READ_PG = "1";
  });

  it("getEvents substitutes the PG twin for the governed event only", async () => {
    const gov = evt({ id: "evt_gov", type: "content_update", metadata: { kind: "agent_preview" } });
    const obs = evt({ id: "evt_obs", type: "booking", metadata: undefined });
    mockRedis.zrange.mockResolvedValue(["evt_gov", "evt_obs"]);
    mockRedis.mget.mockResolvedValue([gov, obs]);

    const pgGov = evt({ id: "evt_gov", type: "content_update", metadata: { kind: "agent_preview", fromPg: true } });
    mockListGovernedEventsForTenant.mockResolvedValue([pgGov]);

    const result = await getEvents("gldf");

    // Hydrates the EXACT governed ids in the page (only evt_gov is governed) so
    // an old-but-selected event can't miss a newest-first window.
    expect(mockListGovernedEventsForTenant).toHaveBeenCalledWith("gldf", { ids: ["evt_gov"] });
    expect(result[0]).toBe(pgGov); // governed → from PG
    expect(result[1]).toBe(obs); // observation → still Redis
  });

  it("getEvents falls back to the Redis event when PG has no twin (fail-soft)", async () => {
    const gov = evt({ id: "evt_gov", type: "newsletter_draft" });
    mockRedis.zrange.mockResolvedValue(["evt_gov"]);
    mockRedis.mget.mockResolvedValue([gov]);
    mockListGovernedEventsForTenant.mockResolvedValue([]); // e.g. PG blip → []

    const result = await getEvents("gldf");
    expect(result).toEqual([gov]);
  });

  it("getEvent returns the PG twin for a governed event", async () => {
    const gov = evt({ id: "evt_gov", type: "content_update", metadata: { kind: "agent_preview" } });
    const pgGov = evt({ id: "evt_gov", type: "content_update", status: "approved", metadata: { kind: "agent_preview" } });
    mockRedis.get.mockResolvedValue(gov);
    mockGetGovernedEventById.mockResolvedValue(pgGov);

    const result = await getEvent("evt_gov");
    expect(mockGetGovernedEventById).toHaveBeenCalledWith("evt_gov");
    expect(result).toBe(pgGov);
  });

  it("getEvent does NOT hit PG for a non-governed observation event", async () => {
    const obs = evt({ id: "evt_obs", type: "booking", metadata: undefined });
    mockRedis.get.mockResolvedValue(obs);

    const result = await getEvent("evt_obs");
    expect(mockGetGovernedEventById).not.toHaveBeenCalled();
    expect(result).toEqual(obs);
  });
});

describe("proposalToEvent — reverse of eventToProposal round-trips governed fields", () => {
  it("a pending AI content_update round-trips id/tenantId/type/kind/status/metadata", () => {
    const source = evt({
      id: "evt_hero",
      type: "content_update",
      metadata: { kind: "agent_preview", section: "hero" },
    });
    const back = proposalToEvent(proposalFor(source), null, null, null);

    expect(back.id).toBe(source.id);
    expect(back.tenantId).toBe(source.tenantId);
    expect(back.type).toBe(source.type);
    expect(back.source).toBe("ai");
    expect(back.status).toBe("pending");
    expect(back.metadata).toEqual(source.metadata); // carries kind + section
    expect(back.metadata?.kind).toBe("agent_preview");
    expect(back.resolvedAt).toBeUndefined();
    // Full fidelity for the ai-sourced governed case.
    expect(back).toEqual(source);
  });

  it("an auto_approved proposal (no decision) reconstructs as auto_approved", () => {
    const source = evt({ id: "evt_auto", status: "auto_approved", metadata: { kind: "gbp_post_draft" } });
    const back = proposalToEvent(proposalFor(source), null, null, null);
    expect(back.status).toBe("auto_approved");
    expect(back.resolvedAt).toBeUndefined();
  });

  it("an event with no metadata round-trips to undefined metadata (not {})", () => {
    const source = evt({ id: "evt_nom", type: "newsletter_draft", metadata: undefined });
    const back = proposalToEvent(proposalFor(source), null, null, null);
    expect(back.metadata).toBeUndefined();
  });
});

describe("proposalToEvent — resolved item reconstructs status + resolvedAt + execution", () => {
  const proposal: Proposal = {
    id: "evt_res",
    tenantId: "gldf",
    source: "ai",
    kind: "gbp_post_draft",
    entityType: "content_update",
    title: "Post to Google",
    body: "Fall promo",
    payload: { kind: "gbp_post_draft" },
    status: "pending", // the proposal row is NOT status-updated on resolve
    createdAt: "2026-07-14T00:00:00.000Z",
  };
  const decision: Decision = {
    id: "dec_1",
    proposalId: "evt_res",
    action: "approved",
    actor: "user",
    decidedAt: "2026-07-15T12:00:00.000Z",
  };

  it("a decision drives status=approved + resolvedAt + a resolutionHistory entry", () => {
    const back = proposalToEvent(proposal, decision, null, null);
    expect(back.status).toBe("approved");
    expect(back.resolvedAt).toBe("2026-07-15T12:00:00.000Z");
    expect(back.metadata?.resolutionHistory).toEqual([
      { status: "approved", actor: "user", resolvedAt: "2026-07-15T12:00:00.000Z" },
    ]);
    expect(back.metadata?.kind).toBe("gbp_post_draft");
  });

  it("a dismissed decision reconstructs status=dismissed", () => {
    const back = proposalToEvent(
      proposal,
      { ...decision, action: "dismissed" },
      null,
      null,
    );
    expect(back.status).toBe("dismissed");
    expect(back.resolvedAt).toBe("2026-07-15T12:00:00.000Z");
  });

  it("execution_attempt + outcome fold back into metadata.execution", () => {
    const attempt: ExecutionAttempt = {
      id: "exec_1",
      proposalId: "evt_res",
      attemptNo: 1,
      idempotencyKey: "attempt_abc",
      status: "succeeded",
      providerReceipt: null,
      startedAt: "2026-07-15T12:00:00.000Z",
      finishedAt: "2026-07-15T12:00:05.000Z",
    };
    const outcome: Outcome = {
      id: "out_1",
      executionAttemptId: "exec_1",
      success: true,
      verified: null,
      detail: null,
      createdAt: "2026-07-15T12:00:05.000Z",
    };
    const back = proposalToEvent(proposal, decision, attempt, outcome);
    expect(back.metadata?.execution).toEqual({
      state: "completed",
      action: "approved",
      actor: "user",
      attemptId: "attempt_abc", // idempotency_key is the reconciliation marker
      startedAt: "2026-07-15T12:00:00.000Z",
      finishedAt: "2026-07-15T12:00:05.000Z",
    });
  });

  it("a failed attempt with an outcome detail folds reason + state=failed", () => {
    const attempt: ExecutionAttempt = {
      id: "exec_2",
      proposalId: "evt_res",
      attemptNo: 1,
      idempotencyKey: "attempt_xyz",
      status: "failed",
      providerReceipt: null,
      startedAt: "2026-07-15T12:00:00.000Z",
      finishedAt: "2026-07-15T12:00:03.000Z",
    };
    const outcome: Outcome = {
      id: "out_2",
      executionAttemptId: "exec_2",
      success: false,
      verified: null,
      detail: "review_reply_failed",
      createdAt: "2026-07-15T12:00:03.000Z",
    };
    const back = proposalToEvent(proposal, decision, attempt, outcome);
    expect(back.metadata?.execution?.state).toBe("failed");
    expect(back.metadata?.execution?.reason).toBe("review_reply_failed");
  });
});

describe("isGovernedScopeEvent — the read flip includes change_request (gap #3 closed)", () => {
  const ev = (type: string): UnifiedEvent =>
    ({ id: "e", tenantId: "t", source: "ai", type, title: "", body: "", status: "pending", createdAt: "", metadata: type === "review" ? { kind: "review_reply_draft" } : {} }) as unknown as UnifiedEvent;

  it("hydrates content_update / suggestion / newsletter / review-reply / change_request from Postgres", () => {
    for (const t of ["content_update", "suggestion", "newsletter_draft", "change_request"]) {
      expect(isGovernedScopeEvent(ev(t))).toBe(true);
    }
    expect(isGovernedScopeEvent(ev("review"))).toBe(true);
  });

  it("skips non-governed observations", () => {
    for (const t of ["booking", "message", "build_payment"]) expect(isGovernedScopeEvent(ev(t))).toBe(false);
  });
});

describe("proposalToEvent — change_request workflow reconstructs from metadata.workflowStatus (gap #3)", () => {
  const T = "2026-07-15T12:00:00.000Z";
  const crProposal = (status: Proposal["status"], workflowStatus: string | null, extra?: Record<string, unknown>): Proposal => ({
    id: "cr_1",
    tenantId: "gldf",
    source: "system",
    kind: "custom_change_request",
    entityType: "change_request",
    title: "Add a booking widget",
    body: "client wants online booking",
    payload: workflowStatus
      ? { workflowStatus, workflowUpdatedAt: T, ...extra }
      : { ...extra },
    status,
    createdAt: "2026-07-14T00:00:00.000Z",
  });

  it("shipped -> approved (a real ship, NOT auto_approved) + resolvedAt from workflowUpdatedAt", () => {
    const back = proposalToEvent(crProposal("approved", "shipped", { shippedAt: T }), null, null, null);
    expect(back.status).toBe("approved");
    expect(back.resolvedAt).toBe(T);
    expect(back.metadata?.workflowStatus).toBe("shipped");
    expect(back.metadata).not.toHaveProperty("resolutionHistory"); // workflow path never synthesizes one
  });

  it("declined -> dismissed + resolvedAt", () => {
    const back = proposalToEvent(crProposal("dismissed", "declined"), null, null, null);
    expect(back.status).toBe("dismissed");
    expect(back.resolvedAt).toBe(T);
    expect(back.metadata?.workflowStatus).toBe("declined");
  });

  it("quoted -> still pending, no resolvedAt, quoteRequired preserved", () => {
    const back = proposalToEvent(crProposal("pending", "quoted", { quoteRequired: true }), null, null, null);
    expect(back.status).toBe("pending");
    expect(back.resolvedAt).toBeUndefined();
    expect(back.metadata?.workflowStatus).toBe("quoted");
    expect(back.metadata?.quoteRequired).toBe(true);
  });

  it("a pending change_request with no workflowStatus yet reconstructs as pending", () => {
    const back = proposalToEvent(crProposal("pending", null), null, null, null);
    expect(back.status).toBe("pending");
    expect(back.resolvedAt).toBeUndefined();
  });

  it("a NON-change_request approved-with-no-decision still reads as auto_approved (unaffected)", () => {
    const p: Proposal = { id: "s_1", tenantId: "gldf", source: "ai", kind: null, entityType: "suggestion", title: "", body: "", payload: { workflowStatus: "shipped" }, status: "approved", createdAt: "2026-07-14T00:00:00.000Z" };
    // workflowStatus only drives change_request; a suggestion ignores it.
    expect(proposalToEvent(p, null, null, null).status).toBe("auto_approved");
  });
});
