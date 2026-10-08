import { workspacePublishingScope } from "@/platform/infra/publishing-scope";
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
  if (!item) throw new WorkspaceAccessError();
  const stopped = await readWorkspaceExitCompleted(workspaceId);
  const paused = item.system.lifecycle === "paused";
  const canCompose = (workspace.role === "owner" || workspace.role === "admin") && (!item.references.tenantId || await hasTenantPermission(item.references.tenantId, "content:write"));
  const canApprove = workspace.role === "owner";
  if (write && (!canCompose || stopped || paused)) throw new WorkspaceConflictError("Publishing is paused or unavailable to your account.");
  return { actor, workspaceId, systemId, tenantId: item.references.tenantId ?? workspacePublishingScope(workspaceId), kind: item.system.kind as ContentTarget["kind"], canCompose: canCompose && !stopped && !paused, canApprove: canApprove && !stopped && !paused, paused };
}

/** A tenant authoring tool keeps its legacy draft path unless this business
 * opted in. Once opted in, revisions stay proposals and cannot unpublish the
 * current entry while Strelva is merely preparing words for the owner. */
export async function prepareTenantCollectionDraft(input: { tenantId: string; actor: WorkspaceActor | null; draft: unknown }): Promise<{ eventId: string; slug: string } | null> {
  const { tenantReleaseFlagEnabled } = await import("@/platform/release-flags/store");
  const { releaseFlagMayBeOn } = await import("@/platform/release-flags/resolve");
  if (!releaseFlagMayBeOn("publishing") || !(await tenantReleaseFlagEnabled("publishing", input.tenantId))) return null;
  if (!input.actor) throw new WorkspaceAccessError("A verified business member must prepare this publishing draft.");
  const { readBindingTarget } = await import("@/platform/account-bindings/store");
  const link = await readBindingTarget(input.tenantId);
  if (!link) throw new WorkspaceAccessError("This site is not linked to a business.");
  const base = await listBusinessSystems(input.actor, link.workspaceId, { store: createSupabaseSystemStore() });
  const website = base.systems.find(item => item.system.kind === "website" && item.references.tenantId === input.tenantId);
  if (!website) throw new WorkspaceAccessError("This website System is unavailable.");
  const target = await contentTarget(input.actor, link.workspaceId, website.system.id, true);
  const { prepareContentDraft } = await import("./content-service");
  const event = await prepareContentDraft(target, input.draft);
  return { eventId: event.id, slug: String((event.metadata?.publishing as { slug: string }).slug) };
}
