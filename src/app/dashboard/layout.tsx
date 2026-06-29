import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import { BillingBanner } from "@/components/dashboard/BillingBanner";
import { SessionKeeper } from "@/components/dashboard/SessionKeeper";
import { DashboardSurfacesProvider } from "@/components/dashboard/DashboardSurfacesContext";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { getConnections } from "@/lib/connections";
import { getVisibleSurfaces } from "@/lib/dashboard-surfaces";
import { getProducts } from "@/lib/products";
import { getContent } from "@/lib/storage";
import { getEffectiveSubscriptionStatus } from "@/lib/subscription";
import { claimPendingInviteForCurrentUser, getActorContext, getAuthUserId, hasTenantAccess } from "@/lib/auth";
import { getQueueCount } from "@/lib/events";
import { getTenantPrimaryDomain, getTenantPublicUrl, getTenantPublicUrlFromDomainMap } from "@/lib/tenant-urls";
import { isDevAccessBypassEnabled } from "@/lib/dev-access";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import { getTenantDeliveryModel, getTenantEditablePreviewUrl } from "@/lib/custom-repos";
import { getLocalClientPreviewUrl } from "@/lib/preview-target";
import { ConversationShell } from "@/components/dashboard/ConversationShell";

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

  // Suspended site: an inactive (non-demo) tenant shows a hold state to its
  // members instead of a half-working dashboard. Super-admins and the dev
  // bypass still get in to fix it; the demo tenant is intentionally inactive
  // and already renders read-only via isDemo above.
  if (
    tenantConfig?.active === false &&
    !isDemo &&
    !devAccessBypass &&
    !actor.isSuperAdmin
  ) {
    return <TenantSuspended siteName={tenantConfig.siteName || tenant} />;
  }
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
  try {
    const settings = await getContent("settings", tenant);
    siteName = settings.siteName || siteName;
  } catch {}

  const subscriptionStatus = await getEffectiveSubscriptionStatus(tenant);

  // Fetch queue count and connections. Each read is independently guarded: this
  // runs in the dashboard LAYOUT, so an unguarded throw (a Redis/Sanity blip)
  // would 500 every dashboard route at once. Degrade to safe defaults instead.
  const [pendingCount, connections, products] = await Promise.all([
    getQueueCount(tenant).catch(() => 0),
    getConnections(tenant).catch(() => []),
    getProducts(tenant).catch(() => []),
  ]);

  // The conditional tab set — big-4 presence pillars shown by business type +
  // what's connected. Falls back to a local-business default if config is missing.
  // Store shows when the tenant actually has products (the truth signal), not
  // just when a features flag is set — so a real ecom client always gets it.
  const surfaces = getVisibleSurfaces({
    tenantConfig: tenantConfig ?? { template: "wellness" },
    connections,
    hasCommerce: products.length > 0,
  });
  // The signed-in PERSON, for the sidebar's "Hello, {name}" account footer —
  // this is the login identity, NOT the tenant's owner-name setting, so a
  // super-admin sees their own name across every client they open. Falls back
  // to the email local-part, then "Noah" under the local dev bypass.
  const accountEmail = actor.email && actor.email.includes("@") ? actor.email : null;
  const isAdmin = actor.isSuperAdmin || devAccessBypass;
  const rawAccount =
    actor.name?.trim() ||
    (accountEmail ? accountEmail.split("@")[0] : "") ||
    (devAccessBypass ? "Noah" : "");
  const accountName = rawAccount
    ? rawAccount.charAt(0).toUpperCase() + rawAccount.slice(1)
    : isAdmin ? "Admin" : "there";

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
        actorEmail: accountEmail,
        actorName: accountName,
        isSuperAdmin: isAdmin,
        tenantId: tenant,
      }}
      // The public demo is read-only for prospects, but the internal dev-access
      // bypass (local only — never set in prod) gets full control so the team can
      // actually drive the demo (test chat + edits).
      readOnly={isDemo && !devAccessBypass}
    >
      <DashboardSurfacesProvider surfaces={surfaces}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[200] focus:rounded-md focus:bg-warm-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-surface-base"
        >
          Skip to content
        </a>
        {isDemo && !devAccessBypass && (
          <div className="flex items-center justify-center gap-2 border-b border-accent/30 bg-accent-dim px-4 py-2 text-center text-[12px] text-warm-black">
            <span className="font-medium">You&apos;re viewing a read-only live demo &mdash; editing is off.</span>
            <a href="/access-request" className="font-semibold text-accent underline-offset-2 hover:underline">
              Get your own site &rarr;
            </a>
          </div>
        )}
        {!isDemo && <SessionKeeper />}
        <BillingBanner subscriptionStatus={subscriptionStatus} />
        <ConversationShell
          businessName={siteName}
          accountName={accountName}
          accountEmail={accountEmail}
          isSuperAdmin={isAdmin}
          pendingCount={pendingCount}
        >
          {children}
        </ConversationShell>
      </DashboardSurfacesProvider>
    </DashboardProvider>
  );
}

function TenantSuspended({ siteName }: { siteName: string }) {
  return (
    <main className="marketing-root flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="font-[family-name:var(--font-display)] text-[24px] font-normal text-m-text">
          {siteName} is paused
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-m-text-2">
          This dashboard is on hold. Your site and data are safe. Reach out and
          we will get it switched back on.
        </p>
        <a
          href="mailto:hello@strelva.com?subject=Dashboard%20access"
          className="marketing-button-primary mt-6 inline-flex h-11 px-5 text-[14px]"
        >
          Contact Strelva
        </a>
      </div>
    </main>
  );
}
