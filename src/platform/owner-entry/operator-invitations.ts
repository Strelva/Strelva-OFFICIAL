import { getAuthenticatedOperatorContext } from "@/platform/infra/auth";
import { releaseWorkspaceForTenant } from "@/platform/release-flags/store";
import { readOwnerInvitationState, type OwnerInvitationState } from "@/platform/workspaces/business-ownership";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
import { ownerEntryPossible } from "./env";

/** A separate, off-by-default stop point: owner rollout never sends invitations. */
export function ownerInvitationsReleaseEnabled(): boolean {
  return process.env.STRELVA_OWNER_INVITATIONS_RELEASE === "1" && ownerEntryPossible();
}

export type OwnerInvitationsLoad =
  | { kind: "ready"; state: OwnerInvitationState }
  | { kind: "unconverted" | "denied" | "unavailable" };

/** The state RPC rechecks active super-admin AND explicit workspace admin membership. */
export async function operatorOwnerInvitationContext(tenantId: string): Promise<{ operator: string; actor: { userId: string; verifiedEmail: string }; authTime: number | null; state: OwnerInvitationState }> {
  if (!ownerInvitationsReleaseEnabled()) throw new WorkspaceAccessError();
  const context = await getAuthenticatedOperatorContext();
  if (!context) throw new WorkspaceAccessError();
  const { operator, actor, authTime } = { operator: context.email, actor: context.actor, authTime: context.authTime };
  const workspaceId = await releaseWorkspaceForTenant(tenantId);
  if (!workspaceId) throw new WorkspaceConflictError("Convert this site to a business before inviting its owner.");
  const state = await readOwnerInvitationState(operator, workspaceId);
  if (!state.tenants.some((tenant) => tenant.tenantId === tenantId)) throw new WorkspaceAccessError();
  return { operator, actor, authTime, state };
}

/** Flags off: no auth or workspace reads, and no added page element. */
export async function loadOwnerInvitations(tenantId: string): Promise<OwnerInvitationsLoad | null> {
  if (!ownerInvitationsReleaseEnabled()) return null;
  try {
    return { kind: "ready", state: (await operatorOwnerInvitationContext(tenantId)).state };
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return { kind: "denied" };
    if (error instanceof WorkspaceConflictError) return { kind: "unconverted" };
    return { kind: "unavailable" };
  }
}
