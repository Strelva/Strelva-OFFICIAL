import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc }) }));

import { acceptPayerJob, commandPayerTransition, readPayerTransitionInbox, readPayerTransitions, PayerTransitionAccessError, PayerTransitionConflictError, PayerTransitionValidationError } from "@/platform/work-economics/payer-transitions";

const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "owner@example.com" };
const workspaceId = "11111111-1111-4111-8111-111111111111";
const agencyId = "22222222-2222-4222-8222-222222222222";
const transitionId = "33333333-3333-4333-8333-333333333333";

function transition(over: Record<string, unknown> = {}) {
  return { id: transitionId, workspace_id: workspaceId, successor_kind: "user", successor_user_id: null, successor_email: null,
    status: "pending", proposer_email: "owner@example.com", proposed_at: "2026-10-09T12:00:00Z", resolved_at: null, accepted_at: null, ...over };
}

describe("payer party commands", () => {
  beforeEach(() => { rpc.mockReset(); });

  it("proposes an agency as payer with a narrow durable receipt and no fallible readback", async () => {
    rpc.mockResolvedValueOnce({ data: [transition({ successor_kind: "agency", successor_workspace_id: agencyId })], error: null });
    const result = await commandPayerTransition(actor, { action: "propose", workspaceId, successorAgencyWorkspaceId: agencyId });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("workspace_payer_transition_command", {
      p_command: { action: "propose", workspaceId, successorAgencyWorkspaceId: agencyId }, p_actor_id: actor.userId, p_verified_email: actor.verifiedEmail,
    });
    expect(result).toEqual({ receipt: { kind: "payer_transition", action: "propose", id: transitionId, workspaceId, status: "pending", successorKind: "agency" } });
  });

  it("proposes the business itself", async () => {
    rpc.mockResolvedValue({ data: [transition({ successor_kind: "business" })], error: null });
    await expect(commandPayerTransition(actor, { action: "propose", workspaceId, successorKind: "business" })).resolves.toMatchObject({ receipt: { successorKind: "business", status: "pending" } });
  });

  it("keeps a person successor as before and refuses mixed or unknown shapes", async () => {
    rpc.mockResolvedValue({ data: [transition({ successor_user_id: actor.userId, successor_email: "next@example.com" })], error: null });
    await expect(commandPayerTransition(actor, { action: "propose", workspaceId, successorEmail: "Next@Example.com" })).resolves.toMatchObject({ receipt: { successorKind: "user" } });
    expect(rpc.mock.calls[0]![1].p_command.successorEmail).toBe("next@example.com");
    await expect(commandPayerTransition(actor, { action: "propose", workspaceId, successorEmail: "next@example.com", successorAgencyWorkspaceId: agencyId })).rejects.toBeInstanceOf(PayerTransitionValidationError);
    await expect(commandPayerTransition(actor, { action: "propose", workspaceId, successorKind: "agency" })).rejects.toBeInstanceOf(PayerTransitionValidationError);
    await expect(commandPayerTransition(actor, { action: "accept", transitionId, canRespond: true })).rejects.toBeInstanceOf(PayerTransitionValidationError);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each(["accept", "reject", "revoke"] as const)("does not replace a workspace snapshot with a global inbox after %s", async action => {
    rpc.mockRejectedValue(new Error("A read would fail after commit"));
    rpc.mockResolvedValueOnce({ data: [transition({ successor_kind: "business", status: action === "accept" ? "accepted" : action === "reject" ? "rejected" : "revoked" })], error: null });
    await expect(commandPayerTransition(actor, { action, transitionId })).resolves.toMatchObject({ receipt: { workspaceId, action } });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("returns durable stale resolution without claiming acceptance", async () => {
    rpc.mockResolvedValue({ data: [transition({ status: "stale" })], error: null });
    await expect(commandPayerTransition(actor, { action: "accept", transitionId })).resolves.toMatchObject({ receipt: { status: "stale", action: "accept" } });
  });

  it.each(["payer_transition_successor_required", "payer_transition_identity_denied"])("preserves current authority rejection: %s", async message => {
    rpc.mockResolvedValue({ data: null, error: { message } });
    await expect(commandPayerTransition(actor, { action: "accept", transitionId })).rejects.toBeInstanceOf(PayerTransitionAccessError);
  });

  it("preserves replaced/revoked/concurrent response conflicts", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "payer_transition_not_pending" } });
    await expect(commandPayerTransition(actor, { action: "accept", transitionId })).rejects.toBeInstanceOf(PayerTransitionConflictError);
  });

  it("reads explicit scope and server-derived capabilities from v2 only", async () => {
    rpc.mockResolvedValue({ data: [transition({ successor_kind: "agency", successor_workspace_id: agencyId, successor_workspace_name: "Northside Web", can_respond: true, can_revoke: false })], error: null });
    const result = await readPayerTransitions(actor, workspaceId);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("workspace_payer_transition_snapshot_v2", { p_workspace_id: workspaceId, p_actor_id: actor.userId, p_verified_email: actor.verifiedEmail });
    expect(result).toMatchObject({ workspaceId, pending: { successorKind: "agency", successorWorkspaceName: "Northside Web", canRespond: true, canRevoke: false } });
    rpc.mockResolvedValue({ data: [transition({ successor_user_id: actor.userId })], error: null });
    expect((await readPayerTransitions(actor, workspaceId)).pending).toMatchObject({ canRespond: false, canRevoke: false });
  });

  it("retains multiple businesses in the explicitly global inbox including business successors", async () => {
    rpc.mockImplementation(async name => ({ error: null, data: name === "workspace_payer_transition_inbox_v2" ? [transition({ successor_kind: "business", can_respond: true }), transition({ id: agencyId, workspace_id: agencyId, successor_kind: "agency", status: "accepted" })] : [] }));
    const result = await readPayerTransitionInbox(actor);
    expect(result.workspaceId).toBeNull();
    expect(result.transitions).toHaveLength(2);
    expect(result.pending).toBeNull();
    expect(result.current).toBeNull();
    expect(result.transitions[0]).toMatchObject({ successorKind: "business", canRespond: true });
  });

  it("returns only a job receipt after job acceptance, even if the next read fails", async () => {
    rpc.mockRejectedValue(new Error("refresh unavailable"));
    rpc.mockResolvedValueOnce({ data: [{ id: transitionId, workspace_id: workspaceId, status: "accepted", work_id: agencyId, payer_id: actor.userId }], error: null });
    await expect(acceptPayerJob(actor, { action: "accept_job", jobId: transitionId })).resolves.toEqual({ receipt: { kind: "payer_job", action: "accept_job", id: transitionId, workspaceId, status: "accepted" } });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

it("does not label a former payer's visible historical acceptance as current", async () => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [transition({ status: "accepted", successor_kind: "user", is_current: false })], error: null });
  const result = await readPayerTransitions(actor, workspaceId);
  expect(result.transitions).toHaveLength(1);
  expect(result.current).toBeNull();
});

it.each(["pending", "rejected", "revoked", "unknown"])("does not call a malformed accept outcome %s successful", async status => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [transition({ status })], error: null });
  await expect(commandPayerTransition(actor, { action: "accept", transitionId })).rejects.toThrow("saved payer result could not be verified");
  expect(rpc).toHaveBeenCalledTimes(1);
});

it.each(["reserved", "settled"])("recognizes an idempotent %s job receipt without repeating acceptance", async status => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [{ id: transitionId, workspace_id: workspaceId, status }], error: null });
  await expect(acceptPayerJob(actor, { action: "accept_job", jobId: transitionId })).resolves.toMatchObject({ receipt: { status } });
  expect(rpc).toHaveBeenCalledTimes(1);
});

it.each([{ successor_kind: ["agency"] }, { successor_kind: undefined }, { status: ["accepted"] }, { id: "" }, { workspace_id: "other" }])("refuses malformed durable metadata %j without inventing party identity", async invalid => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [transition({ status: "accepted", ...invalid })], error: null });
  await expect(commandPayerTransition(actor, { action: "accept", transitionId })).rejects.toThrow("saved payer result could not be verified");
});
