import { createHash } from "node:crypto";
import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  type WorkspaceActor,
} from "@/platform/workspaces/types";
import {
  workspaceExitCommandSchema,
  workspaceExitOptionsSchema,
  workspaceExitResponseSchema,
  type WorkspaceExitCommand,
  type WorkspaceExitOptions,
  type WorkspaceExitResponse,
} from "./contracts";

type DbError = { message?: string; code?: string } | null;
type DbClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: DbError }>;
};

function db(): DbClient {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Workspace exit storage is unavailable.");
  return client as unknown as DbClient;
}

function identity(actor: WorkspaceActor) {
  return {
    p_user_id: z.string().uuid().parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail.toLowerCase()),
  };
}

function digest(command: WorkspaceExitCommand): string {
  return createHash("sha256").update(JSON.stringify(command), "utf8").digest("hex");
}

function fail(error: DbError, fallback: string): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (detail.includes("workspace_exit_denied")) throw new WorkspaceAccessError();
  if (detail.includes("workspace_exit_conflict") || detail.includes("workspace_exit_command_invalid") || detail.includes("workspace_exit_successor_invalid")) {
    throw new WorkspaceConflictError(error?.message || fallback);
  }
  throw new WorkspaceStoreError(fallback);
}

function response(raw: unknown): WorkspaceExitResponse {
  const parsed = workspaceExitResponseSchema.safeParse(raw);
  if (!parsed.success) throw new WorkspaceStoreError("The workspace exit result was malformed.");
  return parsed.data;
}

export async function readWorkspaceExit(actor: WorkspaceActor, workspaceId: string): Promise<WorkspaceExitOptions> {
  const id = z.string().uuid().parse(workspaceId);
  const { data, error } = await db().rpc("read_workspace_exit_state", {
    ...identity(actor), p_workspace_id: id,
  });
  if (error) fail(error, "The workspace exit state could not be loaded.");
  const parsed = workspaceExitOptionsSchema.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError("The workspace exit options were malformed.");
  return parsed.data;
}

/** Browser-safe completion status for a current member. The detailed exit
 * record remains owner-only; workspace membership is established by the
 * caller before this service-role status check. */
export async function readWorkspaceExitCompleted(workspaceId: string): Promise<boolean> {
  const id = z.string().uuid().parse(workspaceId);
  const { data, error } = await db().rpc("workspace_exit_completed", { p_workspace_id: id });
  if (error || typeof data !== "boolean") throw new WorkspaceStoreError("The workspace exit state could not be loaded.");
  return data;
}

export async function completeWorkspaceExit(actor: WorkspaceActor, raw: unknown): Promise<WorkspaceExitResponse> {
  const command = workspaceExitCommandSchema.parse(raw);
  const { data, error } = await db().rpc("complete_workspace_exit", {
    ...identity(actor),
    p_workspace_id: command.workspaceId,
    p_future_work: command.futureWork,
    p_provider_participation: command.providerParticipation,
    p_maintained_resources: command.maintainedResources,
    p_idempotency_key: command.idempotencyKey,
    p_command_digest: digest(command),
    p_notes: command.notes ?? null,
  });
  if (error) fail(error, "The workspace exit could not be confirmed.");
  return response(data);
}
