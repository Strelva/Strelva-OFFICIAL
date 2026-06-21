import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasTenantAccess } from "@/lib/auth";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { SiteHealthCard } from "@/components/dashboard/SiteHealthCard";

export default async function HealthPage() {
  const clientFallbackRoot = getClientFallbackRoot(await headers());
  const tenant = await getTenantFromHeaders();
  const hasAccess = await hasTenantAccess(tenant);

  if (!hasAccess) {
    redirect(withClientFallbackRoot(clientFallbackRoot, "/no-access"));
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <EngagementTracker event="health-view" />
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-warm-black">Site Health</h1>
        <p className="mt-1 text-[13px] text-gray-muted">
          An automatic health check of your live site, refreshed daily. The same
          checks that power our free audit, run on your site.
        </p>
      </div>
      <SiteHealthCard />
    </div>
  );
}
