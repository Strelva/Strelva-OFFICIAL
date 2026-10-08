import { systemsReleasedFor } from "@/platform/systems-release";
import { assertCanMakeSystems } from "@/platform/workspaces/repository";
import { listAgencyDelegations, listWorkspaces, WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces";

/**
 * Planning never borrows a customer's budget through a delegation. Agencies
 * propose and accept their own planning maximum in their agency workspace;
 * the draft still belongs to the delegated client. No billing permission is
 * widened, and the client's active delegation is rechecked before each call.
 */
export async function workPlanFundingWorkspace(actor: WorkspaceActor, workspaceId: string): Promise<string> {
  if (!await systemsReleasedFor(actor, workspaceId)) return workspaceId;
  const authority = await assertCanMakeSystems(actor, workspaceId);
  if (authority === "operator") return workspaceId;
  const agencies = (await listWorkspaces(actor)).filter(workspace => workspace.kind === "agency" && workspace.access === "member").sort((a, b) => a.id.localeCompare(b.id));
  for (const agency of agencies) {
    const delegations = await listAgencyDelegations(actor, agency.id);
    if (delegations.some(delegation => delegation.customerWorkspaceId === workspaceId && delegation.status === "active")) return agency.id;
  }
  throw new WorkspaceAccessError();
}
