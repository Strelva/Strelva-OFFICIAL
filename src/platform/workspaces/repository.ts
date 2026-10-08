import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { getSupabase } from "@/platform/infra/db/client";
import type { WorkspaceDb } from "./schema";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceMakeSystemsError,
  WorkspaceStoreError,
  WORKSPACE_EXIT_STOPPED_MESSAGE,
  WORKSPACE_LIMIT_MESSAGE,
  type AcceptedHandoff,
  type Delegation,
  type Handoff,
  type HandoffDestination,
  type HandoffDestinationOption,
  type HandoffPreview,
  type SavedWork,
  type SaveWorkInput,
  type Workspace,
  type WorkspaceActor,
  type WorkspaceKind,
  type WorkspaceRole,
} from "./types";
import { rolesAllowing, type WorkspacePermission } from "./permissions";

const MAX_WORK_PER_WORKSPACE = 500;
const MAX_PENDING_HANDOFFS = 50;
const HANDOFF_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

type DbRow = Record<string, unknown>;

type DbFailure = { message?: string; code?: string } | null;

const ACCESS_FAILURES = [
  "handoff_not_found",
  "handoff_recipient_mismatch",
  "handoff_destination_membership_required",
  "verified_identity_required",
  // Raised by public.workspace_require inside the write RPCs.
  "workspace_membership_required",
  "workspace_permission_denied",
] as const;
const CONFLICT_FAILURES = [
  "handoff_expired",
  "handoff_revoked",
  "handoff_already_claimed",
  "handoff_destination_required",
  "handoff_destination_changed",
  "handoff_destination_invalid",
  "handoff_product_unsupported",
  "handoff_source_invalid",
  "workspace_limit_reached",
  "saved_work_limit_reached",
  "pending_handoff_limit_reached",
  "workspace_exit_future_work_blocked",
] as const;

function workspaceDbFailure(error: DbFailure, fallback: string): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (detail.includes("workspace_make_systems_required")) throw new WorkspaceMakeSystemsError();
  if (ACCESS_FAILURES.some((value) => detail.includes(value))) {
    throw new WorkspaceAccessError();
  }
  if (CONFLICT_FAILURES.some((value) => detail.includes(value))) {
    throw new WorkspaceConflictError(detail.includes("workspace_exit_future_work_blocked") ? WORKSPACE_EXIT_STOPPED_MESSAGE
      : detail.includes("workspace_limit_reached") ? WORKSPACE_LIMIT_MESSAGE : undefined);
  }
  throw new WorkspaceStoreError(fallback);
}

function db(): WorkspaceDb {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Workspace storage is not configured");
  return client as unknown as WorkspaceDb;
}

/** Untyped RPC access for the authority-checked write functions. */
function rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: DbFailure }> {
  const client = db() as unknown as {
    rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: DbFailure }>;
  };
  return client.rpc(name, args);
}

function firstRow(data: unknown): DbRow | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? row as DbRow : null;
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

/** First gate. The write RPCs re-check the same permission in SQL, under a
 * FOR SHARE lock on the membership row, inside the write's transaction. */
async function requirePermission(userId: string, workspaceId: string, permission: WorkspacePermission): Promise<WorkspaceRole> {
  return requireMember(userId, workspaceId, rolesAllowing(permission));
}

/** Current verified identity ∩ provider seat ∩ agency membership ∩ named staff.
 * This is website authority, not a direct business membership or a contacts grant. */
async function providerSeatWorkspaceIds(input: WorkspaceActor): Promise<string[]> {
  const a = actor(input);
  const { data, error } = await rpc("read_version_actor", {
    p_user_id: a.userId, p_verified_email: a.verifiedEmail,
  });
  if (error) workspaceDbFailure(error, "Provider seat access is unavailable");
  const result = z.object({ userId: z.string(), memberships: z.array(z.object({
    businessId: z.string().uuid(), role: z.enum(["owner", "admin", "member"]),
    via: z.enum(["membership", "provider_seat"]),
  })) }).safeParse(data);
  if (!result.success || result.data.userId !== a.userId) throw new WorkspaceStoreError("Provider seat access is unavailable");
  return result.data.memberships.filter(row => row.via === "provider_seat").map(row => row.businessId);
}

export async function providerSeatWorkspaceAccess(input: WorkspaceActor, workspaceId: string): Promise<boolean> {
  return (await providerSeatWorkspaceIds(input)).includes(workspaceId);
}

/** Website-only preflight. Each mutation's RPC rechecks authority under lock. */
export async function assertWorkspaceWebsiteAccess(input: WorkspaceActor, workspaceId: string): Promise<void> {
  const a = actor(input);
  if (await directRole(a.userId, workspaceId) || await providerSeatWorkspaceAccess(a, workspaceId)) return;
  throw new WorkspaceAccessError();
}

const isWebsiteWork = (work: Pick<SavedWork, "productId" | "resourceKind">) =>
  work.productId === "websites" && work.resourceKind === "website";

export async function listWorkspaces(input: WorkspaceActor): Promise<Workspace[]> {
  const a = actor(input);
  const { data: memberships, error } = await db().from("workspace_memberships")
    .select("role, workspaces!inner(*)").eq("user_id", a.userId);
  if (error) workspaceDbFailure(error, "Workspace list is unavailable");
  const direct = (memberships ?? []).map((membership) => {
    const row = membership as DbRow;
    return mapWorkspace(row.workspaces as DbRow, "member", asString(row.role) as WorkspaceRole);
  });

  const seatIds = await providerSeatWorkspaceIds(a);
  const seen = new Set(direct.map((w) => w.id));
  if (seatIds.length) {
    const { data: seats, error: seatError } = await db().from("workspaces")
      .select("*").in("id", seatIds).eq("kind", "customer");
    if (seatError) workspaceDbFailure(seatError, "Provider workspaces are unavailable");
    for (const row of seats ?? []) {
      const workspace = mapWorkspace(row as DbRow, "provider_seat");
      if (!seen.has(workspace.id)) direct.push(workspace);
      seen.add(workspace.id);
    }
  }
  const agencyIds = direct.filter((w) => w.kind === "agency").map((w) => w.id);
  if (!agencyIds.length) return direct;
  const { data: delegations, error: delegationError } = await db().from("workspace_delegations")
    .select("customer_workspace_id, workspaces!workspace_delegations_customer_workspace_id_fkey(*)")
    .in("agency_workspace_id", agencyIds).eq("status", "active");
  if (delegationError) workspaceDbFailure(delegationError, "Delegated workspaces are unavailable");
  for (const delegation of delegations ?? []) {
    const row = delegation as DbRow;
    const workspace = mapWorkspace(row.workspaces as DbRow, "delegated_read");
    if (!seen.has(workspace.id)) direct.push(workspace);
    seen.add(workspace.id);
  }
  return direct;
}

/** List customer businesses the signed-in actor currently belongs to. */
export async function listCustomerWorkspaces(input: WorkspaceActor): Promise<Workspace[]> {
  const a = actor(input);
  const { data, error } = await db().from("workspace_memberships")
    .select("role, workspaces!inner(*)")
    .eq("user_id", a.userId)
    .eq("workspaces.kind", "customer");
  if (error) workspaceDbFailure(error, "Customer businesses are unavailable");
  return (data ?? []).map((membership) => {
    const row = membership as DbRow;
    return mapWorkspace(row.workspaces as DbRow, "member", asString(row.role) as WorkspaceRole);
  });
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

/**
 * An accepted agency assignment grants access to its exact customer work row
 * for the duration of that assignment. It does not make the agency a member
 * of the customer workspace and is deliberately checked only for one work id.
 */
async function assignedAgencyWorkAccess(userId: string, verifiedEmail: string, workspaceId: string, workId: string): Promise<boolean> {
  const rpc = db() as unknown as {
    rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: DbFailure }>;
  };
  const { data, error } = await rpc.rpc("agency_can_read_assigned_work", {
    p_user_id: userId,
    p_verified_email: verifiedEmail,
    p_workspace_id: workspaceId,
    p_work_id: workId,
  });
  if (error) workspaceDbFailure(error, "Assigned work access is unavailable");
  return data === true;
}

/**
 * Provider delivery is part of the agency read grant. Callers that read an
 * assignment envelope must use the same exact active-delivery check as native
 * work reads, so revoking the installation also closes the assignment view.
 */
export async function agencyAssignedWorkAccess(input: WorkspaceActor, workspaceId: string, workId: string): Promise<boolean> {
  const a = actor(input);
  return assignedAgencyWorkAccess(a.userId, a.verifiedEmail, workspaceId, workId);
}

export async function listWork(input: WorkspaceActor, workspaceId: string): Promise<SavedWork[]> {
  const a = actor(input);
  const role = await directRole(a.userId, workspaceId);
  let query = db().from("saved_product_work").select("*").eq("workspace_id", workspaceId);
  if (!role) {
    const ids = await delegatedWorkIds(a.userId, workspaceId);
    const seat = await providerSeatWorkspaceAccess(a, workspaceId);
    if (!seat && !ids.length) throw new WorkspaceAccessError();
    if (!seat) query = query.in("id", ids);
    else if (!ids.length) query = query.eq("product_id", "websites").eq("resource_kind", "website");
    else {
      // Seat grants only website work. Explicit shared work keeps its existing grant.
      const safeIds = z.array(z.string().uuid()).parse(ids);
      query = query.or(`and(product_id.eq.websites,resource_kind.eq.website),id.in.(${safeIds.join(",")})`);
    }
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
  if (isWebsiteWork(work) && await providerSeatWorkspaceAccess(a, work.workspaceId)) return work;
  const delegated = await delegatedWorkIds(a.userId, work.workspaceId);
  if (delegated.includes(id) || await assignedAgencyWorkAccess(a.userId, a.verifiedEmail, work.workspaceId, id)) return work;
  throw new WorkspaceAccessError();
}

export async function assertCanSaveWork(input: WorkspaceActor, workspaceId: string, work?: Pick<SaveWorkInput, "productId" | "resourceKind">): Promise<void> {
  const a = actor(input);
  if (work && isWebsiteWork(work)) await assertWorkspaceWebsiteAccess(a, workspaceId);
  else await requirePermission(a.userId, workspaceId, "create_work");
  const { count, error } = await db().from("saved_product_work")
    .select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  if (error) workspaceDbFailure(error, "Saved work storage is unavailable");
  if ((count ?? 0) >= MAX_WORK_PER_WORKSPACE) throw new WorkspaceConflictError("Saved work limit reached");
}

/** Authorize a direct workspace member without consuming the saved-work cap. */
export async function assertWorkspaceMember(input: WorkspaceActor, workspaceId: string): Promise<void> {
  const a = actor(input);
  await requireMember(a.userId, workspaceId);
}

export async function saveWork(input: WorkspaceActor, workspaceId: string, work: SaveWorkInput): Promise<SavedWork> {
  const a = actor(input);
  await assertCanSaveWork(a, workspaceId, work);
  const title = work.title?.trim().slice(0, 160) || null;
  const { data, error } = await rpc("save_workspace_work", {
    p_workspace_id: workspaceId,
    p_user_id: a.userId,
    p_product_id: cleanProductId(work.productId, "productId"),
    p_resource_kind: cleanProductId(work.resourceKind, "resourceKind"),
    p_title: title,
    p_payload: work.payload,
    p_input: work.input ?? null,
    p_source_work_id: work.sourceWorkId ?? null,
  });
  if (error) workspaceDbFailure(error, "Work was not saved");
  const row = firstRow(data);
  if (!row) throw new WorkspaceStoreError("Work was not saved");
  return mapWork(row);
}

/**
 * How the actor relates to making Systems in this workspace, from
 * public.workspace_make_systems_authority: "operator" (Strelva staff with a
 * membership), "agency" (an active delegation into this business), "member"
 * (a direct member who may use but not make tools), or null.
 */
export type MakeSystemsAuthority = "operator" | "agency" | "member" | null;

export async function makeSystemsAuthority(input: WorkspaceActor, workspaceId: string): Promise<MakeSystemsAuthority> {
  const a = actor(input);
  const { data, error } = await rpc("workspace_make_systems_authority", { p_workspace_id: workspaceId, p_user_id: a.userId });
  if (error) workspaceDbFailure(error, "Workspace authority is unavailable");
  const value = Array.isArray(data) ? data[0] : data;
  return value === "operator" || value === "agency" || value === "member" ? value : null;
}

/** First gate for making or changing an internal tool. SQL rechecks on create. */
export async function assertCanMakeSystems(input: WorkspaceActor, workspaceId: string): Promise<"operator" | "agency"> {
  const authority = await makeSystemsAuthority(input, workspaceId);
  if (authority === "operator" || authority === "agency") return authority;
  if (authority === "member") throw new WorkspaceMakeSystemsError();
  throw new WorkspaceAccessError();
}

/**
 * Create an internal tool as its maker. An agency is not a direct member of
 * the business, so this path never needs create_work; public.save_system_work
 * checks the verified identity and make_systems under the same lock.
 */
export async function saveSystemWork(input: WorkspaceActor, workspaceId: string, work: SaveWorkInput): Promise<SavedWork> {
  const a = actor(input);
  const title = work.title?.trim().slice(0, 160) || null;
  const { data, error } = await rpc("save_system_work", {
    p_workspace_id: workspaceId,
    p_user_id: a.userId,
    p_verified_email: a.verifiedEmail,
    p_product_id: cleanProductId(work.productId, "productId"),
    p_resource_kind: cleanProductId(work.resourceKind, "resourceKind"),
    p_title: title,
    p_payload: work.payload,
    p_input: work.input ?? null,
    p_source_work_id: work.sourceWorkId ?? null,
  });
  if (error) workspaceDbFailure(error, "Work was not saved");
  const row = firstRow(data);
  if (!row) throw new WorkspaceStoreError("Work was not saved");
  return mapWork(row);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createHandoff(input: WorkspaceActor, workId: string, recipientEmail: string): Promise<{ handoff: Handoff; token: string }> {
  const a = actor(input);
  const work = await getWork(a, workId);
  if (!work) throw new WorkspaceAccessError("Work not found");
  if (work.productId === "applications" || work.resourceKind === "application") {
    throw new WorkspaceConflictError("Applications must use their definition install path before they can be handed off.");
  }
  await requirePermission(a.userId, work.workspaceId, "create_handoff");
  const { data: workspace, error: workspaceError } = await db().from("workspaces")
    .select("kind").eq("id", work.workspaceId).single();
  if (workspaceError || asString((workspace as DbRow).kind) !== "agency") {
    throw new WorkspaceAccessError("Only agency work can be handed off");
  }
  const { count, error: countError } = await db().from("workspace_handoffs")
    .select("id", { count: "exact", head: true }).eq("agency_workspace_id", work.workspaceId)
    .eq("status", "pending").gt("expires_at", new Date().toISOString());
  if (countError) workspaceDbFailure(countError, "Handoff storage is unavailable");
  if ((count ?? 0) >= MAX_PENDING_HANDOFFS) throw new WorkspaceConflictError("Pending handoff limit reached");
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await rpc("create_workspace_handoff", {
    p_user_id: a.userId,
    p_source_work_id: work.id,
    p_recipient_email: cleanEmail(recipientEmail),
    p_token_hash: hashToken(token),
    p_expires_at: new Date(Date.now() + HANDOFF_LIFETIME_MS).toISOString(),
  });
  if (error?.message?.includes("handoff_agency_only")) {
    throw new WorkspaceAccessError("Only agency work can be handed off");
  }
  if (error) workspaceDbFailure(error, "Handoff was not created");
  const row = firstRow(data);
  if (!row) throw new WorkspaceStoreError("Handoff was not created");
  return { handoff: mapHandoff(row), token };
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
  const a = actor(input);
  const row = await handoffByToken(a, token);
  const handoff = mapHandoff(row);
  const [{ data: workspace, error: workspaceError }, { data: work, error: workError }, destinations] = await Promise.all([
    db().from("workspaces").select("id,name,kind").eq("id", handoff.agencyWorkspaceId).single(),
    db().from("saved_product_work").select("*").eq("id", handoff.sourceWorkId).single(),
    listCustomerWorkspaces(a),
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
    destinations: destinations.map((destination): HandoffDestinationOption => ({ id: destination.id, name: destination.name })),
  };
}

export async function acceptHandoff(input: WorkspaceActor, token: string, destination: HandoffDestination, allowAgencyAccess: boolean): Promise<AcceptedHandoff> {
  const a = actor(input);
  await handoffByToken(a, token);
  const customerWorkspaceId = destination.kind === "existing" ? destination.workspaceId : null;
  const customerWorkspaceName = destination.kind === "new" ? destination.name : null;
  const { data, error } = await db().rpc("accept_workspace_handoff", {
    p_token_hash: hashToken(token), p_user_id: a.userId,
    p_verified_email: a.verifiedEmail,
    p_customer_workspace_id: customerWorkspaceId,
    p_customer_workspace_name: customerWorkspaceName,
    p_allow_agency_access: allowAgencyAccess,
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
  await requirePermission(a.userId, asString((data as DbRow).agency_workspace_id), "manage_handoffs");
  if (asString((data as DbRow).status) !== "pending") return false;
  const { data: revoked, error: revokeError } = await rpc("revoke_workspace_handoff", {
    p_handoff_id: id,
    p_user_id: a.userId,
  });
  if (revokeError) workspaceDbFailure(revokeError, "Handoff could not be revoked");
  return revoked === true;
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
  await requirePermission(a.userId, work.workspaceId, "manage_delegations");
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
  await requirePermission(a.userId, delegation.customerWorkspaceId, "manage_delegations");
  if (delegation.status !== "active") return false;
  const { data: revoked, error: revokeError } = await rpc("revoke_workspace_delegation", {
    p_delegation_id: delegationId,
    p_user_id: a.userId,
  });
  if (revokeError) workspaceDbFailure(revokeError, "Delegation could not be revoked");
  return revoked === true;
}

/** Only the initiating person can resume an incomplete assessment. */
export async function listPendingAssessments(input: WorkspaceActor, workspaceId: string) {
  const a = actor(input);
  await requireMember(a.userId, workspaceId);
  const { data, error } = await db().from("workspace_operations").select("id,status,created_at")
    .eq("workspace_id", workspaceId).eq("created_by", a.userId).eq("product_id", "ai_visibility")
    .in("status", ["running", "ready", "failed"]).order("created_at", { ascending: false }).limit(20);
  if (error) workspaceDbFailure(error, "Assessment recovery is unavailable");
  return (data || []).map(row => ({ id: asString(row.id), status: asString(row.status), createdAt: asString(row.created_at) }));
}
