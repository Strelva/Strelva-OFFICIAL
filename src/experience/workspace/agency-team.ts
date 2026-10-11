import { z } from "zod";

const uuid = z.string().uuid();
const role = z.enum(["owner", "admin", "member"]);
export const agencyTeamSchema = z.object({
  agencyWorkspaceId: uuid,
  actorUserId: uuid,
  canManage: z.boolean(),
  members: z.array(z.object({ userId: uuid, email: z.string(), role }).strict()),
  clients: z.array(z.object({
    customerWorkspaceId: uuid, name: z.string(), seatId: uuid,
    grantedByKind: z.string(), grantedAt: z.string(),
    staff: z.array(z.object({ userId: uuid, email: z.string(), agencyRole: role }).strict()),
  }).strict()),
  invitations: z.array(z.object({ id: uuid, recipientEmail: z.string(), role, status: z.literal("pending"), expiresAt: z.string() }).strict()),
}).strict();
export type AgencyTeam = z.infer<typeof agencyTeamSchema>;

export const agencyTeamActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), workspaceId: uuid, recipientEmail: z.string().trim().toLowerCase().email().max(254), role: z.enum(["admin", "member"]) }).strict(),
  z.object({ action: z.literal("revoke_invitation"), workspaceId: uuid, invitationId: uuid }).strict(),
  z.object({ action: z.literal("set_role"), workspaceId: uuid, userId: uuid, role: z.enum(["admin", "member"]) }).strict(),
  z.object({ action: z.literal("remove"), workspaceId: uuid, userId: uuid }).strict(),
  z.object({ action: z.literal("assign"), workspaceId: uuid, userIds: z.array(uuid).min(1).max(100), clientIds: z.array(uuid).min(1).max(100), active: z.boolean() }).strict(),
]);
export type AgencyTeamAction = z.infer<typeof agencyTeamActionSchema>;

export async function teamRequest(request: typeof fetch, workspaceId: string, action?: AgencyTeamAction, signal?: AbortSignal) {
  const response = await request(`/api/workspace/agency-team?workspaceId=${encodeURIComponent(workspaceId)}`, {
    credentials: "same-origin", signal,
    ...(action ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) } : {}),
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = value && typeof value === "object" && "error" in value ? value.error : null;
    throw new Error(typeof error === "string" ? error : "Team could not be loaded. Reload before trying again.");
  }
  return value;
}

export function parseAgencyTeam(value: unknown, workspaceId: string): AgencyTeam {
  const parsed = agencyTeamSchema.parse(value);
  if (parsed.agencyWorkspaceId !== workspaceId) throw new Error("The team response belongs to another agency.");
  return parsed;
}
