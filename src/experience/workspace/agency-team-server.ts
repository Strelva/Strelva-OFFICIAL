import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { createWorkspaceInvitation, revokeWorkspaceInvitation } from "@/platform/workspaces/invitations";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { parseAgencyTeam, type AgencyTeamAction } from "./agency-team";

export type AgencyTeamDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
function teamDb(): AgencyTeamDb {
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Team storage is unavailable.");
  return db as unknown as AgencyTeamDb;
}
function actorArgs(actor: WorkspaceActor, workspaceId: string) {
  return { p_user_id: z.string().uuid().parse(actor.userId), p_verified_email: z.string().trim().toLowerCase().email().parse(actor.verifiedEmail), p_agency_workspace_id: z.string().uuid().parse(workspaceId) };
}
async function call(db: AgencyTeamDb, name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    const message = error.message ?? "";
    if (/access_denied/.test(message)) throw new WorkspaceAccessError();
    if (/member_protected|member_missing|bulk_invalid|staff_invalid|provider_seat_required/.test(message)) throw new WorkspaceConflictError("This person or client is no longer available for that change. Reload the team.");
    throw new WorkspaceStoreError("The team change could not be confirmed.");
  }
  return data;
}
export async function readAgencyTeam(actor: WorkspaceActor, workspaceId: string, db = teamDb()) {
  const value = await call(db, "read_agency_team", actorArgs(actor, workspaceId));
  try {
    const team = parseAgencyTeam(value, workspaceId);
    if (team.actorUserId !== actor.userId) throw new Error("Wrong actor");
    return team;
  } catch { throw new WorkspaceStoreError("The team response was malformed."); }
}
export async function manageAgencyTeam(actor: WorkspaceActor, input: AgencyTeamAction, db = teamDb()) {
  const args = actorArgs(actor, input.workspaceId);
  if (input.action === "assign") {
    return call(db, "bulk_set_agency_client_staff", { ...args, p_staff_user_ids: input.userIds, p_workspace_ids: input.clientIds, p_active: input.active });
  }
  if (input.action === "remove" || input.action === "set_role") {
    return call(db, "manage_agency_team_member", { ...args, p_staff_user_id: input.userId, p_role: input.action === "remove" ? null : input.role });
  }
  // The same invitation service/token/acceptance as People & access. Reading
  // current authority here also prevents an invitation ID from another agency.
  const team = await readAgencyTeam(actor, input.workspaceId, db);
  if (!team.canManage) throw new WorkspaceAccessError();
  if (input.action === "invite") {
    return createWorkspaceInvitation(actor, { workspaceId: input.workspaceId, recipientEmail: input.recipientEmail, role: input.role });
  }
  if (!team.invitations.some(invitation => invitation.id === input.invitationId && invitation.role !== "owner")) throw new WorkspaceAccessError();
  return { status: await revokeWorkspaceInvitation(actor, input.invitationId) };
}
