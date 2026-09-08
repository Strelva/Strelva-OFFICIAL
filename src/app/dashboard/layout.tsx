import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import { BillingBanner } from "@/components/dashboard/BillingBanner";
import { SessionKeeper } from "@/components/dashboard/SessionKeeper";
import { DashboardSurfacesProvider } from "@/components/dashboard/DashboardSurfacesContext";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantSiteName } from "@/lib/tenant-display";
import { getConnections } from "@/lib/connections";
import { getVisibleSurfaces, tenantHasStore } from "@/lib/dashboard-surfaces";
import { getProducts } from "@/lib/products";
import { getContent } from "@/lib/storage";
import { getEffectiveSubscriptionStatus } from "@/lib/subscription";
import { claimPendingInviteForCurrentUser, getActorContext, getAuthUserId, hasTenantAccess } from "@/lib/auth";
import { getQueueCount } from "@/lib/events";
import { getTenantPrimaryDomain, getTenantPublicUrl, getTenantPublicUrlFromDomainMap } from "@/lib/tenant-urls";
import { isDevAccessBypassEnabled } from "@/lib/dev-access";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import { isInspecting } from "@/lib/inspect-mode";
import { getTenantDeliveryModel, getTenantEditablePreviewUrl } from "@/lib/custom-repos";
import { getLocalClientPreviewUrl } from "@/lib/preview-target";
import { ConversationShell } from "@/components/dashboard/ConversationShell";
import { planByKey } from "@/lib/billing-plans";
import { resolveLegacyManagedPresence } from "@/products/managed-presence";
import { resolveRelationship } from "@/platform/relationships";

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
  // Relationship status is contextual display metadata. The legacy dashboard
  // adapter treats a resolved non-demo TenantConfig as managed-presence service
  // context; it never promotes a personal account or membership by itself,
  // and the demo is intentionally excluded from Client status.
  const legacyManagedPresence = resolveLegacyManagedPresence(tenantConfig);
  const relationship = resolveRelationship({
    context: { kind: "tenant", tenantId: tenant },
    serviceRelationship: legacyManagedPresence.serviceRelationship,
    paidStanding: tenantConfig?.billingType === "case_study" || tenantConfig?.planOverride === "founder_comp"
      ? "comped"
      : tenantConfig?.subscriptionStatus ?? "none",
  });

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
  const hostname = requestHost.toLowerCase().split(":")[0];
  const appBase = hostname === "localhost" || hostname === "127.0.0.1" || hostname?.endsWith(".localhost") || hostname === "app.strelva.com" || hostname?.endsWith(".vercel.app")
    ? "" : "https://app.strelva.com";
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
  // Resolve the real business name (config.siteName, known-tenant name, or the
  // owner name) instead of a generic "Your Business" when the content settings
  // haven't set a site name yet. The editable content siteName still wins.
  let siteName = getTenantSiteName(tenant, tenantConfig ?? undefined);
  let settingsBusinessModel = "";
  let businessLogoUrl = "";
  try {
    const settings = await getContent("settings", tenant);
    // Ignore the "Your Business" default placeholder (defaults.ts) — an unset
    // content siteName falls back to it, which would otherwise mask the real
    // resolved business name.
    if (settings.siteName && settings.siteName !== "Your Business") siteName = settings.siteName;
    settingsBusinessModel = settings.businessModel || "";
    businessLogoUrl = settings.logoUrl || "";
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

  // Whether this tenant runs a storefront — drives the Store sub-tab in the one
  // Website sub-nav (rendered once in the shell so it's stable across every
  // Website sub-route, including /dashboard/store).
  const hasStore = tenantHasStore({
    tenantConfig: { features: tenantConfig?.features },
    hasCommerce: products.length > 0,
  });

  // The conditional tab set — the presence pillars shown by business type +
  // what's connected. Falls back to a local-business default if config is missing.
  // An explicit "business type" from Business info (Local/Online/Both) wins over
  // the template guess, so an online-only brand never sees Google Business or
  // Reviews surfaces it can't use. (Store is a sub-tab inside Website, resolved
  // per-page, not a top-level surface.)
  const businessModel =
    settingsBusinessModel === "local" || settingsBusinessModel === "online" || settingsBusinessModel === "hybrid"
      ? settingsBusinessModel
      : undefined;
  // Super-admin inspect mode: re-verified server-side (cookie + isSuperAdmin) — a
  // real client always resolves false. When on, the nav surfaces every vertical-set
  // tab (the not-enabled ones marked preview) so the operator can open any surface.
  const inspect = await isInspecting();
  const surfaces = getVisibleSurfaces({
    tenantConfig: {
      ...(tenantConfig ?? { template: "wellness" }),
      ...(businessModel ? { businessModel } : {}),
    },
    connections,
    inspect,
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
  const commercialPlan = planByKey(tenantConfig?.subscriptionPlan);

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
      commercialPlanLabel={commercialPlan.label}
      commercialPlanMonthlyCents={tenantConfig?.planMonthlyCents ?? commercialPlan.monthly * 100}
      relationship={relationship}
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
          appBase={appBase}
          signedIn={Boolean(userId) || devAccessBypass}
          businessName={siteName}
          businessLogoUrl={businessLogoUrl}
          accountName={accountName}
          accountEmail={accountEmail}
          isSuperAdmin={isAdmin}
          pendingCount={pendingCount}
          hasStore={hasStore}
          inspect={inspect}
          inspectTenantName={siteName}
          inspectExitHref={`/api/admin/inspect?on=0&to=${encodeURIComponent(`/admin/clients/${tenant}`)}`}
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
        <h1 className="font-display text-[24px] font-normal text-m-text">
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
