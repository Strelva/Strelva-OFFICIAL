import { expect, it, vi } from "vitest";
import { readQualification, submitQualification, decideQualification, readQualificationDesk } from "@/experience/workspace/agency/qualification-server";
import { qualificationSubmissionSchema } from "@/experience/workspace/agency/qualification-model";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";

const workspaceId = "22222222-2222-4222-8222-222222222222";
const actor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "Owner@Example.test" };
const input = { action: "submit", workspaceId, requestId: "33333333-3333-4333-8333-333333333333", effect: "publish", evidenceUrl: "https://example.test/proof", evidence: "Rehearsal verified release and recovery." };
it("submits a bounded actor-bound evidence record and rereads current availability", async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ data: {}, error: null }).mockResolvedValueOnce({ data: { workspaceId, canSubmit: true, independentReviewerAvailable: false, submissions: [], effects: [{ effect: "publish", available: false }] }, error: null });
  const result = await submitQualification(actor, input, { rpc });
  expect(rpc.mock.calls[0]).toEqual(["submit_agency_qualification", expect.objectContaining({ p_user_id: actor.userId, p_verified_email: "owner@example.test", p_request_id: input.requestId, p_effect: "publish", p_evidence: input.evidence })]);
  expect(rpc.mock.calls[1]?.[0]).toBe("read_agency_qualification");
  expect(result.effects[0]?.available).toBe(false);
  expect(result.independentReviewerAvailable).toBe(false);
});
it("rejects non-HTTPS and oversized/empty evidence before invoking storage", async () => {
  const rpc = vi.fn();
  expect(qualificationSubmissionSchema.safeParse({ ...input, evidenceUrl: "http://example.test/proof" }).success).toBe(false);
  await expect(submitQualification(actor, { ...input, evidence: "short" }, { rpc })).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
it("fails closed for revoked membership and wrong-workspace responses", async () => {
  await expect(readQualification(actor, workspaceId, { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "agency_qualification_access_denied" } }) })).rejects.toBeInstanceOf(WorkspaceAccessError);
  await expect(readQualification(actor, workspaceId, { rpc: vi.fn().mockResolvedValue({ data: { workspaceId: actor.userId, canSubmit: true, submissions: [], effects: [] }, error: null }) })).rejects.toThrow("unavailable");
});
it("rejects operator self-verification and stale evidence", async () => {
  const decision = { action: "decide", submissionId: input.requestId, decision: "verified", reason: "Verified release and recovery evidence." };
  await expect(decideQualification("operator@example.test", decision, { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "agency_qualification_self_verification" } }) })).rejects.toBeInstanceOf(WorkspaceAccessError);
  await expect(decideQualification("operator@example.test", decision, { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "agency_qualification_stale" } }) })).rejects.toBeInstanceOf(WorkspaceConflictError);
});

it("preserves the operator-bound independent-review projection in the platform queue", async () => {
  const record = { id: input.requestId, workspaceId, agencyName: "Agency", effect: "publish", evidenceUrl: input.evidenceUrl, evidence: input.evidence, submittedAt: "2026-10-14T12:00:00Z", submittedBy: actor.userId, decision: null, reason: null, decidedBy: null, decidedAt: null, canReview: false };
  const rpc = vi.fn().mockResolvedValue({ data: [record], error: null });
  const result = await readQualificationDesk("operator@example.test", { rpc });
  expect(rpc).toHaveBeenCalledWith("read_agency_qualification_desk", { p_operator_email: "operator@example.test" });
  expect(result[0]?.canReview).toBe(false);
  expect(result[0]?.id).toBe(input.requestId);
});
