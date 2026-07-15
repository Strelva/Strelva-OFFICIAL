import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedEvent } from "@/lib/types";

// Stub the governed-work repository (the "shadow functions") so we can assert
// whether a shadow write is attempted without a real Supabase client.
const mockInsertProposal = vi.fn();
const mockRecordDecision = vi.fn();
const mockStartExecutionAttempt = vi.fn();
const mockFinishExecutionAttempt = vi.fn();
const mockRecordOutcome = vi.fn();

vi.mock("@/lib/governed-work/repository", () => ({
  insertProposal: (...a: unknown[]) => mockInsertProposal(...a),
  recordDecision: (...a: unknown[]) => mockRecordDecision(...a),
  startExecutionAttempt: (...a: unknown[]) => mockStartExecutionAttempt(...a),
  finishExecutionAttempt: (...a: unknown[]) => mockFinishExecutionAttempt(...a),
  recordOutcome: (...a: unknown[]) => mockRecordOutcome(...a),
}));

import { governedWorkDualWriteEnabled } from "@/lib/db/dual-write";
import {
  eventToProposal,
  isGovernedWorkEvent,
  shadowDecisionFromResolve,
  shadowFinishExecutionAttempt,
  shadowProposalFromEvent,
  shadowStartExecutionAttempt,
} from "@/lib/governed-work/shadow";

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
  } as UnifiedEvent;
}

const original = process.env.GOVERNED_WORK_DUAL_WRITE;
afterEach(() => {
  if (original === undefined) delete process.env.GOVERNED_WORK_DUAL_WRITE;
  else process.env.GOVERNED_WORK_DUAL_WRITE = original;
});

describe("governedWorkDualWriteEnabled", () => {
  it("defaults OFF when the flag is unset (the safe default)", () => {
    delete process.env.GOVERNED_WORK_DUAL_WRITE;
    expect(governedWorkDualWriteEnabled()).toBe(false);
  });

  it('is OFF for any value other than "1"/"true" (inverse of DUAL_WRITE_PG)', () => {
    process.env.GOVERNED_WORK_DUAL_WRITE = "0";
    expect(governedWorkDualWriteEnabled()).toBe(false);
    process.env.GOVERNED_WORK_DUAL_WRITE = "false";
    expect(governedWorkDualWriteEnabled()).toBe(false);
    process.env.GOVERNED_WORK_DUAL_WRITE = "yes";
    expect(governedWorkDualWriteEnabled()).toBe(false);
  });

  it('turns ON only for an explicit "1"/"true"', () => {
    process.env.GOVERNED_WORK_DUAL_WRITE = "1";
    expect(governedWorkDualWriteEnabled()).toBe(true);
    process.env.GOVERNED_WORK_DUAL_WRITE = "true";
    expect(governedWorkDualWriteEnabled()).toBe(true);
  });
});

describe("eventToProposal / isGovernedWorkEvent mapping", () => {
  it("maps a pending AI content_update to a proposal keyed 1:1 on the event id", () => {
    const e = evt({
      id: "evt_hero",
      type: "content_update",
      metadata: { kind: "agent_preview", section: "hero" },
    });
    expect(eventToProposal(e)).toEqual({
      id: "evt_hero",
      tenantId: "gldf",
      source: "ai",
      kind: "agent_preview",
      entityType: "content_update",
      title: "Update the hero",
      body: "hero: new copy",
      payload: { kind: "agent_preview", section: "hero" },
      status: "pending",
    });
  });

  it("collapses a non-ai source to system and maps auto_approved → approved", () => {
    const e = evt({ source: "stripe", status: "auto_approved", metadata: undefined });
    const p = eventToProposal(e);
    expect(p?.source).toBe("system");
    expect(p?.status).toBe("approved");
    expect(p?.kind).toBeNull();
    expect(p?.payload).toBeNull();
  });

  it("treats a review as governed work ONLY when it carries a reply draft", () => {
    expect(isGovernedWorkEvent(evt({ type: "review", metadata: { kind: "review_reply_draft" } }))).toBe(true);
    // A plain "new review arrived" observation is not a proposal.
    expect(isGovernedWorkEvent(evt({ type: "review", metadata: undefined }))).toBe(false);
    expect(eventToProposal(evt({ type: "review", metadata: undefined }))).toBeNull();
  });

  it("skips pure observations and non-decided statuses", () => {
    for (const type of ["booking", "message", "mention", "build_payment", "visibility_snapshot"] as const) {
      expect(eventToProposal(evt({ type, metadata: { kind: "x" } }))).toBeNull();
    }
    // A governed type but already resolved (not pending/auto_approved) is not a new proposal.
    expect(eventToProposal(evt({ type: "content_update", status: "approved" }))).toBeNull();
    expect(eventToProposal(evt({ type: "content_update", status: "dismissed" }))).toBeNull();
  });
});

describe("shadow orchestrators — flag OFF is behavior-identical (no shadow calls)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GOVERNED_WORK_DUAL_WRITE;
  });

  it("shadowProposalFromEvent makes NO repository call when the flag is OFF", async () => {
    await shadowProposalFromEvent(evt({ type: "content_update", metadata: { kind: "agent_preview" } }));
    expect(mockInsertProposal).not.toHaveBeenCalled();
  });

  it("shadowDecisionFromResolve makes NO repository call when the flag is OFF", async () => {
    await shadowDecisionFromResolve("evt_1", "approved", "user");
    expect(mockRecordDecision).not.toHaveBeenCalled();
  });

  it("execution shadows make NO repository call when the flag is OFF", async () => {
    const id = await shadowStartExecutionAttempt("evt_1", "attempt_1");
    expect(id).toBeNull();
    expect(mockStartExecutionAttempt).not.toHaveBeenCalled();
    await shadowFinishExecutionAttempt("exec_1", { success: true });
    expect(mockFinishExecutionAttempt).not.toHaveBeenCalled();
    expect(mockRecordOutcome).not.toHaveBeenCalled();
  });
});

describe("shadow orchestrators — flag ON maps and writes correctly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOVERNED_WORK_DUAL_WRITE = "1";
  });

  it("shadowProposalFromEvent inserts the mapped proposal for governed work only", async () => {
    await shadowProposalFromEvent(evt({ id: "evt_g", type: "newsletter_draft" }));
    expect(mockInsertProposal).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt_g", entityType: "newsletter_draft", status: "pending" }),
    );

    mockInsertProposal.mockClear();
    // An observation (a booking) is skipped even with the flag on.
    await shadowProposalFromEvent(evt({ type: "booking", metadata: undefined }));
    expect(mockInsertProposal).not.toHaveBeenCalled();
  });

  it("shadowDecisionFromResolve records the approve/dismiss decision", async () => {
    await shadowDecisionFromResolve("evt_g", "dismissed", "user");
    expect(mockRecordDecision).toHaveBeenCalledWith({
      proposalId: "evt_g",
      action: "dismissed",
      actor: "user",
    });
  });

  it("execution shadows start with the attemptId as idempotency key, then finish + record outcome", async () => {
    mockStartExecutionAttempt.mockResolvedValue({ id: "exec_99" });
    const id = await shadowStartExecutionAttempt("evt_g", "attempt_abc");
    expect(id).toBe("exec_99");
    expect(mockStartExecutionAttempt).toHaveBeenCalledWith({
      proposalId: "evt_g",
      idempotencyKey: "attempt_abc",
    });

    await shadowFinishExecutionAttempt("exec_99", { success: true, detail: undefined });
    expect(mockFinishExecutionAttempt).toHaveBeenCalledWith("exec_99", { status: "succeeded" });
    // success gates resolution; verified stays null (read-back is a separate event).
    expect(mockRecordOutcome).toHaveBeenCalledWith({
      executionAttemptId: "exec_99",
      success: true,
      verified: null,
      detail: null,
    });
  });

  it("shadowFinishExecutionAttempt no-ops on a null attempt id (start never opened one)", async () => {
    await shadowFinishExecutionAttempt(null, { success: false, detail: "boom" });
    expect(mockFinishExecutionAttempt).not.toHaveBeenCalled();
    expect(mockRecordOutcome).not.toHaveBeenCalled();
  });

  it("a shadow repository failure is swallowed, never propagated", async () => {
    mockInsertProposal.mockRejectedValue(new Error("pg down"));
    await expect(
      shadowProposalFromEvent(evt({ type: "content_update" })),
    ).resolves.toBeUndefined();
  });
});
