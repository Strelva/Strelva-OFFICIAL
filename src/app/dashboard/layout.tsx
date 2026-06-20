import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import { BillingBanner } from "@/components/dashboard/BillingBanner";
import { CapabilityProvider } from "@/components/dashboard/CapabilityGate";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { getActivity, getClickCounts, getContent } from "@/lib/storage";
import { getEffectiveSubscriptionStatus } from "@/lib/subscription";
import { claimPendingInviteForCurrentUser, getActorContext, getAuthUserId, hasTenantAccess } from "@/lib/auth";
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
  const tenant = await getTenantFromHeaders();
  const dashboardBasePath = clientFallbackRoot;
  // Public read-only demo: the `demo` tenant renders without a session so prospects
  // can see the product. Writes stay auth-gated (no session -> 401), so it's read-only.
  const isDemo = tenant === "demo";

  const userId = await getAuthUserId();
  if (!userId && !devAccessBypass && !isDemo) {
    redirect(withClientFallbackRoot(clientFallbackRoot, "/sign-in"));
  }

  const hasAccess = isDemo || (await hasTenantAccess(tenant));
  if (!hasAccess) {
    const claimedInvite = await claimPendingInviteForCurrentUser(tenant);
    if (claimedInvite) {
      redirect(withClientFallbackRoot(clientFallbackRoot, "/dashboard"));
    }
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
    : aiUpdatesThisMonth > 0
      ? `${aiUpdatesThisMonth} update${aiUpdatesThisMonth === 1 ? "" : "s"} this month`
      : "Your site is live";

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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[200] focus:rounded-md focus:bg-warm-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-surface-base"
        >
          Skip to content
        </a>
        {isDemo && (
          <div className="flex items-center justify-center gap-2 border-b border-accent/30 bg-accent-dim px-4 py-2 text-center text-[12px] text-warm-black">
            <span className="font-medium">You&apos;re viewing a live demo.</span>
            <a href="/access-request" className="font-semibold text-accent underline-offset-2 hover:underline">
              Get your own site &rarr;
            </a>
          </div>
        )}
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
