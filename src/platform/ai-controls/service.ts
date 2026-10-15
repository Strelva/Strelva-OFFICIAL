import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { logger } from "@/platform/infra/logger";
import { releaseWorkspaceForTenant } from "@/platform/release-flags/store";
import { aiControlsReleaseEnabled } from "@/platform/infra/ai-controls-release";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import {
  agencyAiControlsViewSchema,
  aiControlsStateSchema,
  operatorAiControlsViewSchema,
  type AgencyAiControlsView,
  type AiControlsCommand,
  type AiControlsStateView,
  type OperatorAiControlsCommand,
  type OperatorAiControlsView,
} from "./contracts";

type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };
let override: Rpc | null = null;
/** Test seam. */
export function setAiControlsDb(value: Rpc | null): void { override = value; }
function db(): Rpc {
  if (override) return override;
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Usage controls could not be read. Nothing changed.");
  return client as unknown as Rpc;
}

const UNREADABLE = "Usage controls could not be read. Nothing changed.";

async function call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) {
    const detail = `${error.code ?? ""} ${error.message ?? ""}`;
    if (detail.includes("workspace_access_denied") || detail.includes("workspace_release_operator_required") || detail.includes("workspace_release_workspace_invalid")) throw new WorkspaceAccessError();
    if (detail.includes("ai_controls_revision_conflict")) throw new WorkspaceConflictError("These controls changed since you opened them. Refresh, then save again.");
    throw new WorkspaceStoreError(UNREADABLE);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError(UNREADABLE);
  return parsed.data;
}

export async function readAgencyAiControls(actor: WorkspaceActor, input: { agencyWorkspaceId: string; workspaceId?: string | null }): Promise<AgencyAiControlsView> {
  const view = await call("read_agency_ai_controls", {
    p_agency_id: input.agencyWorkspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_workspace_id: input.workspaceId ?? null,
  }, agencyAiControlsViewSchema);
  if (view.agencyWorkspaceId !== input.agencyWorkspaceId) throw new WorkspaceStoreError(UNREADABLE);
  return view;
}

/** Best effort: a hold or pause withdraws timers on replies already waiting to post. Never fails the control change. */
async function withdrawForTenants(tenantIds: readonly string[], by: "agency" | "operator"): Promise<void> {
  // Loaded here, not at the top: the reply voice reads these controls and auto-reply reads the voice.
  const { withdrawPendingAutoPosts } = await import("@/lib/reviews/auto-reply");
  for (const tenantId of tenantIds) {
    try { await withdrawPendingAutoPosts(tenantId, { by }); }
    catch (error) { logger.warn("[ai-controls] Could not withdraw pending auto-posts", { tenantId, error: error instanceof Error ? error.message : "unknown" }); }
  }
}

export async function setAgencyAiControls(actor: WorkspaceActor, command: AiControlsCommand): Promise<AgencyAiControlsView> {
  const view = await call("set_agency_ai_controls", {
    p_agency_id: command.agencyWorkspaceId, p_workspace_id: command.workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
    p_paused: command.paused, p_monthly_cap_cents: command.monthlyCapCents, p_review_auto_post: command.reviewAutoPost,
    p_expected_revision: command.expectedRevision, p_reason: command.reason,
  }, agencyAiControlsViewSchema);
  const client = view.clients.find(row => row.workspaceId === command.workspaceId);
  if (!client) throw new WorkspaceStoreError(UNREADABLE);
  if (command.reviewAutoPost === "held" || command.paused) await withdrawForTenants(client.linkedTenantIds, "agency");
  return view;
}

export async function readOperatorAiControls(operatorEmail: string, workspaceId: string): Promise<OperatorAiControlsView> {
  return call("read_operator_ai_controls", { p_operator_email: operatorEmail, p_workspace_id: workspaceId }, operatorAiControlsViewSchema);
}

export async function setOperatorAiControls(operatorEmail: string, command: OperatorAiControlsCommand): Promise<OperatorAiControlsView> {
  const view = await call("set_operator_ai_controls", {
    p_operator_email: operatorEmail, p_workspace_id: command.workspaceId, p_paused: command.paused, p_monthly_cap_cents: command.monthlyCapCents,
    p_review_auto_post: command.reviewAutoPost, p_expected_revision: command.expectedRevision, p_reason: command.reason,
  }, operatorAiControlsViewSchema);
  if (command.reviewAutoPost === "held" || command.paused) await withdrawForTenants(view.linkedTenantIds, "operator");
  return view;
}

/**
 * The controls that bind one tenant's work, or null when the flag is off or the
 * tenant has no linked business. When the read fails the answer is
 * `{ unavailable: true }`; callers treat that as held for auto-post (fail closed).
 */
export async function readTenantAiControls(tenantId: string): Promise<AiControlsStateView | { unavailable: true } | null> {
  if (!aiControlsReleaseEnabled()) return null;
  try {
    const workspaceId = await releaseWorkspaceForTenant(tenantId);
    if (!workspaceId) return null;
    return await call("business_ai_controls_state", { p_workspace_id: workspaceId }, aiControlsStateSchema);
  } catch (error) {
    logger.warn("[ai-controls] Could not read controls for a tenant", { tenantId, error: error instanceof Error ? error.message : "unknown" });
    return { unavailable: true };
  }
}
