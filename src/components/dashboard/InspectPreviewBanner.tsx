import { Eye } from "lucide-react";
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
    <div className="flex items-start gap-2.5 border-b border-warning/30 bg-warning/12 px-4 py-2.5 text-warning">
      <Eye className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={1.7} />
      <p className="text-[12px] leading-relaxed">
        <span className="font-semibold text-warning">Preview</span>:{" "}
        {tenantName} doesn&apos;t have {`${featureLabel} enabled`}. You&apos;re
        inspecting it as an operator; the client doesn&apos;t see this.
      </p>
    </div>
  );
}
