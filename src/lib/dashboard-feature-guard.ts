import { notFound } from "next/navigation";
import { requireDashboardView } from "./dashboard-auth";
import { getTenantConfig } from "./tenants";

/**
 * Gate a feature-specific dashboard page: authenticate the viewer, then require that
 * the tenant actually has the feature enabled in `features[]` — otherwise 404, so a
 * tab that's hidden in the nav also can't be reached by URL. Use this for vertical-set
 * surfaces (schedule/members/…) so route access matches nav visibility, especially once
 * these pages carry real studio data.
 */
export async function requireDashboardFeature(featureId: string): Promise<{ tenant: string }> {
  const { tenant } = await requireDashboardView();
  const config = await getTenantConfig(tenant).catch(() => null);
  const features = (config?.features ?? []) as string[];
  if (!features.includes(featureId)) notFound();
  return { tenant };
}
