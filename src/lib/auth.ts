import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getTenantConfig } from "./tenants";

/** Verify the current request is authenticated. Use in API routes. */
export async function verifyAuth(): Promise<boolean> {
  const { userId } = await auth();
  return !!userId;
}

/** Get the current user's email */
export async function getCurrentUserEmail(): Promise<string | null> {
  const user = await currentUser();
  return user?.emailAddresses?.[0]?.emailAddress || null;
}

/** Check if current user is the super admin (Laney) */
export async function isSuperAdmin(): Promise<boolean> {
  const email = await getCurrentUserEmail();
  const adminEmails = (process.env.SUPER_ADMIN_EMAILS || "").split(",").map((e) => e.trim()).filter(Boolean);
  return !!email && adminEmails.includes(email);
}

/** Auto-assign a user to a tenant if they have no tenants yet.
 *  This makes sign-up frictionless: sign up on rohlax.reb.studio → get rohlax access. */
async function autoAssignTenant(userId: string, tenant: string, existingTenants: string[]): Promise<boolean> {
  // Only auto-assign if tenant is valid and user has no tenants yet
  if (existingTenants.length > 0) return false;
  if (!(await getTenantConfig(tenant))) return false;

  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: { tenants: [tenant] },
    });
    return true;
  } catch {
    return false;
  }
}

/** Check if current user has access to a specific tenant.
 *  Uses Clerk publicMetadata.tenants (string[]) set per user.
 *  Auto-assigns first-time users to the tenant they signed up on. */
export async function hasTenantAccess(tenant: string): Promise<boolean> {
  if (await isSuperAdmin()) return true;

  const user = await currentUser();
  if (!user) return false;

  const tenants = (user.publicMetadata?.tenants as string[] | undefined) || [];
  if (tenants.includes(tenant)) return true;

  // Auto-assign first-time users to their tenant
  const assigned = await autoAssignTenant(user.id, tenant, tenants);
  return assigned;
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
