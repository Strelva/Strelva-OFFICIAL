import { NextResponse } from "next/server";
import { getAuthUserId, getCurrentUserTenants, isSuperAdmin } from "@/lib/auth";
import { getAllTenants, getTenantConfig, isActiveTenant } from "@/lib/tenants";
import { getTenantDashboardFallbackUrl } from "@/lib/tenant-urls";
import { isDevAccessBypassEnabled } from "@/lib/dev-access";
import type { TenantConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The properties (sites/businesses) the signed-in user can switch between in the
 * dashboard header. Super admins (and the dev bypass) see every active tenant;
 * everyone else sees the tenants they're a member of. Returns one entry per
 * property — the header switcher hides itself when there's only one.
 */
export async function GET() {
  const userId = await getAuthUserId();
  const dev = isDevAccessBypassEnabled();
  if (!userId && !dev) return NextResponse.json({ properties: [] });

  let configs: TenantConfig[];
  if (dev || (await isSuperAdmin())) {
    configs = (await getAllTenants()).filter(isActiveTenant);
  } else {
    const ids = await getCurrentUserTenants();
    const resolved = await Promise.all(ids.map((id) => getTenantConfig(id)));
    configs = resolved.filter((c): c is TenantConfig => !!c && isActiveTenant(c));
  }

  const properties = configs.map((c) => ({
    id: c.id,
    name: c.siteName || c.id,
    href: getTenantDashboardFallbackUrl(c),
  }));

  return NextResponse.json({ properties });
}
