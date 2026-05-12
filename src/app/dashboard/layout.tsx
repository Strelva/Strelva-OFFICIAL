import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import { BillingBanner } from "@/components/dashboard/BillingBanner";
import { CapabilityProvider } from "@/components/dashboard/CapabilityGate";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { getActivity, getClickCounts, getContent } from "@/lib/storage";
import { getEffectiveSubscriptionStatus } from "@/lib/subscription";
import { getActorContext, hasTenantAccess } from "@/lib/auth";
import { getQueueCount } from "@/lib/events";
import { getTenantPrimaryDomain, getTenantPublicUrl, getTenantPublicUrlFromDomainMap } from "@/lib/tenant-urls";
import { isDevAccessBypassEnabled } from "@/lib/dev-access";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import { getTenantDeliveryModel, getTenantEditablePreviewUrl } from "@/lib/custom-repos";
import { getLocalClientPreviewUrl } from "@/lib/preview-target";
import { ConversationLayoutClient } from "./ConversationLayoutClient";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const devAccessBypass = isDevAccessBypassEnabled();
  const requestHeaders = await headers();
  const clientFallbackRoot = getClientFallbackRoot(requestHeaders);
  const { userId } = await auth();
  if (!userId && !devAccessBypass) {
    redirect(withClientFallbackRoot(clientFallbackRoot, "/sign-in"));
  }

  const tenant = await getTenantFromHeaders();
  const dashboardBasePath = clientFallbackRoot;

  const hasAccess = await hasTenantAccess(tenant);
  if (!hasAccess) {
    redirect(withClientFallbackRoot(clientFallbackRoot, "/no-access"));
  }
  const actor = await getActorContext(tenant);
  const tenantConfig = await getTenantConfig(tenant);
  const domainMapSiteUrl = getTenantPublicUrlFromDomainMap(tenant);
  const siteUrl = tenantConfig
    ? getTenantPublicUrl(tenantConfig, getTenantPrimaryDomain(tenantConfig) ? "production" : process.env.NODE_ENV)
    : domainMapSiteUrl;
  const liveSyncEnabled = Boolean(tenantConfig?.revalidateUrl && tenantConfig?.revalidationSecret);
  const requestHost = requestHeaders.get("host") || "";
  const requestProto = requestHeaders.get("x-forwarded-proto")
    || (requestHost.includes("localhost") ? "http" : "https");
  const requestOrigin = requestHost ? `${requestProto}://${requestHost}` : "";
  const localClientPreviewUrl = getLocalClientPreviewUrl({
    clientFallbackRoot,
    requestHost,
    requestProto,
  });
  const tenantEditablePreviewUrl = getTenantEditablePreviewUrl(tenantConfig, { requestOrigin, siteUrl });
  const shouldUseLocalClientPreviewUrl =
    Boolean(localClientPreviewUrl) &&
    (!tenantConfig || getTenantDeliveryModel(tenantConfig) !== "custom_repo");
  const previewUrl = shouldUseLocalClientPreviewUrl
    ? localClientPreviewUrl || ""
    : tenantEditablePreviewUrl;
  let siteName = "Your Business";
  let ownerName = "";
  try {
    const settings = await getContent("settings", tenant);
    siteName = settings.siteName || siteName;
    ownerName = settings.ownerName || ownerName;
  } catch {}

  const subscriptionStatus = await getEffectiveSubscriptionStatus(tenant);

  // Fetch queue count and stats
  const [pendingCount, pageViews, activity] = await Promise.all([
    getQueueCount(tenant),
    getClickCounts("page-view", tenant),
    getActivity(tenant, { actor: "ai" }),
  ]);
  const monthAgo = Date.now() - 30 * 86_400_000;
  const aiUpdatesThisMonth = activity.filter((entry) => new Date(entry.time).getTime() >= monthAgo).length;
  const valueProof = pageViews.thisWeek > 0
    ? `${pageViews.thisWeek} visitors this week`
    : `${aiUpdatesThisMonth} AI updates this month`;

  return (
    <DashboardProvider
      tenantId={tenant}
      siteUrl={siteUrl}
      siteModel={tenantConfig?.template || "wellness"}
      previewUrl={previewUrl}
      liveSyncEnabled={liveSyncEnabled}
      dashboardBasePath={dashboardBasePath}
      autoPublish={tenantConfig?.autoPublish !== false}
      subscriptionStatus={subscriptionStatus}
      hasStripeCustomer={!!tenantConfig?.stripeCustomerId}
      planOverride={tenantConfig?.planOverride === "founder_comp" || tenant === "gldf" || tenant === "rohlax" ? "founder_comp" : null}
      impersonation={{
        isActive: actor.isImpersonating,
        actorEmail: actor.email,
        tenantId: tenant,
      }}
    >
      <CapabilityProvider>
        <BillingBanner subscriptionStatus={subscriptionStatus} />
        <ConversationLayoutClient
          ownerName={ownerName || siteName}
          pendingCount={pendingCount}
          valueProof={valueProof}
        >
          {children}
        </ConversationLayoutClient>
      </CapabilityProvider>
    </DashboardProvider>
  );
}
