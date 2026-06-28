import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTenantFromHeaders } from "./tenant";
import { hasDashboardViewAccess } from "./auth";
import { getClientFallbackRoot, withClientFallbackRoot } from "./client-fallback";

/**
 * The standard guard for a dashboard page: resolve the tenant, confirm the
 * caller can view this dashboard, and redirect to /no-access otherwise. Returns
 * the tenant + the client-fallback root (for any further base-path-aware links).
 *
 * Replaces ~10 hand-copied copies of this block across the dashboard routes —
 * one of which had drifted to the wrong auth helper (`hasTenantAccess`) and
 * dead-ended the demo tour. One implementation = no drift.
 */
export async function requireDashboardView(): Promise<{ tenant: string; clientFallbackRoot: string }> {
  const clientFallbackRoot = getClientFallbackRoot(await headers());
  const tenant = await getTenantFromHeaders();
  if (!(await hasDashboardViewAccess(tenant))) {
    redirect(withClientFallbackRoot(clientFallbackRoot, "/no-access"));
  }
  return { tenant, clientFallbackRoot };
}
