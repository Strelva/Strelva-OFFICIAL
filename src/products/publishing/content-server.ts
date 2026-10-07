import { hasTenantPermission } from "@/platform/infra/auth";
import { listWorkspaces } from "@/platform/workspaces";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { listBusinessSystems } from "@/platform/systems/from-existing";
import { createSupabaseSystemStore } from "@/platform/systems/supabase-store";
import { readWorkspaceExitCompleted } from "@/platform/workspace-exit/repository";
import { addPublishingSystems } from "./projection";
import { readPublishingExtras, readPublishingSnapshot } from "./server";
import type { ContentTarget } from "./content-service";

/** Resolve the tenant only from actor-checked Systems. Browser tenant IDs are
 * never accepted. Agencies cannot mutate a customer's publishing outputs. */
export async function contentTarget(actor: WorkspaceActor, workspaceId: string, systemId: string, write = false): Promise<ContentTarget & { canCompose: boolean; canApprove: boolean; paused: boolean }> {
  const workspace = (await listWorkspaces(actor)).find(item => item.id === workspaceId && item.kind === "customer" && item.access === "member");
  if (!workspace) throw new WorkspaceAccessError();
  const base = await listBusinessSystems(actor, workspaceId, { store: createSupabaseSystemStore() });
  const [snapshot, extras] = await Promise.all([readPublishingSnapshot(actor, workspaceId), readPublishingExtras(base)]);
  const item = addPublishingSystems(base, snapshot, extras).listing.systems.find(item => item.system.id === systemId && ["website", "newsletter"].includes(item.system.kind));
  if (!item?.references.tenantId) throw new WorkspaceAccessError();
  const stopped = await readWorkspaceExitCompleted(workspaceId);
  const paused = item.system.lifecycle === "paused";
  const canCompose = (workspace.role === "owner" || workspace.role === "admin") && await hasTenantPermission(item.references.tenantId, "content:write");
  const canApprove = workspace.role === "owner";
  if (write && (!canCompose || stopped || paused)) throw new WorkspaceConflictError("Publishing is paused or unavailable to your account.");
  return { actor, workspaceId, systemId, tenantId: item.references.tenantId, kind: item.system.kind as ContentTarget["kind"], canCompose: canCompose && !stopped && !paused, canApprove: canApprove && !stopped && !paused, paused };
}
