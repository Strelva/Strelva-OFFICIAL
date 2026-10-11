import { describe, expect, it, vi } from "vitest";
import { createPossibility } from "@/platform/possibilities/engine";
import { detachUndoneNativeGoogleActivation } from "@/platform/possibilities/engine";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";

vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => { throw new Error("Ambient database access is forbidden in finalizer tests."); } }));
import { createSupabasePossibilityRepository, type PossibilitiesDb } from "@/platform/possibilities/supabase-repository";
import { activationSchema } from "@/platform/make-real/contracts";
import { createSupabaseActivationRepository, type ActivationsDb } from "@/platform/make-real/supabase-repository";

const workspaceId = "b7000000-0000-4000-8000-000000000001";
const possibilityId = "b7000000-0000-4000-8000-000000000002";
const bindingId = "b7000000-0000-4000-8000-000000000003";
const actor = { userId: "b7000000-0000-4000-8000-000000000004", verifiedEmail: " Owner@Example.test " };
const activationId = "native-google-completed-activation";
const at = "2026-10-09T00:00:00.000Z";

function withdrawn() {
  const draft = createPossibility({ title: "Native Google listing", intent: "Publish the exact authorized native listing.",
    introduces: [{ key: "listing", name: "Google listing", purpose: "Own the exact listing", candidate: { summary: "Listing", content: { locationId: "exact" } } }],
    effects: [{ id: "google", kind: "publish", channel: "google_listing", system: { introducedKey: "listing" }, description: "Publish exact Google listing", after: [],
      request: { tenantId: `workspace-${workspaceId}`, locationId: "exact", eventId: "approved-native-event", draftDigest: "a".repeat(64),
        nativeGrant: { bindingId, accountId: "accounts/exact", grantGeneration: "b".repeat(64) } } }],
    checks: [{ id: "native-readback", description: "Exact native Google readback matched." }],
  }, { id: possibilityId, businessId: workspaceId, actorId: actor.userId, at });
  const completed = { ...draft, status: "made_real" as const, activationId, revision: 4,
    history: [{ revision: 4, kind: "made_real", actorId: actor.userId, at, detail: activationId }] };
  return detachUndoneNativeGoogleActivation(completed, activationId, actor.userId, at,
    { undoneStepIds: ["effect:google", "activate:introduced:listing", "introduce:listing"], consumedApprovalIds: ["accepted-plan"] });
}

function reverseCheckpoint() {
  const proposal = withdrawn();
  return activationSchema.parse({ version: 1, id: activationId, businessId: workspaceId, possibilityId,
    candidateRevision: proposal.candidateRevision, actorId: actor.userId, status: "needs_attention", revision: 5,
    pinned: [], introduced: [], connections: [], approvals: [{ effectId: "google", approvalId: "accepted-plan", approvedBy: actor.userId, at, consumedAt: at }],
    rollbackStartedAt: at, checks: [{ id: "native-readback", description: "Exact Google readback", status: "passed", at }],
    steps: [{ id: "effect:google", kind: "effect", target: "google", label: "Exact Google listing", dependsOn: [],
      reversibility: "compensable", idempotencyKey: "native-google-exact-step", status: "completed", effect: "accepted", attempts: 1,
      receipt: { adapterMode: "live", acceptedAt: at, providerRef: JSON.stringify({ businessId: workspaceId, request: proposal.effects[0]!.request, receiptId: "b7000000-0000-4000-8000-000000000099" }) },
      readBack: { status: "confirmed", detail: "Exact fixture readback", at },
      compensation: { status: "running", detail: "Exact inverse claim", claimId: "inverse-exact-claim", at },
    }], createdAt: at, updatedAt: at, history: [{ revision: 5, kind: "rollback_compensation_claim", actorId: actor.userId, at }],
  });
}

function completedProposal() {
  const value = withdrawn();
  return { ...value, status: "made_real" as const, activationId,
    history: [{ revision: value.revision, kind: "made_real", actorId: actor.userId, at, detail: activationId }] };
}

describe("native Google lost completion Supabase finalizer boundary", () => {
  it("sends the exact made-real proposal, current actor, activation and CAS through the completion RPC", async () => {
    const value = completedProposal();
    const rpc = vi.fn<PossibilitiesDb["rpc"]>(async () => ({ data: value, error: null }));
    await expect(createSupabasePossibilityRepository(actor, { rpc }).finalizeNativeGoogleCompletion!(value, 4, activationId)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("finalize_native_google_completion", {
      p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: "owner@example.test", p_possibility_id: possibilityId,
      p_expected_revision: 4, p_activation_id: activationId, p_body: value,
    });
  });

  it.each(["workspace", "possibility", "status", "revision", "activation", "candidate"])("refuses %s completion response drift without generic fallback", async invalid => {
    const value = completedProposal();
    const changed = structuredClone(value);
    if (invalid === "workspace") changed.businessId = "b7000000-0000-4000-8000-000000000099";
    if (invalid === "possibility") changed.id = "b7000000-0000-4000-8000-000000000099";
    const response = invalid === "status" ? { ...changed, status: "ready" } : changed;
    if (invalid === "revision") changed.revision++;
    if (invalid === "activation") changed.activationId = "foreign-activation";
    if (invalid === "candidate") changed.candidateRevision++;
    const rpc = vi.fn<PossibilitiesDb["rpc"]>(async () => ({ data: response, error: null }));
    await expect(createSupabasePossibilityRepository(actor, { rpc }).finalizeNativeGoogleCompletion!(value, 4, activationId)).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(rpc).toHaveBeenCalledOnce(); expect(rpc.mock.calls[0]![0]).toBe("finalize_native_google_completion");
  });

  it("maps current owner denial and never falls back to ordinary proposal save", async () => {
    const rpc = vi.fn<PossibilitiesDb["rpc"]>(async () => ({ data: null, error: { message: "business_record_access_denied" } }));
    await expect(createSupabasePossibilityRepository(actor, { rpc }).finalizeNativeGoogleCompletion!(completedProposal(), 4, activationId)).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(rpc).toHaveBeenCalledOnce(); expect(rpc.mock.calls[0]![0]).toBe("finalize_native_google_completion");
  });
});

describe("native Google completed undo Supabase finalizer boundary", () => {
  it("sends the exact withdrawn document, actor, activation and revision to only the narrow finalizer", async () => {
    const value = withdrawn();
    const rpc = vi.fn<PossibilitiesDb["rpc"]>(async () => ({ data: value, error: null }));
    const repository = createSupabasePossibilityRepository(actor, { rpc });
    await expect(repository.finalizeNativeGoogleUndo!(value, 4, activationId)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("finalize_native_google_undo", {
      p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: "owner@example.test",
      p_possibility_id: possibilityId, p_expected_revision: 4, p_activation_id: activationId, p_body: value,
    });
    expect(value.status).toBe("withdrawn"); expect(value.activationId).toBeUndefined();
    expect(value.consumedApprovalIds).toContain("accepted-plan");
  });

  it.each(["null", "incomplete", "workspace", "possibility", "revision", "still_made_real", "still_attached"])("fails closed on %s finalizer response", async invalid => {
    const value = withdrawn();
    let response: unknown = value;
    if (invalid === "null") response = null;
    if (invalid === "incomplete") response = { status: "withdrawn" };
    if (invalid === "workspace") response = { ...value, businessId: "b7000000-0000-4000-8000-000000000099" };
    if (invalid === "possibility") response = { ...value, id: "b7000000-0000-4000-8000-000000000099" };
    if (invalid === "revision") response = { ...value, revision: value.revision + 1 };
    if (invalid === "still_made_real") response = { ...value, status: "made_real" };
    if (invalid === "still_attached") response = { ...value, activationId };
    const rpc = vi.fn<PossibilitiesDb["rpc"]>(async () => ({ data: response, error: null }));
    const repository = createSupabasePossibilityRepository(actor, { rpc });
    await expect(repository.finalizeNativeGoogleUndo!(value, 4, activationId)).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it.each(["business_record_access_denied", "system_possibility_revision_conflict", "native_google_undo_unconfirmed"])("preserves %s refusal without generic save fallback", async message => {
    const rpc = vi.fn<PossibilitiesDb["rpc"]>(async () => ({ data: null, error: { message } }));
    const repository = createSupabasePossibilityRepository(actor, { rpc });
    const error = message === "business_record_access_denied" ? WorkspaceAccessError : message === "system_possibility_revision_conflict" ? WorkspaceConflictError : WorkspaceStoreError;
    await expect(repository.finalizeNativeGoogleUndo!(withdrawn(), 4, activationId)).rejects.toBeInstanceOf(error);
    expect(rpc).toHaveBeenCalledOnce(); expect(rpc.mock.calls[0]![0]).toBe("finalize_native_google_undo");
  });

  it("keeps a generic closed-plan save on the existing RPC and never promotes it to native finalization", async () => {
    const value = withdrawn();
    const rpc = vi.fn<PossibilitiesDb["rpc"]>(async () => ({ data: null, error: { message: "system_possibility_closed" } }));
    const repository = createSupabasePossibilityRepository(actor, { rpc });
    await expect(repository.save(value, 4)).rejects.toThrow("closed");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_system_possibility", {
      p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: "owner@example.test", p_possibility_id: possibilityId,
      p_expected_revision: 4, p_body: value,
    });
  });

  it("validates malformed actor, workspace and revision before finalizer dispatch", async () => {
    const rpc = vi.fn<PossibilitiesDb["rpc"]>(async () => { throw new Error("Invalid input must never dispatch."); });
    const value = withdrawn();
    await expect(createSupabasePossibilityRepository({ ...actor, userId: "foreign-actor" }, { rpc }).finalizeNativeGoogleUndo!(value, 4, activationId)).rejects.toThrow();
    await expect(createSupabasePossibilityRepository(actor, { rpc }).finalizeNativeGoogleUndo!({ ...value, businessId: "foreign-workspace" }, 4, activationId)).rejects.toThrow();
    await expect(createSupabasePossibilityRepository(actor, { rpc }).finalizeNativeGoogleUndo!(value, -1, activationId)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("native Google reverse activation Supabase checkpoint boundary", () => {
  it("routes exact current actor, workspace, activation and CAS revision through the specialized RPC", async () => {
    const value = reverseCheckpoint();
    const rpc = vi.fn<ActivationsDb["rpc"]>(async () => ({ data: value, error: null }));
    await expect(createSupabaseActivationRepository(actor, { rpc }).saveNativeGoogleUndo!(value, 4)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_native_google_undo_activation", {
      p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: "owner@example.test",
      p_activation_id: activationId, p_expected_revision: 4, p_activation: value,
    });
  });

  it.each(["null", "incomplete", "workspace", "activation", "revision", "possibility"])("fails closed on %s reverse checkpoint response", async invalid => {
    const value = reverseCheckpoint();
    let response: unknown = value;
    if (invalid === "null") response = null;
    if (invalid === "incomplete") response = { id: activationId };
    if (invalid === "workspace") response = { ...value, businessId: "b7000000-0000-4000-8000-000000000099" };
    if (invalid === "activation") response = { ...value, id: "foreign-activation" };
    if (invalid === "revision") response = { ...value, revision: 6 };
    if (invalid === "possibility") response = { ...value, possibilityId: "b7000000-0000-4000-8000-000000000099" };
    const rpc = vi.fn<ActivationsDb["rpc"]>(async () => ({ data: response, error: null }));
    await expect(createSupabaseActivationRepository(actor, { rpc }).saveNativeGoogleUndo!(value, 4)).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it.each(["make_real_activation_access_denied", "make_real_activation_revision_conflict", "make_real_activation_invalid"])("retains %s rejection without generic fallback", async message => {
    const rpc = vi.fn<ActivationsDb["rpc"]>(async () => ({ data: null, error: { message } }));
    const error = message === "make_real_activation_access_denied" ? WorkspaceAccessError : message === "make_real_activation_revision_conflict" ? WorkspaceConflictError : WorkspaceStoreError;
    await expect(createSupabaseActivationRepository(actor, { rpc }).saveNativeGoogleUndo!(reverseCheckpoint(), 4)).rejects.toBeInstanceOf(error);
    expect(rpc).toHaveBeenCalledOnce(); expect(rpc.mock.calls[0]![0]).toBe("save_native_google_undo_activation");
  });

  it("keeps ordinary activation saves on the generic RPC when a closed log is refused", async () => {
    const value = reverseCheckpoint();
    const rpc = vi.fn<ActivationsDb["rpc"]>(async () => ({ data: null, error: { message: "make_real_activation_invalid" } }));
    await expect(createSupabaseActivationRepository(actor, { rpc }).save(value, 4)).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_make_real_activation", {
      p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: "owner@example.test",
      p_activation_id: activationId, p_expected_revision: 4, p_activation: value,
    });
  });

  it("refuses malformed actor, workspace or CAS before specialized dispatch", async () => {
    const value = reverseCheckpoint();
    const rpc = vi.fn<ActivationsDb["rpc"]>(async () => { throw new Error("Invalid checkpoint must never dispatch."); });
    await expect(createSupabaseActivationRepository({ ...actor, userId: "foreign-actor" }, { rpc }).saveNativeGoogleUndo!(value, 4)).rejects.toThrow();
    await expect(createSupabaseActivationRepository(actor, { rpc }).saveNativeGoogleUndo!({ ...value, businessId: "foreign-workspace" }, 4)).rejects.toThrow();
    await expect(createSupabaseActivationRepository(actor, { rpc }).saveNativeGoogleUndo!(value, -1)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("native Google accepted receipt recovery Supabase checkpoint boundary", () => {
  function recoveredCheckpoint() {
    const value = reverseCheckpoint();
    delete value.rollbackStartedAt;
    delete value.steps[0]!.compensation;
    value.history = [{ revision: value.revision, kind: "reconcile", actorId: actor.userId, at, detail: "effect:google: completed" }];
    value.steps[0]!.receipt!.reconciledBy = "operator_evidence";
    return value;
  }

  it("sends only the exact canonical recovered document and current actor through the narrow recovery RPC", async () => {
    const value = recoveredCheckpoint();
    const rpc = vi.fn<ActivationsDb["rpc"]>(async () => ({ data: value, error: null }));
    await expect(createSupabaseActivationRepository(actor, { rpc }).saveNativeGoogleRecovery!(value, 4)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_native_google_recovered_activation", {
      p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: "owner@example.test",
      p_activation_id: activationId, p_expected_revision: 4, p_activation: value,
    });
  });

  it.each(["null", "workspace", "possibility", "candidate", "revision", "accepted_at", "provider_ref", "accepted_fact", "approval", "readback"])("refuses %s drift in accepted recovery response without fallback", async invalid => {
    const value = recoveredCheckpoint();
    const changed = structuredClone(value);
    if (invalid === "workspace") changed.businessId = "b7000000-0000-4000-8000-000000000099";
    if (invalid === "possibility") changed.possibilityId = "b7000000-0000-4000-8000-000000000099";
    if (invalid === "candidate") changed.candidateRevision++;
    if (invalid === "revision") changed.revision++;
    if (invalid === "accepted_at") changed.steps[0]!.receipt!.acceptedAt = "2026-10-08T00:00:00.000Z";
    if (invalid === "provider_ref") changed.steps[0]!.receipt!.providerRef = JSON.stringify({ ...JSON.parse(changed.steps[0]!.receipt!.providerRef!), receiptId: "b7000000-0000-4000-8000-000000000088" });
    if (invalid === "accepted_fact") changed.steps[0]!.effect = "none";
    if (invalid === "approval") delete changed.approvals[0]!.consumedAt;
    if (invalid === "readback") changed.steps[0]!.readBack!.status = "failed";
    const rpc = vi.fn<ActivationsDb["rpc"]>(async () => ({ data: invalid === "null" ? null : changed, error: null }));
    await expect(createSupabaseActivationRepository(actor, { rpc }).saveNativeGoogleRecovery!(value, 4)).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(rpc).toHaveBeenCalledOnce(); expect(rpc.mock.calls[0]![0]).toBe("save_native_google_recovered_activation");
  });

  it.each(["make_real_activation_access_denied", "make_real_activation_revision_conflict", "make_real_activation_invalid"])("retains %s recovery refusal without generic fallback", async message => {
    const rpc = vi.fn<ActivationsDb["rpc"]>(async () => ({ data: null, error: { message } }));
    const error = message === "make_real_activation_access_denied" ? WorkspaceAccessError : message === "make_real_activation_revision_conflict" ? WorkspaceConflictError : WorkspaceStoreError;
    await expect(createSupabaseActivationRepository(actor, { rpc }).saveNativeGoogleRecovery!(recoveredCheckpoint(), 4)).rejects.toBeInstanceOf(error);
    expect(rpc).toHaveBeenCalledOnce(); expect(rpc.mock.calls[0]![0]).toBe("save_native_google_recovered_activation");
  });
});
