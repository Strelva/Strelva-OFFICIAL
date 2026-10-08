import { publishingWorkspaceId } from "@/platform/infra/publishing-scope";
import { z } from "zod";
import type { UnifiedEvent } from "@/platform/infra/event-contract";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { hasTenantPermission } from "@/platform/infra/auth";
import { readLinkedSite } from "@/platform/owner-entry/linked-sites";
import { resolveTenantOwnerRecipient, resolveOwnerRecipient } from "@/platform/business-record/service";
import { readBindingTarget } from "@/platform/account-bindings/store";
import { tenantReleaseFlagEnabled, workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { currentReleaseViewer } from "@/platform/release-flags/viewer";
import { readBusinessRecord } from "@/platform/business-record/service";
import type { ReleaseViewer } from "@/platform/release-flags/resolve";
import type { WorkspaceActor } from "@/platform/workspaces/types";

export const WORKSPACE_PUBLISHING_KINDS = ["workspace_collection_publish", "workspace_newsletter_issue", "workspace_google_listing_draft"] as const;
export function workspacePublishingEvent(event: UnifiedEvent): boolean {
  return (WORKSPACE_PUBLISHING_KINDS as readonly string[]).includes(String(event.metadata?.kind));
}
export interface PublishingAuthorityDeps {
  target: typeof readBindingTarget;
  owner: typeof resolveTenantOwnerRecipient;
  session: typeof getSessionUser;
  permission: typeof hasTenantPermission;
  linked: typeof readLinkedSite;
  record: typeof readBusinessRecord;
  released: typeof tenantReleaseFlagEnabled;
  viewer: typeof currentReleaseViewer;
  workspaceOwner?: typeof resolveOwnerRecipient;
  workspaceReleased?: typeof workspaceReleaseFlagEnabled;
}
const defaults: PublishingAuthorityDeps = { target: readBindingTarget, owner: resolveTenantOwnerRecipient, session: getSessionUser, permission: hasTenantPermission, linked: readLinkedSite, record: readBusinessRecord, released: tenantReleaseFlagEnabled, viewer: currentReleaseViewer, workspaceOwner: resolveOwnerRecipient, workspaceReleased: workspaceReleaseFlagEnabled };
export type PublishingAuthorityResult = { allowed: false; reason: string } | { allowed: true; viewer: ReleaseViewer; actor: WorkspaceActor | null };

/** A signed Needs-you owner link is checked at the route and again against
 * the live owner here. Sessionless `user` and arbitrary actor IDs are denied.
 * A connected account and an operator session never imply owner approval. */
export async function authorizePublishingEvent(input: { tenantId: string; event: UnifiedEvent; actorId: string }, deps: PublishingAuthorityDeps = defaults): Promise<PublishingAuthorityResult> {
  const workspaceId = z.string().uuid().safeParse(input.event.metadata?.workspaceId);
  const deny = (reason: string): PublishingAuthorityResult => ({ allowed: false, reason });
  if (!workspacePublishingEvent(input.event) || input.event.tenantId !== input.tenantId || !workspaceId.success) return deny("publishing_scope_invalid");
  const nativeWorkspace = publishingWorkspaceId(input.tenantId);
  const target = nativeWorkspace ? { workspaceId: nativeWorkspace } : await deps.target(input.tenantId).catch(() => null);
  if (target?.workspaceId !== workspaceId.data) return deny("publishing_scope_changed");
  let actor: WorkspaceActor | null = null;
  let viewer: ReleaseViewer;
  if (input.actorId.startsWith("owner-link:")) {
    const recipient = input.actorId.slice("owner-link:".length).trim().toLowerCase();
    const owner = nativeWorkspace ? await deps.workspaceOwner?.(nativeWorkspace).catch(() => null) : await deps.owner(input.tenantId).catch(() => null);
    if (!owner || owner.email.trim().toLowerCase() !== recipient) return deny("publishing_owner_changed");
    viewer = { operator: false, tester: false };
  } else {
    const user = await deps.session().catch(() => null);
    if (!user?.id || !user.email || !user.email_confirmed_at || user.id !== input.actorId) return deny("publishing_approval_required");
    actor = { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() };
    if (!nativeWorkspace && (!(await deps.linked(actor, workspaceId.data, input.tenantId)) || !(await deps.permission(input.tenantId, "publishing:manage")))) return deny("publishing_permission_denied");
    const record = await deps.record(actor, workspaceId.data).catch(() => null);
    if (record?.access !== "owner") return deny("publishing_owner_instruction_required");
    viewer = await deps.viewer();
  }
  if (!(nativeWorkspace ? await deps.workspaceReleased?.("publishing", nativeWorkspace, viewer) : await deps.released("publishing", input.tenantId, viewer))) return deny("publishing_release_off");
  return { allowed: true, actor, viewer };
}
