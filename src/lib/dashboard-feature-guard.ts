import { notFound } from "next/navigation";
import { requireDashboardView } from "./dashboard-auth";
import { getTenantConfig } from "./tenants";
import { isInspecting } from "./inspect-mode";

/**
 * Gate a feature-specific dashboard page: authenticate the viewer, then require that
 * the tenant actually has the feature enabled in `features[]` — otherwise 404, so a
 * tab that's hidden in the nav also can't be reached by URL. Use this for vertical-set
 * surfaces (schedule/members/…) so route access matches nav visibility, especially once
 * these pages carry real studio data.
 *
 * Inspect-mode bypass: when the tenant lacks the feature but the caller is a
 * super-admin inspecting (cookie + isSuperAdmin re-verified in isInspecting()), the
 * page renders as a read-only PREVIEW (`preview: true`) instead of 404. A real client
 * (non-super-admin) still 404s exactly as before — the cookie alone grants nothing.
 */
export async function requireDashboardFeature(
  featureId: string
): Promise<{ tenant: string; preview?: boolean }> {
  const { tenant } = await requireDashboardView();
  const config = await getTenantConfig(tenant).catch(() => null);
  const features = (config?.features ?? []) as string[];
  if (!features.includes(featureId)) {
    if (await isInspecting()) return { tenant, preview: true };
    notFound();
  }
  return { tenant };
}
