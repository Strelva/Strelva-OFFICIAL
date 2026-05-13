import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isDevAccessBypassEnabled } from "./dev-access";
import { getTenantConfig } from "./tenants";

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
  return user?.emailAddresses?.[0]?.emailAddress || null;
}

/** Check if current user is a super admin */
export async function isSuperAdmin(): Promise<boolean> {
  if (isDevAccessBypassEnabled()) return true;

  const email = await getCurrentUserEmail();
  if (!email) return false;
  const adminEmails = (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email.toLowerCase());
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
  const email = user?.emailAddresses?.[0]?.emailAddress || null;
  const admin = email ? await isSuperAdmin() : false;

  return {
    userId,
    email,
    type: admin ? "super_admin" : userId ? "user" : "anonymous",
    isSuperAdmin: admin,
    isImpersonating: Boolean(admin && tenant),
  };
}

/** Assign a user to a tenant. Call this from admin or access provisioning flows only.
 *  Do NOT call from hasTenantAccess — that creates a security hole. */
export async function assignUserToTenant(
  userId: string,
  tenant: string,
  role: ClientRole = "owner"
): Promise<boolean> {
  if (!(await getTenantConfig(tenant))) return false;

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
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
  } catch {
    return false;
  }
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
