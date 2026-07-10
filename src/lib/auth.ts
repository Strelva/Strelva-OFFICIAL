import { NextResponse } from "next/server";
import { isDevAccessBypassEnabled } from "./dev-access";
import { getTenantConfig } from "./tenants";
import { getRedis } from "./redis";
import { getSessionUser } from "./db/server-client";
import {
  getMembershipRole,
  listMembershipsForUser,
  listTenantOwnerIds,
  isSuperAdminUser,
  upsertMembership,
  getPendingInvite,
  markInviteClaimed,
  getUserByEmail,
} from "./db/repositories";

// ---------------------------------------------------------------------------
// AUTH BACKEND: Supabase Auth.
// Request-context auth runs against Supabase + the memberships/super_admins/
// invites tables. Invariants enforced: the verified-email gate (an unconfirmed
// email never grants a role or super-admin) + the last-owner guard.
// See docs/auth-tenancy-architecture.md + docs/supabase-migration-plan.md.
// ---------------------------------------------------------------------------

/** Supabase Auth user shape we rely on (subset of @supabase/supabase-js User). */
type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: { full_name?: string | null; name?: string | null } | null;
};

/** Best display name for a Supabase user (Google OAuth fills user_metadata). */
function supabaseDisplayName(user: SupabaseAuthUser): string | null {
  const meta = user.user_metadata;
  return meta?.full_name?.trim() || meta?.name?.trim() || null;
}

/** Verified email for a Supabase user, or null. Enforces the verified-email gate:
 *  an unconfirmed email never grants invite-claim or super-admin matching. */
function supabaseVerifiedEmail(user: SupabaseAuthUser): string | null {
  if (!user.email_confirmed_at) return null;
  return normalizeEmailAddress(user.email);
}

export const CLIENT_ROLES = ["viewer", "editor", "admin", "owner"] as const;
export type ClientRole = (typeof CLIENT_ROLES)[number];

export type TenantPermission =
  | "tenant:read"
  | "content:write"
  | "settings:write"
  | "domains:manage"
  | "billing:manage"
  | "team:manage"
  | "publishing:manage";

export type TenantAccessGrant = {
  tenant: string;
  role: ClientRole;
};

export type ClaimedInviteGrant = TenantAccessGrant & {
  email: string;
};

const ROLE_RANK: Record<ClientRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

const PERMISSION_MIN_ROLE: Record<TenantPermission, ClientRole> = {
  "tenant:read": "viewer",
  "content:write": "editor",
  "settings:write": "editor",
  "domains:manage": "owner",
  "billing:manage": "owner",
  "team:manage": "owner",
  "publishing:manage": "owner",
};

export interface ActorContext {
  userId: string | null;
  email: string | null;
  /** Display name from the auth provider (Google OAuth), or null. */
  name: string | null;
  type: "anonymous" | "user" | "super_admin" | "system";
  isSuperAdmin: boolean;
  isImpersonating: boolean;
}

/** Thrown when an assignment would leave a tenant with zero owners.
 *  Callers (e.g. the admin assign route) catch this to return a clear 409. */
export class LastOwnerError extends Error {
  constructor(public readonly tenant: string) {
    super(`Cannot demote the last owner of tenant "${tenant}"`);
    this.name = "LastOwnerError";
  }
}

function isClientRole(value: unknown): value is ClientRole {
  return typeof value === "string" && CLIENT_ROLES.includes(value as ClientRole);
}

function normalizeRole(value: unknown, fallback: ClientRole = "viewer"): ClientRole {
  return isClientRole(value) ? value : fallback;
}

function normalizeTenant(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tenant = value.trim();
  return tenant ? tenant : null;
}

function normalizeEmailAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function roleMeetsMinimum(role: ClientRole, minimum: ClientRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function roleHasPermission(role: ClientRole, permission: TenantPermission): boolean {
  return roleMeetsMinimum(role, PERMISSION_MIN_ROLE[permission]);
}

/** Verify the current request is authenticated. Use in API routes. */
export async function verifyAuth(): Promise<boolean> {
  if (isDevAccessBypassEnabled()) return true;
  return (await getSessionUser()) !== null;
}

/** The current user's id (Supabase auth.uid), or null. */
export async function getAuthUserId(): Promise<string | null> {
  if (isDevAccessBypassEnabled()) return "dev-access-bypass";
  const user = await getSessionUser();
  return user?.id ?? null;
}

/** Find an existing user's id by email (Supabase users table), or null if no
 *  account exists yet. Used by admin assign/invite flows to decide assign-now
 *  vs send-an-invite. */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const user = await getUserByEmail(email);
  return user?.id ?? null;
}

/** The tenants the current user has access to, from the memberships table.
 *  (Super-admins are handled by the caller via isSuperAdmin(); this returns
 *  only explicit memberships.) */
export async function getCurrentUserTenants(): Promise<string[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const memberships = await listMembershipsForUser(user.id);
  return memberships.map((m) => m.tenant_id);
}

/** Get the current user's verified email */
export async function getCurrentUserEmail(): Promise<string | null> {
  const user = await getSessionUser();
  return user ? supabaseVerifiedEmail(user) : null;
}

/** Check if current user is a super admin (via the super_admins table). */
export async function isSuperAdmin(): Promise<boolean> {
  if (isDevAccessBypassEnabled()) return true;

  const user = await getSessionUser();
  // Verified-email gate: an unconfirmed email never resolves to super-admin.
  if (!user || !user.email_confirmed_at) return false;
  return isSuperAdminUser(user.id);
}

/** Resolve the current request actor for UI warnings and audit logs. */
export async function getActorContext(tenant?: string): Promise<ActorContext> {
  if (isDevAccessBypassEnabled()) {
    return {
      userId: "dev-access-bypass",
      email: "dev-access-bypass",
      name: null,
      type: "system",
      isSuperAdmin: false,
      isImpersonating: false,
    };
  }

  const user = await getSessionUser();
  const email = user ? supabaseVerifiedEmail(user) : null;
  const admin = user?.email_confirmed_at ? await isSuperAdminUser(user.id) : false;
  return {
    userId: user?.id ?? null,
    email,
    name: user ? supabaseDisplayName(user) : null,
    type: admin ? "super_admin" : user ? "user" : "anonymous",
    isSuperAdmin: admin,
    isImpersonating: Boolean(admin && tenant),
  };
}

/** Return the user ids who own {tenant} (memberships where role === "owner").
 *  One indexed query (memberships_tenant_role_idx). Super-admins are NOT owners
 *  and are intentionally excluded — the last-owner invariant is about tenant
 *  owners. Used to guard against demoting the final owner of a tenant. */
export async function getTenantOwnerUserIds(tenant: string): Promise<string[]> {
  const normalizedTenant = normalizeTenant(tenant);
  if (!normalizedTenant) return [];
  return listTenantOwnerIds(normalizedTenant);
}

/** Upserts a `memberships` row, enforcing the last-owner guard + per-tenant
 *  Redis lock. `userId` here is the `users.id` (= auth.uid). */
async function assignUserToTenantSupabase(
  userId: string,
  tenant: string,
  role: ClientRole
): Promise<boolean> {
  const normalizedTenant = normalizeTenant(tenant);
  if (!normalizedTenant) return false;
  if (!(await getTenantConfig(normalizedTenant))) return false;

  const redis = getRedis();
  let ownerLockKey: string | null = null;
  try {
    const currentRole = await getMembershipRole(userId, normalizedTenant);
    // Last-owner guard: only when DEMOTING a current owner to a non-owner role.
    if (currentRole === "owner" && role !== "owner") {
      if (redis) {
        ownerLockKey = `tenant-owner-lock:${normalizedTenant}`;
        const got: unknown = await redis.set(ownerLockKey, userId, { nx: true, ex: 15 });
        if (got === null || got === undefined || got === false) {
          ownerLockKey = null;
          throw new LastOwnerError(normalizedTenant);
        }
      }
      const ownerIds = await listTenantOwnerIds(normalizedTenant);
      const isSoleOwner =
        ownerIds.length === 0 || (ownerIds.length === 1 && ownerIds[0] === userId);
      if (isSoleOwner) {
        throw new LastOwnerError(normalizedTenant);
      }
    }

    await upsertMembership({ user_id: userId, tenant_id: normalizedTenant, role });
    return true;
  } catch (err) {
    if (err instanceof LastOwnerError) throw err;
    return false;
  } finally {
    if (ownerLockKey && redis) await redis.del(ownerLockKey);
  }
}

/** Assign a user to a tenant. Call this from admin or access provisioning flows only.
 *  Do NOT call from hasTenantAccess — that creates a security hole.
 *
 *  Last-owner guard: refuses (throws LastOwnerError) when the assignment would
 *  demote the SOLE owner of {tenant} to a non-owner role, which would otherwise
 *  lock the tenant out of owner-only functions (billing/team/domains). Promoting
 *  or assigning additional owners is unaffected. */
export async function assignUserToTenant(
  userId: string,
  tenant: string,
  role: ClientRole = "owner"
): Promise<boolean> {
  return assignUserToTenantSupabase(userId, tenant, role);
}

/**
 * Recover from a delayed/missed provisioning webhook by claiming a pending
 * invite for the currently signed-in user's exact verified email address. This
 * is intentionally separate from hasTenantAccess so ordinary authorization
 * checks never grant access by side effect.
 */
export async function claimPendingInviteForCurrentUser(
  targetTenant?: string
): Promise<ClaimedInviteGrant | null> {
  if (isDevAccessBypassEnabled()) return null;

  const user = await getSessionUser();
  if (!user) return null;
  const email = supabaseVerifiedEmail(user); // verified-email gate
  if (!email) return null;

  const invite = await getPendingInvite(email, targetTenant);
  if (!invite) return null;

  const role = normalizeRole(invite.role, "owner");
  const existingRole = await getMembershipRole(user.id, invite.tenant_id);
  const needsAssignment =
    !existingRole || !roleMeetsMinimum(normalizeRole(existingRole), role);
  if (needsAssignment) {
    // Assign BEFORE marking claimed, so a failed assign leaves the invite
    // intact for retry.
    const assigned = await assignUserToTenant(user.id, invite.tenant_id, role);
    if (!assigned) return null;
  }

  await markInviteClaimed(email, invite.tenant_id);
  return { email, tenant: invite.tenant_id, role };
}

/** Check if current user has access to a specific tenant.
 *  Reads the memberships table. Tenants must be explicitly assigned via the
 *  admin or access provisioning flow. */
export async function hasTenantAccess(tenant: string): Promise<boolean> {
  if (isDevAccessBypassEnabled()) return true;

  if (await isSuperAdmin()) return true;

  const user = await getSessionUser();
  if (!user) return false;
  return (await getMembershipRole(user.id, tenant)) !== null;
}

/** The public, read-only showcase tenant. It renders without a session so
 *  prospects can tour the product. It must NEVER gain write access — keep this
 *  out of `hasTenantAccess` (which guards write APIs via requireTenantAccess). */
export function isPublicDemoTenant(tenant: string): boolean {
  return tenant === "demo";
}

/** View gate for dashboard PAGES (read-only render): real tenant access OR the
 *  public demo. Write APIs must keep using `hasTenantAccess`, never this. */
export async function hasDashboardViewAccess(tenant: string): Promise<boolean> {
  if (isPublicDemoTenant(tenant)) return true;
  return hasTenantAccess(tenant);
}

export async function getTenantRole(tenant: string): Promise<ClientRole | "super_admin" | null> {
  if (isDevAccessBypassEnabled()) return "super_admin";
  if (await isSuperAdmin()) return "super_admin";

  const user = await getSessionUser();
  if (!user) return null;
  const role = await getMembershipRole(user.id, tenant);
  return role ? normalizeRole(role) : null;
}

export async function hasTenantPermission(
  tenant: string,
  permission: TenantPermission
): Promise<boolean> {
  const role = await getTenantRole(tenant);
  if (role === "super_admin") return true;
  if (!role) return false;
  return roleHasPermission(role, permission);
}

/** Guard for API routes — returns a 403 Response if the user lacks tenant access.
 *  Usage: const denied = await requireTenantAccess(tenant); if (denied) return denied; */
export async function requireTenantAccess(tenant: string): Promise<NextResponse | null> {
  const allowed = await hasTenantAccess(tenant);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden: no access to this tenant" }, { status: 403 });
  }
  return null;
}

export async function requireTenantPermission(
  tenant: string,
  permission: TenantPermission
): Promise<NextResponse | null> {
  const allowed = await hasTenantPermission(tenant, permission);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }
  return null;
}
