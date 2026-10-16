import { DashNote } from "./xa/DashboardXa";
import { getTenantConfig } from "@/lib/tenants";
import { FEATURE_REGISTRY } from "@/lib/features/registry";

/**
 * Rendered at the top of a feature-gated surface (Schedule/Roster/Members/Packages)
 * that a super-admin is inspecting even though the tenant hasn't enabled it. Makes it
 * unmistakable that this is an operator-only preview, not something the client sees.
 *
 * Only ever rendered when `requireDashboardFeature` returned `{ preview: true }`,
 * which requires isSuperAdmin() re-verified server-side — so a real client never
 * reaches this. Resolves the business name + feature label itself to keep the gated
 * pages a single line.
 */
export async function InspectPreviewBanner({
  tenant,
  featureId,
}: {
  tenant: string;
  featureId: string;
}) {
  const config = await getTenantConfig(tenant).catch(() => null);
  const tenantName = config?.siteName || config?.ownerName || tenant;
  const featureLabel =
    FEATURE_REGISTRY.find((f) => f.id === featureId)?.label ?? featureId;

  return (
    <div className="px-4 pt-4 md:px-[88px]">
      <DashNote tone="waits">
        {tenantName} doesn&apos;t have {featureLabel} on. You are seeing it as Strelva; the owner doesn&apos;t.
      </DashNote>
    </div>
  );
}
