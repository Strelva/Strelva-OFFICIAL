import { z } from "zod";
import { versionsDb, type VersionsDb } from "@/platform/system-versions/supabase-store";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { qualificationDecisionSchema, qualificationRecordSchema, qualificationStateSchema, qualificationSubmissionSchema } from "./qualification-model";

async function call(name: string, args: Record<string, unknown>, db: VersionsDb) {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    if (/access_denied|operator_required|self_verification/.test(error.message ?? "")) throw new WorkspaceAccessError();
    if (/stale|pending|request_conflict/.test(error.message ?? "")) throw new WorkspaceConflictError("This submission changed. Reload its current status.");
    throw new WorkspaceStoreError("Agency qualification could not be confirmed.");
  }
  return data;
}
function actorArgs(actor: WorkspaceActor) {
  return { p_user_id: z.string().uuid().parse(actor.userId), p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()) };
}
export async function readQualification(actor: WorkspaceActor, workspaceId: string, db: VersionsDb = versionsDb()) {
  const id = z.string().uuid().parse(workspaceId);
  const result = qualificationStateSchema.parse(await call("read_agency_qualification", { ...actorArgs(actor), p_agency_workspace_id: id }, db));
  if (result.workspaceId !== id) throw new WorkspaceStoreError("Agency qualification is unavailable.");
  return result;
}
export async function submitQualification(actor: WorkspaceActor, input: unknown, db: VersionsDb = versionsDb()) {
  const body = qualificationSubmissionSchema.parse(input);
  await call("submit_agency_qualification", { ...actorArgs(actor), p_agency_workspace_id: body.workspaceId, p_request_id: body.requestId,
    p_effect: body.effect, p_evidence_url: body.evidenceUrl, p_evidence: body.evidence }, db);
  return readQualification(actor, body.workspaceId, db);
}
export async function readQualificationDesk(operatorEmail: string, db: VersionsDb = versionsDb()) {
  return z.array(qualificationRecordSchema).parse(await call("read_agency_qualification_desk", { p_operator_email: z.string().email().parse(operatorEmail) }, db));
}
export async function decideQualification(operatorEmail: string, input: unknown, db: VersionsDb = versionsDb()) {
  const body = qualificationDecisionSchema.parse(input);
  await call("decide_agency_qualification", { p_operator_email: z.string().email().parse(operatorEmail), p_submission_id: body.submissionId,
    p_decision: body.decision, p_reason: body.reason }, db);
}
