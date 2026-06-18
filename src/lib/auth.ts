import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isDevAccessBypassEnabled } from "./dev-access";
import { consumeInvite, getInvite } from "./invites";
import { getTenantConfig } from "./tenants";
import { getRedis } from "./redis";

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

type ClerkPublicMetadata = {
  tenants?: unknown;
  tenantRoles?: unknown;
};

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

function getUserEmailAddresses(
  user: {
    emailAddresses?: Array<{
      emailAddress?: string | null;
      verification?: { status?: string | null } | null;
    }>;
  } | null
): string[] {
  const emails = new Set<string>();
  for (const emailRecord of user?.emailAddresses || []) {
    // CRITICAL: only trust VERIFIED emails. This set is used to claim pending
    // invites and to match the super-admin allowlist — if unverified emails
    // counted, an attacker could add victim@client.com (or an admin's email)
    // as an unverified secondary address and claim their tenant access /
    // super-admin. Clerk lets a user add an email before verifying it.
    if (emailRecord.verification?.status !== "verified") continue;
    const email = normalizeEmailAddress(emailRecord.emailAddress);
    if (email) emails.add(email);
  }
  return [...emails];
}

export function roleMeetsMinimum(role: ClientRole, minimum: ClientRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function parseTenantAccessMetadata(
  metadata: ClerkPublicMetadata | null | undefined
): TenantAccessGrant[] {
  const grants = new Map<string, ClientRole>();
  const tenantRoles =
    metadata?.tenantRoles && typeof metadata.tenantRoles === "object" && !Array.isArray(metadata.tenantRoles)
      ? (metadata.tenantRoles as Record<string, unknown>)
      : {};

  for (const [tenant, role] of Object.entries(tenantRoles)) {
    const normalizedTenant = normalizeTenant(tenant);
    if (!normalizedTenant) continue;
    grants.set(normalizedTenant, normalizeRole(role));
  }

  const tenants = metadata?.tenants;
  if (Array.isArray(tenants)) {
    for (const tenantValue of tenants) {
      if (typeof tenantValue === "string") {
        const tenant = normalizeTenant(tenantValue);
        if (tenant && !grants.has(tenant)) grants.set(tenant, "owner");
        continue;
      }

      if (tenantValue && typeof tenantValue === "object") {
        const record = tenantValue as Record<string, unknown>;
        const tenant = normalizeTenant(record.id ?? record.tenant ?? record.tenantId);
        if (tenant && !grants.has(tenant)) {
          grants.set(tenant, normalizeRole(record.role, "viewer"));
        }
      }
    }
  } else if (tenants && typeof tenants === "object") {
    for (const [tenant, role] of Object.entries(tenants as Record<string, unknown>)) {
      const normalizedTenant = normalizeTenant(tenant);
      if (normalizedTenant && !grants.has(normalizedTenant)) {
        grants.set(normalizedTenant, normalizeRole(role));
      }
    }
  }

  return [...grants.entries()].map(([tenant, role]) => ({ tenant, role }));
}

export function getRoleForTenantFromMetadata(
  metadata: ClerkPublicMetadata | null | undefined,
  tenant: string
): ClientRole | null {
  return parseTenantAccessMetadata(metadata).find((grant) => grant.tenant === tenant)?.role ?? null;
}

export function roleHasPermission(role: ClientRole, permission: TenantPermission): boolean {
  return roleMeetsMinimum(role, PERMISSION_MIN_ROLE[permission]);
}

/** Verify the current request is authenticated. Use in API routes. */
export async function verifyAuth(): Promise<boolean> {
  if (isDevAccessBypassEnabled()) return true;

  const { userId } = await auth();
  return !!userId;
}

/** Get the current user's email */
export async function getCurrentUserEmail(): Promise<string | null> {
  const user = await currentUser();
  return getUserEmailAddresses(user)[0] || null;
}

/** Check if current user is a super admin.
 *  Matches the allowlist against ALL of the user's Clerk emails, not just the
 *  primary — a founder whose primary Clerk email isn't the allowlisted one would
 *  otherwise silently lose admin. Consistent with the invite-claim path, which
 *  also iterates every email. */
export async function isSuperAdmin(): Promise<boolean> {
  if (isDevAccessBypassEnabled()) return true;

  const user = await currentUser();
  const emails = getUserEmailAddresses(user).map((e) => e.toLowerCase());
  if (emails.length === 0) return false;
  const adminEmails = (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return emails.some((email) => adminEmails.includes(email));
}

/** Resolve the current request actor for UI warnings and audit logs. */
export async function getActorContext(tenant?: string): Promise<ActorContext> {
  if (isDevAccessBypassEnabled()) {
    return {
      userId: "dev-access-bypass",
      email: "dev-access-bypass",
      type: "system",
      isSuperAdmin: false,
      isImpersonating: false,
    };
  }

  const { userId } = await auth();
  const user = await currentUser();
  // Use the verified-primary email for audit attribution (not the raw [0],
  // which a user could influence by reordering/adding unverified addresses).
  const email = getUserEmailAddresses(user)[0] || null;
  const admin = email ? await isSuperAdmin() : false;

  return {
    userId,
    email,
    type: admin ? "super_admin" : userId ? "user" : "anonymous",
    isSuperAdmin: admin,
    isImpersonating: Boolean(admin && tenant),
  };
}

/** Page size and hard cap for paginating Clerk's user list. The cap bounds the
 *  number of round-trips so a corrupted/runaway list can never loop forever;
 *  500 pages * 100 = 50k users, comfortably above any realistic tenant. */
const CLERK_USER_PAGE_SIZE = 100;
const CLERK_USER_PAGE_CAP = 500;

/** Return the Clerk user ids whose tenantRoles[tenant] === "owner".
 *  Paginates the full Clerk user list (super-admins are NOT owners and are
 *  intentionally excluded — the last-owner invariant is about tenant owners).
 *  Used to guard against demoting the final owner of a tenant. */
export async function getTenantOwnerUserIds(tenant: string): Promise<string[]> {
  const normalizedTenant = normalizeTenant(tenant);
  if (!normalizedTenant) return [];

  const client = await clerkClient();
  const ownerIds: string[] = [];

  for (let page = 0; page < CLERK_USER_PAGE_CAP; page += 1) {
    const offset = page * CLERK_USER_PAGE_SIZE;
    const result = await client.users.getUserList({
      limit: CLERK_USER_PAGE_SIZE,
      offset,
    });
    const users = result?.data ?? [];

    for (const user of users) {
      if (getRoleForTenantFromMetadata(user.publicMetadata, normalizedTenant) === "owner") {
        ownerIds.push(user.id);
      }
    }

    // Stop once a short page (or empty page) signals the list is exhausted.
    if (users.length < CLERK_USER_PAGE_SIZE) break;
  }

  return ownerIds;
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
  if (!(await getTenantConfig(tenant))) return false;

  const redis = getRedis();
  let ownerLockKey: string | null = null;
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    // Last-owner guard: only relevant when DEMOTING a current owner to a
    // non-owner role. Promotions and adding owners can never remove the last
    // owner, so skip the (paginated) owner count for them.
    const currentRole = getRoleForTenantFromMetadata(user.publicMetadata, tenant);
    if (currentRole === "owner" && role !== "owner") {
      // Serialize concurrent owner-demotions per tenant: without this, two
      // simultaneous demotions of different owners both read 2 owners, both pass
      // the not-sole check, and both apply — zeroing the tenant's owners (TOCTOU).
      // The loser of the lock is refused (retry-able) rather than risk a lockout.
      if (redis) {
        ownerLockKey = `tenant-owner-lock:${tenant}`;
        const got: unknown = await redis.set(ownerLockKey, userId, { nx: true, ex: 15 });
        if (got === null || got === undefined || got === false) {
          ownerLockKey = null;
          throw new LastOwnerError(tenant);
        }
      }
      const ownerIds = await getTenantOwnerUserIds(tenant);
      const isSoleOwner =
        ownerIds.length === 0 ||
        (ownerIds.length === 1 && ownerIds[0] === userId);
      if (isSoleOwner) {
        throw new LastOwnerError(tenant);
      }
    }

    const existingTenants = parseTenantAccessMetadata(user.publicMetadata).map((grant) => grant.tenant);
    const existingRoles =
      user.publicMetadata?.tenantRoles &&
      typeof user.publicMetadata.tenantRoles === "object" &&
      !Array.isArray(user.publicMetadata.tenantRoles)
        ? (user.publicMetadata.tenantRoles as Record<string, unknown>)
        : {};
    const tenants = existingTenants.includes(tenant) ? existingTenants : [...existingTenants, tenant];
    const tenantRoles = { ...existingRoles, [tenant]: role };

    await client.users.updateUserMetadata(userId, {
      publicMetadata: { tenants, tenantRoles },
    });
    return true;
  } catch (err) {
    // Surface the last-owner refusal to callers; the generic Clerk-failure path
    // still degrades to a boolean false.
    if (err instanceof LastOwnerError) throw err;
    return false;
  } finally {
    if (ownerLockKey && redis) await redis.del(ownerLockKey);
  }
}

/**
 * Recover from delayed/missed Clerk webhooks by claiming a pending invite for
 * the currently signed-in user's exact email address. This is intentionally
 * separate from hasTenantAccess so ordinary authorization checks never grant
 * access by side effect.
 */
export async function claimPendingInviteForCurrentUser(
  targetTenant?: string
): Promise<ClaimedInviteGrant | null> {
  if (isDevAccessBypassEnabled()) return null;

  const { userId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  if (!user) return null;

  for (const email of getUserEmailAddresses(user)) {
    const invite = await getInvite(email);
    if (!invite) continue;
    if (targetTenant && invite.tenant !== targetTenant) continue;

    const role = invite.role || "owner";
    const existingRole = getRoleForTenantFromMetadata(user.publicMetadata, invite.tenant);
    const needsAssignment = !existingRole || !roleMeetsMinimum(existingRole, role);
    if (needsAssignment) {
      const assigned = await assignUserToTenant(userId, invite.tenant, role);
      if (!assigned) continue;
    }

    await consumeInvite(email);
    return { email, tenant: invite.tenant, role };
  }

  return null;
}

/** Check if current user has access to a specific tenant.
 *  Uses Clerk publicMetadata.tenants (string[]) set per user.
 *  Tenants must be explicitly assigned via admin or access provisioning flow. */
export async function hasTenantAccess(tenant: string): Promise<boolean> {
  if (isDevAccessBypassEnabled()) return true;

  if (await isSuperAdmin()) return true;

  const user = await currentUser();
  if (!user) return false;

  return getRoleForTenantFromMetadata(user.publicMetadata, tenant) !== null;
}

export async function getTenantRole(tenant: string): Promise<ClientRole | "super_admin" | null> {
  if (isDevAccessBypassEnabled()) return "super_admin";
  if (await isSuperAdmin()) return "super_admin";

  const user = await currentUser();
  if (!user) return null;

  return getRoleForTenantFromMetadata(user.publicMetadata, tenant);
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
