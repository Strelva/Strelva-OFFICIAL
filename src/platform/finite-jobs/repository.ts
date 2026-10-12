import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { combineFiniteJobs, finiteJobSourcesSchema, type FiniteJobRecord } from "./records";

type FiniteJobsDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };

/** One snapshot, authorized in SQL; no partial result on any source failure. */
export async function readFiniteJobs(actor: WorkspaceActor, businessId: string, database?: FiniteJobsDb): Promise<FiniteJobRecord[]> {
  z.string().uuid().parse(businessId);
  z.string().uuid().parse(actor.userId);
  const verifiedEmail = z.string().email().parse(actor.verifiedEmail.trim().toLowerCase());
  const db = database ?? getSupabase() as unknown as FiniteJobsDb | null;
  if (!db) throw new WorkspaceStoreError("Finite job storage is unavailable.");
  let result: Awaited<ReturnType<FiniteJobsDb["rpc"]>>;
  try {
    result = await db.rpc("read_finite_job_sources", {
      p_user_id: actor.userId, p_verified_email: verifiedEmail, p_business_id: businessId,
    });
  } catch { throw new WorkspaceStoreError("Finite jobs could not be read."); }
  if (result.error) {
    if (/access_denied|workspace_denied|identity_denied/.test(result.error.message)) throw new WorkspaceAccessError();
    throw new WorkspaceStoreError("Finite jobs could not be read.");
  }
  const parsed = finiteJobSourcesSchema.safeParse(result.data);
  if (!parsed.success) throw new WorkspaceStoreError("The finite job snapshot was malformed.");
  return combineFiniteJobs(businessId, parsed.data);
}
