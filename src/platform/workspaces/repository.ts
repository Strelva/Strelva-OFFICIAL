import { createHash, randomBytes } from "node:crypto";
import { getSupabase } from "@/lib/db/client";
import type { WorkspaceDb } from "./schema";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  type AcceptedHandoff,
  type Delegation,
  type Handoff,
  type HandoffPreview,
  type SavedWork,
  type SaveWorkInput,
  type Workspace,
  type WorkspaceActor,
  type WorkspaceKind,
  type WorkspaceRole,
} from "./types";

const MAX_WORK_PER_WORKSPACE = 500;
const MAX_PENDING_HANDOFFS = 50;
const HANDOFF_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

type DbRow = Record<string, unknown>;

type DbFailure = { message?: string; code?: string } | null;

const ACCESS_FAILURES = [
  "handoff_not_found",
  "handoff_recipient_mismatch",
  "verified_identity_required",
] as const;
const CONFLICT_FAILURES = [
  "handoff_expired",
  "handoff_revoked",
  "handoff_already_claimed",
  "handoff_source_invalid",
  "workspace_limit_reached",
  "saved_work_limit_reached",
  "pending_handoff_limit_reached",
] as const;

function workspaceDbFailure(error: DbFailure, fallback: string): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (ACCESS_FAILURES.some((value) => detail.includes(value))) {
    throw new WorkspaceAccessError();
  }
  if (CONFLICT_FAILURES.some((value) => detail.includes(value))) {
    throw new WorkspaceConflictError();
  }
  throw new WorkspaceStoreError(fallback);
}

function db(): WorkspaceDb {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Workspace storage is not configured");
  return client as unknown as WorkspaceDb;
}

function actor(input: WorkspaceActor): WorkspaceActor {
  const userId = input.userId?.trim();
  const verifiedEmail = input.verifiedEmail?.trim().toLowerCase();
  if (!userId || !verifiedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verifiedEmail)) {
    throw new WorkspaceAccessError("A verified signed-in identity is required");
  }
  return { userId, verifiedEmail };
}

function cleanName(value: string): string {
  const name = value.trim().slice(0, 120);
  if (!name) throw new WorkspaceStoreError("Workspace name is required");
  return name;
}

function cleanProductId(value: string, field: string): string {
  const clean = value.trim().toLowerCase();
  if (!ID_PATTERN.test(clean)) throw new WorkspaceStoreError(`${field} is invalid`);
  return clean;
}

function cleanEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new WorkspaceStoreError("Recipient email is invalid");
  }
  return email;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function mapWorkspace(row: DbRow, access: Workspace["access"] = "member", role?: WorkspaceRole): Workspace {
  return {
    id: asString(row.id),
    kind: asString(row.kind) as WorkspaceKind,
    name: asString(row.name),
    createdBy: asString(row.created_by),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    role,
    access,
  };
}

function mapWork(row: DbRow): SavedWork {
  return {
    id: asString(row.id),
    workspaceId: asString(row.workspace_id),
    productId: asString(row.product_id),
    resourceKind: asString(row.resource_kind),
    title: optionalString(row.title),
    payload: row.payload,
    input: row.input ?? undefined,
    sourceWorkId: optionalString(row.source_work_id),
    createdBy: asString(row.created_by),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapHandoff(row: DbRow): Handoff {
  return {
    id: asString(row.id),
    agencyWorkspaceId: asString(row.agency_workspace_id),
    sourceWorkId: asString(row.source_work_id),
    recipientEmail: asString(row.recipient_email),
    status: asString(row.status) as Handoff["status"],
    expiresAt: asString(row.expires_at),
    createdBy: asString(row.created_by),
    createdAt: asString(row.created_at),
    acceptedBy: optionalString(row.accepted_by),
    acceptedAt: optionalString(row.accepted_at),
    customerWorkspaceId: optionalString(row.customer_workspace_id),
    customerWorkId: optionalString(row.customer_work_id),
    delegationId: optionalString(row.delegation_id),
  };
}

function mapDelegation(row: DbRow): Delegation {
  return {
    id: asString(row.id),
    customerWorkspaceId: asString(row.customer_workspace_id),
    customerWorkId: asString(row.customer_work_id),
    agencyWorkspaceId: asString(row.agency_workspace_id),
    scope: ["work:read"],
    status: asString(row.status) as Delegation["status"],
    createdAt: asString(row.created_at),
    revokedAt: optionalString(row.revoked_at),
  };
}

async function directRole(userId: string, workspaceId: string): Promise<WorkspaceRole | null> {
  const { data, error } = await db().from("workspace_memberships")
    .select("role").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (error) workspaceDbFailure(error, "Workspace membership is unavailable");
  return data ? (asString((data as DbRow).role) as WorkspaceRole) : null;
}

async function agencyWorkspaceIds(userId: string): Promise<string[]> {
  const { data, error } = await db().from("workspace_memberships")
    .select("workspace_id, workspaces!inner(kind)").eq("user_id", userId).eq("workspaces.kind", "agency");
  if (error) workspaceDbFailure(error, "Agency memberships are unavailable");
  return (data ?? []).map((row) => asString((row as DbRow).workspace_id)).filter(Boolean);
}

async function requireMember(userId: string, workspaceId: string, roles?: WorkspaceRole[]): Promise<WorkspaceRole> {
  const role = await directRole(userId, workspaceId);
  if (!role || (roles && !roles.includes(role))) throw new WorkspaceAccessError();
  return role;
}

export async function listWorkspaces(input: WorkspaceActor): Promise<Workspace[]> {
  const a = actor(input);
  const { data: memberships, error } = await db().from("workspace_memberships")
    .select("role, workspaces!inner(*)").eq("user_id", a.userId);
  if (error) workspaceDbFailure(error, "Workspace list is unavailable");
  const direct = (memberships ?? []).map((membership) => {
    const row = membership as DbRow;
    return mapWorkspace(row.workspaces as DbRow, "member", asString(row.role) as WorkspaceRole);
  });

  const agencyIds = direct.filter((w) => w.kind === "agency").map((w) => w.id);
  if (!agencyIds.length) return direct;
  const { data: delegations, error: delegationError } = await db().from("workspace_delegations")
    .select("customer_workspace_id, workspaces!workspace_delegations_customer_workspace_id_fkey(*)")
    .in("agency_workspace_id", agencyIds).eq("status", "active");
  if (delegationError) workspaceDbFailure(delegationError, "Delegated workspaces are unavailable");
  const seen = new Set(direct.map((w) => w.id));
  for (const delegation of delegations ?? []) {
    const row = delegation as DbRow;
    const workspace = mapWorkspace(row.workspaces as DbRow, "delegated_read");
    if (!seen.has(workspace.id)) direct.push(workspace);
    seen.add(workspace.id);
  }
  return direct;
}

export async function ensurePersonalWorkspace(input: WorkspaceActor): Promise<Workspace> {
  const a = actor(input);
  const name = `${a.verifiedEmail.split("@")[0]}'s workspace`;
  const { data, error } = await db().rpc("create_owned_workspace", {
    p_user_id: a.userId, p_verified_email: a.verifiedEmail, p_kind: "personal", p_name: name,
  });
  if (error) workspaceDbFailure(error, "Personal workspace was not created");
  if (!data?.[0]) throw new WorkspaceStoreError("Personal workspace was not created");
  return mapWorkspace(data[0] as DbRow, "member", "owner");
}

export async function createAgencyWorkspace(input: WorkspaceActor, name: string): Promise<Workspace> {
  const a = actor(input);
  const { data, error } = await db().rpc("create_owned_workspace", {
    p_user_id: a.userId, p_verified_email: a.verifiedEmail,
    p_kind: "agency", p_name: cleanName(name),
  });
  if (error) workspaceDbFailure(error, "Agency workspace was not created");
  if (!data) throw new WorkspaceStoreError("Agency workspace was not created");
  if (!data[0]) throw new WorkspaceStoreError("Agency workspace was not created");
  return mapWorkspace(data[0] as DbRow, "member", "owner");
}

async function delegatedWorkIds(userId: string, workspaceId?: string): Promise<string[]> {
  const agencyIds = await agencyWorkspaceIds(userId);
  if (!agencyIds.length) return [];
  let query = db().from("workspace_delegations").select("customer_work_id")
    .in("agency_workspace_id", agencyIds).eq("status", "active");
  if (workspaceId) query = query.eq("customer_workspace_id", workspaceId);
  const { data, error } = await query;
  if (error) workspaceDbFailure(error, "Delegated work is unavailable");
  return (data ?? []).map((row) => asString((row as DbRow).customer_work_id)).filter(Boolean);
}

export async function listWork(input: WorkspaceActor, workspaceId: string): Promise<SavedWork[]> {
  const a = actor(input);
  const role = await directRole(a.userId, workspaceId);
  let query = db().from("saved_product_work").select("*").eq("workspace_id", workspaceId);
  if (!role) {
    const ids = await delegatedWorkIds(a.userId, workspaceId);
    if (!ids.length) throw new WorkspaceAccessError();
    query = query.in("id", ids);
  }
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(MAX_WORK_PER_WORKSPACE);
  if (error) workspaceDbFailure(error, "Saved work is unavailable");
  return (data ?? []).map((row) => mapWork(row as DbRow));
}

export async function getWork(input: WorkspaceActor, id: string): Promise<SavedWork | null> {
  const a = actor(input);
  const { data, error } = await db().from("saved_product_work").select("*").eq("id", id).maybeSingle();
  if (error) workspaceDbFailure(error, "Saved work is unavailable");
  if (!data) return null;
  const work = mapWork(data as DbRow);
  if (await directRole(a.userId, work.workspaceId)) return work;
  const delegated = await delegatedWorkIds(a.userId, work.workspaceId);
  if (!delegated.includes(id)) throw new WorkspaceAccessError();
  return work;
}

export async function assertCanSaveWork(input: WorkspaceActor, workspaceId: string): Promise<void> {
  const a = actor(input);
  await requireMember(a.userId, workspaceId);
  const { count, error } = await db().from("saved_product_work")
    .select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  if (error) workspaceDbFailure(error, "Saved work storage is unavailable");
  if ((count ?? 0) >= MAX_WORK_PER_WORKSPACE) throw new WorkspaceConflictError("Saved work limit reached");
}

export async function saveWork(input: WorkspaceActor, workspaceId: string, work: SaveWorkInput): Promise<SavedWork> {
  const a = actor(input);
  await assertCanSaveWork(a, workspaceId);
  const client = db();
  const title = work.title?.trim().slice(0, 160) || null;
  const { data, error } = await client.from("saved_product_work").insert({
    workspace_id: workspaceId,
    product_id: cleanProductId(work.productId, "productId"),
    resource_kind: cleanProductId(work.resourceKind, "resourceKind"),
    title,
    payload: work.payload,
    input: work.input ?? null,
    source_work_id: work.sourceWorkId ?? null,
    created_by: a.userId,
  }).select("*").single();
  if (error) workspaceDbFailure(error, "Work was not saved");
  if (!data) throw new WorkspaceStoreError("Work was not saved");
  return mapWork(data as DbRow);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createHandoff(input: WorkspaceActor, workId: string, recipientEmail: string): Promise<{ handoff: Handoff; token: string }> {
  const a = actor(input);
  const work = await getWork(a, workId);
  if (!work) throw new WorkspaceAccessError("Work not found");
  const role = await requireMember(a.userId, work.workspaceId);
  const { data: workspace, error: workspaceError } = await db().from("workspaces")
    .select("kind").eq("id", work.workspaceId).single();
  if (workspaceError || asString((workspace as DbRow).kind) !== "agency" || !["owner", "admin", "member"].includes(role)) {
    throw new WorkspaceAccessError("Only agency work can be handed off");
  }
  const { count, error: countError } = await db().from("workspace_handoffs")
    .select("id", { count: "exact", head: true }).eq("agency_workspace_id", work.workspaceId)
    .eq("status", "pending").gt("expires_at", new Date().toISOString());
  if (countError) workspaceDbFailure(countError, "Handoff storage is unavailable");
  if ((count ?? 0) >= MAX_PENDING_HANDOFFS) throw new WorkspaceConflictError("Pending handoff limit reached");
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await db().from("workspace_handoffs").insert({
    agency_workspace_id: work.workspaceId,
    source_work_id: work.id,
    recipient_email: cleanEmail(recipientEmail),
    token_hash: hashToken(token),
    status: "pending",
    expires_at: new Date(Date.now() + HANDOFF_LIFETIME_MS).toISOString(),
    created_by: a.userId,
  }).select("*").single();
  if (error) workspaceDbFailure(error, "Handoff was not created");
  if (!data) throw new WorkspaceStoreError("Handoff was not created");
  return { handoff: mapHandoff(data as DbRow), token };
}

async function handoffByToken(input: WorkspaceActor, token: string): Promise<DbRow> {
  const a = actor(input);
  const { data, error } = await db().from("workspace_handoffs")
    .select("*").eq("token_hash", hashToken(token)).maybeSingle();
  if (error) workspaceDbFailure(error, "Handoff is unavailable");
  if (!data || asString((data as DbRow).recipient_email) !== a.verifiedEmail) throw new WorkspaceAccessError("Handoff not found");
  const row = data as DbRow;
  const status = asString(row.status);
  const acceptedBy = optionalString(row.accepted_by);
  const pendingAndLive = status === "pending" && Date.parse(asString(row.expires_at)) > Date.now();
  const acceptedByActor = status === "accepted" && acceptedBy === a.userId;
  if (!pendingAndLive && !acceptedByActor) throw new WorkspaceAccessError("Handoff not found");
  return row;
}

export async function inspectHandoff(input: WorkspaceActor, token: string): Promise<HandoffPreview> {
  const row = await handoffByToken(input, token);
  const handoff = mapHandoff(row);
  const [{ data: workspace, error: workspaceError }, { data: work, error: workError }] = await Promise.all([
    db().from("workspaces").select("id,name,kind").eq("id", handoff.agencyWorkspaceId).single(),
    db().from("saved_product_work").select("*").eq("id", handoff.sourceWorkId).single(),
  ]);
  if (workspaceError || workError || !workspace || !work) throw new WorkspaceStoreError("Handoff preview is incomplete");
  const w = workspace as DbRow;
  const saved = mapWork(work as DbRow);
  return {
    id: handoff.id,
    agencyWorkspace: { id: asString(w.id), name: asString(w.name), kind: asString(w.kind) as WorkspaceKind },
    work: saved,
    recipientEmail: handoff.recipientEmail,
    status: handoff.status,
    expiresAt: handoff.expiresAt,
  };
}

export async function acceptHandoff(input: WorkspaceActor, token: string, allowAgencyAccess: boolean): Promise<AcceptedHandoff> {
  const a = actor(input);
  await handoffByToken(a, token);
  const { data, error } = await db().rpc("accept_workspace_handoff", {
    p_token_hash: hashToken(token), p_user_id: a.userId,
    p_verified_email: a.verifiedEmail, p_allow_agency_access: allowAgencyAccess,
  });
  if (error) workspaceDbFailure(error, "Handoff was not accepted");
  if (!data?.[0]) throw new WorkspaceStoreError("Handoff was not accepted");
  const row = data[0];
  return {
    handoffId: row.handoff_id,
    customerWorkspaceId: row.customer_workspace_id,
    customerWorkId: row.customer_work_id,
    delegationId: row.delegation_id ?? undefined,
    alreadyAccepted: row.already_accepted,
  };
}

export async function revokeHandoff(input: WorkspaceActor, id: string): Promise<boolean> {
  const a = actor(input);
  const { data, error } = await db().from("workspace_handoffs")
    .select("agency_workspace_id,status").eq("id", id).maybeSingle();
  if (error) workspaceDbFailure(error, "Handoff is unavailable");
  if (!data) return false;
  await requireMember(a.userId, asString((data as DbRow).agency_workspace_id), ["owner", "admin"]);
  if (asString((data as DbRow).status) !== "pending") return false;
  const { data: updated, error: updateError } = await db().from("workspace_handoffs")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: a.userId })
    .eq("id", id).eq("status", "pending").select("id");
  if (updateError) workspaceDbFailure(updateError, "Handoff could not be revoked");
  return Boolean(updated?.length);
}

export async function listAgencyHandoffs(input: WorkspaceActor, agencyWorkspaceId: string): Promise<Handoff[]> {
  const a = actor(input);
  await requireMember(a.userId, agencyWorkspaceId);
  const { data, error } = await db().from("workspace_handoffs")
    .select("*").eq("agency_workspace_id", agencyWorkspaceId).order("created_at", { ascending: false });
  if (error) workspaceDbFailure(error, "Agency handoffs are unavailable");
  return (data ?? []).map((row) => mapHandoff(row as DbRow));
}

export async function listAgencyDelegations(input: WorkspaceActor, agencyWorkspaceId: string): Promise<Delegation[]> {
  const a = actor(input);
  await requireMember(a.userId, agencyWorkspaceId);
  const { data, error } = await db().from("workspace_delegations")
    .select("*").eq("agency_workspace_id", agencyWorkspaceId).order("created_at", { ascending: false });
  if (error) workspaceDbFailure(error, "Agency delegations are unavailable");
  return (data ?? []).map((row) => mapDelegation(row as DbRow));
}

export async function listWorkDelegations(input: WorkspaceActor, workId: string): Promise<Delegation[]> {
  const a = actor(input);
  const work = await getWork(a, workId);
  if (!work) return [];
  await requireMember(a.userId, work.workspaceId, ["owner", "admin"]);
  const { data, error } = await db().from("workspace_delegations")
    .select("*").eq("customer_work_id", workId).order("created_at", { ascending: false });
  if (error) workspaceDbFailure(error, "Work delegations are unavailable");
  return (data ?? []).map((row) => mapDelegation(row as DbRow));
}

export async function revokeDelegation(input: WorkspaceActor, delegationId: string): Promise<boolean> {
  const a = actor(input);
  const { data, error } = await db().from("workspace_delegations")
    .select("*").eq("id", delegationId).maybeSingle();
  if (error) workspaceDbFailure(error, "Delegation is unavailable");
  if (!data) return false;
  const delegation = mapDelegation(data as DbRow);
  await requireMember(a.userId, delegation.customerWorkspaceId, ["owner", "admin"]);
  if (delegation.status !== "active") return false;
  const { data: updated, error: updateError } = await db().from("workspace_delegations")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: a.userId })
    .eq("id", delegationId).eq("status", "active").select("id");
  if (updateError) workspaceDbFailure(updateError, "Delegation could not be revoked");
  return Boolean(updated?.length);
}
