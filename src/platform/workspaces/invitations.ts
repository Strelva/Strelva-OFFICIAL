import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor, type WorkspaceRole } from "./types";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const createInput = z.object({
  workspaceId: z.string().uuid(),
  recipientEmail: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["owner", "admin", "member"]),
}).strict();

type Table = { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] };
type InvitationDb = { public: {
  Tables: { workspace_invitations: Table; workspace_memberships: Table; workspaces: Table };
  Views: Record<string, never>;
  Functions: {
    create_workspace_invitation: { Args: { p_workspace_id: string; p_actor_id: string; p_verified_email: string; p_recipient_email: string; p_role: string; p_token_hash: string; p_expires_at: string }; Returns: Record<string, unknown>[] };
    inspect_workspace_invitation: { Args: { p_token_hash: string }; Returns: Record<string, unknown>[] };
    accept_workspace_invitation: { Args: { p_token_hash: string; p_actor_id: string; p_verified_email: string }; Returns: Record<string, unknown>[] };
    revoke_workspace_invitation: { Args: { p_invitation_id: string; p_actor_id: string; p_verified_email: string }; Returns: string };
  };
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
} };

export type WorkspaceInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  recipientEmail: string;
  role: WorkspaceRole;
  status: WorkspaceInvitationStatus;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string;
  revokedAt?: string;
}

export interface WorkspaceInvitationPreview {
  id: string;
  workspaceId: string;
  workspaceName: string;
  recipientEmail: string;
  role: WorkspaceRole;
  status: WorkspaceInvitationStatus;
  expiresAt: string;
}

export interface AcceptedWorkspaceInvitation {
  invitationId: string;
  workspaceId: string;
  workspaceName: string;
  invitedRole: WorkspaceRole;
  appliedRole: WorkspaceRole;
  status: WorkspaceInvitationStatus;
  alreadyAccepted: boolean;
}

export class WorkspaceInvitationRecipientError extends WorkspaceAccessError {
  constructor() {
    super("Sign in with the exact verified email address named by this invitation.");
    this.name = "WorkspaceInvitationRecipientError";
  }
}

function db(): SupabaseClient<InvitationDb> {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Workspace invitation storage is not configured");
  return client as unknown as SupabaseClient<InvitationDb>;
}

function cleanActor(input: WorkspaceActor): WorkspaceActor {
  const userId = input.userId?.trim();
  const verifiedEmail = input.verifiedEmail?.trim().toLowerCase();
  if (!userId || !verifiedEmail || !z.string().email().safeParse(verifiedEmail).success) throw new WorkspaceAccessError("A verified signed-in identity is required");
  return { userId, verifiedEmail };
}

function hashToken(token: string): string {
  if (!TOKEN.test(token)) throw new WorkspaceAccessError("This invitation is unavailable.");
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function maskEmail(value: string): string {
  const [local = "", domain = ""] = value.split("@");
  return `${local.slice(0, 1) || "•"}${"•".repeat(Math.min(Math.max(local.length - 1, 2), 6))}@${domain}`;
}

function effectiveStatus(row: Record<string, unknown>): WorkspaceInvitationStatus {
  const status = string(row.status) as WorkspaceInvitationStatus;
  return status === "pending" && Date.parse(string(row.expires_at)) <= Date.now() ? "expired" : status;
}

function mapInvitation(row: Record<string, unknown>): WorkspaceInvitation {
  return {
    id: string(row.id),
    workspaceId: string(row.workspace_id),
    recipientEmail: string(row.recipient_email),
    role: string(row.role) as WorkspaceRole,
    status: effectiveStatus(row),
    expiresAt: string(row.expires_at),
    createdAt: string(row.created_at),
    acceptedAt: optionalString(row.accepted_at),
    revokedAt: optionalString(row.revoked_at),
  };
}

function failure(error: { message?: string; code?: string } | null, fallback: string): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (detail.includes("workspace_invitation_recipient_mismatch")) throw new WorkspaceInvitationRecipientError();
  if (detail.includes("workspace_invitation_identity_required") || detail.includes("workspace_invitation_owner_required") || detail.includes("workspace_invitation_sponsor_invalid") || detail.includes("workspace_invitation_workspace_invalid") || detail.includes("workspace_invitation_not_found")) throw new WorkspaceAccessError();
  if (detail.includes("workspace_invitation_pending")) throw new WorkspaceConflictError("A pending invitation already exists for this email. Revoke it before creating another.");
  if (detail.includes("workspace_invitation_limit_reached")) throw new WorkspaceConflictError("This workspace has reached its pending invitation limit.");
  if (detail.includes("workspace_invitation_access_removed")) throw new WorkspaceConflictError("This invitation was already accepted, but that workspace access was later removed.");
  if (detail.includes("workspace_invitation_command_invalid")) throw new WorkspaceConflictError("The invitation details are invalid.");
  throw new WorkspaceStoreError(fallback);
}

async function requireOwner(actor: WorkspaceActor, workspaceId: string): Promise<void> {
  const result = await db().from("workspace_memberships").select("role")
    .eq("workspace_id", workspaceId).eq("user_id", actor.userId).maybeSingle();
  if (result.error) failure(result.error, "Workspace membership is unavailable");
  if (!result.data || string((result.data as Record<string, unknown>).role) !== "owner") throw new WorkspaceAccessError();
}

export async function createWorkspaceInvitation(inputActor: WorkspaceActor, input: unknown): Promise<{ invitation: WorkspaceInvitation; token: string }> {
  const actor = cleanActor(inputActor);
  const parsed = createInput.safeParse(input);
  if (!parsed.success) throw parsed.error;
  const token = randomBytes(32).toString("base64url");
  const result = await db().rpc("create_workspace_invitation", {
    p_workspace_id: parsed.data.workspaceId,
    p_actor_id: actor.userId,
    p_verified_email: actor.verifiedEmail,
    p_recipient_email: parsed.data.recipientEmail,
    p_role: parsed.data.role,
    p_token_hash: createHash("sha256").update(token, "utf8").digest("hex"),
    p_expires_at: new Date(Date.now() + INVITATION_LIFETIME_MS).toISOString(),
  });
  if (result.error) failure(result.error, "The invitation could not be created");
  const row = result.data?.[0] as Record<string, unknown> | undefined;
  if (!row) throw new WorkspaceStoreError("The invitation could not be created");
  return { invitation: mapInvitation(row), token };
}

export async function listWorkspaceInvitations(inputActor: WorkspaceActor, workspaceId: string): Promise<WorkspaceInvitation[]> {
  const actor = cleanActor(inputActor);
  if (!z.string().uuid().safeParse(workspaceId).success) throw new WorkspaceAccessError();
  await requireOwner(actor, workspaceId);
  const result = await db().from("workspace_invitations").select("*")
    .eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  if (result.error) failure(result.error, "Workspace invitations are unavailable");
  return (result.data ?? []).map(row => mapInvitation(row as Record<string, unknown>));
}

/** Public token preview. It exposes only the terms needed to decide whether to sign in. */
export async function inspectWorkspaceInvitation(token: string): Promise<WorkspaceInvitationPreview> {
  const result = await db().rpc("inspect_workspace_invitation", { p_token_hash: hashToken(token) });
  if (result.error) failure(result.error, "This invitation is unavailable");
  const row = result.data?.[0] as Record<string, unknown> | undefined;
  if (!row) throw new WorkspaceAccessError("This invitation is unavailable.");
  const recipient = string(row.recipient_email);
  return {
    id: string(row.invitation_id),
    workspaceId: string(row.workspace_id),
    workspaceName: string(row.workspace_name),
    recipientEmail: maskEmail(recipient),
    role: string(row.role) as WorkspaceRole,
    status: string(row.status) as WorkspaceInvitationStatus,
    expiresAt: string(row.expires_at),
  };
}

export async function acceptWorkspaceInvitation(inputActor: WorkspaceActor, token: string): Promise<AcceptedWorkspaceInvitation> {
  const actor = cleanActor(inputActor);
  const result = await db().rpc("accept_workspace_invitation", {
    p_token_hash: hashToken(token), p_actor_id: actor.userId, p_verified_email: actor.verifiedEmail,
  });
  if (result.error) failure(result.error, "The invitation could not be accepted");
  const row = result.data?.[0] as Record<string, unknown> | undefined;
  if (!row) throw new WorkspaceStoreError("The invitation could not be accepted");
  return {
    invitationId: string(row.invitation_id),
    workspaceId: string(row.workspace_id),
    workspaceName: string(row.workspace_name),
    invitedRole: string(row.invited_role) as WorkspaceRole,
    appliedRole: string(row.applied_role) as WorkspaceRole,
    status: string(row.invitation_status) as WorkspaceInvitationStatus,
    alreadyAccepted: row.already_accepted === true,
  };
}

export async function revokeWorkspaceInvitation(inputActor: WorkspaceActor, invitationId: string): Promise<WorkspaceInvitationStatus> {
  const actor = cleanActor(inputActor);
  if (!z.string().uuid().safeParse(invitationId).success) throw new WorkspaceAccessError();
  const result = await db().rpc("revoke_workspace_invitation", {
    p_invitation_id: invitationId, p_actor_id: actor.userId, p_verified_email: actor.verifiedEmail,
  });
  if (result.error) failure(result.error, "The invitation could not be revoked");
  return string(result.data) as WorkspaceInvitationStatus;
}
