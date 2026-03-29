import { auth, currentUser } from "@clerk/nextjs/server";

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

/** Check if current user has access to a specific tenant */
export async function hasTenantAccess(tenant: string): Promise<boolean> {
  // Super admins can access all tenants
  if (await isSuperAdmin()) return true;

  // For now, any authenticated user can access their tenant
  // TODO: add tenant-user mapping when multi-tenant scales
  return true;
}
