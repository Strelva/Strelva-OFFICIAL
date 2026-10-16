import { getTenantConfig } from "@/lib/tenants";
import { AGENCY_IDENTITY_UNAVAILABLE, resolveTenantBrand } from "@/platform/agency-brand/server";
import { NoAccessView } from "@/experience/entry/AccountEntry";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { claimPendingInviteForCurrentUser, getAuthUserId } from "@/platform/infra/auth";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import { isDevAccessBypassEnabled } from "@/platform/infra/dev-access";

export default async function NoAccessPage() {
  const requestHeaders = await headers();
  const clientFallbackRoot = getClientFallbackRoot(requestHeaders);
  const targetTenant = requestHeaders.get("x-tenant") || clientFallbackRoot?.match(/^\/client\/([a-z0-9-]+)$/)?.[1] || undefined;
  const userId = await getAuthUserId();

  if (!userId && !isDevAccessBypassEnabled()) {
    redirect(withClientFallbackRoot(clientFallbackRoot, "/sign-in"));
  }

  if (userId) {
    const claimedInvite = await claimPendingInviteForCurrentUser(targetTenant);
    if (claimedInvite) {
      redirect(targetTenant ? withClientFallbackRoot(clientFallbackRoot, "/dashboard") : "/account");
    }
  }

  const tenant = targetTenant ? await getTenantConfig(targetTenant) : null;
  const brand = targetTenant ? tenant ? await resolveTenantBrand(targetTenant) : AGENCY_IDENTITY_UNAVAILABLE : undefined;
  return <NoAccessView businessName={tenant?.siteName || undefined} brand={brand} signInHref={withClientFallbackRoot(clientFallbackRoot, "/sign-in")} />;
}
