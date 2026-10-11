import { createHash } from "node:crypto";
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { systemsReleasedFor, systemsReleaseMayBeOn } from "@/platform/systems-release";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { CreateWorkPlanRequest } from "./contracts";
import { WorkPlanInvalidOutputError, WorkPlanUnavailableError, WorkPlanUnsupportedOperationError } from "./errors";

/** A failed draft becomes a pending Request, never an accepted job or a send.
 * SQL rechecks maker authority and owns the atomic, idempotent insert. */
export async function fileFailedSystemPlanRequest(error: unknown, actor: WorkspaceActor, input: CreateWorkPlanRequest): Promise<string | null> {
  if (!(error instanceof WorkPlanUnavailableError || error instanceof WorkPlanInvalidOutputError || error instanceof WorkPlanUnsupportedOperationError)
    || !systemsReleaseMayBeOn() || !await systemsReleasedFor(actor, input.workspaceId)) return null;
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("The fallback Request could not be saved.");
  const digest = createHash("sha256").update(JSON.stringify({ actor: actor.userId, goal: input.userGoal,
    sources: [...(input.sourceWorkIds ?? [])].sort(), evidence: input.evidence,
    execution: input.planningEconomics?.executionKey ?? null })).digest("hex");
  const { data, error: failure } = await (db as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> })
    .rpc("file_failed_system_plan_request", { p_workspace_id: input.workspaceId, p_user_id: actor.userId,
      p_verified_email: actor.verifiedEmail, p_goal: input.userGoal, p_digest: digest });
  const id = z.string().uuid().safeParse(data);
  if (failure || !id.success) throw new WorkspaceStoreError("The fallback Request could not be saved.");
  return id.data;
}
