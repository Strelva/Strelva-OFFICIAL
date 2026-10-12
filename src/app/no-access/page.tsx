import { getTenantConfig } from "@/lib/tenants";
import { AGENCY_IDENTITY_UNAVAILABLE, resolveTenantBrand } from "@/platform/agency-brand/server";
import { StEntry, StHead, StNotice, StTextButton } from "@/components/ui/strelva/Kit";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { UseInvitedEmailButton } from "@/components/auth/UseInvitedEmailButton";
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
  return <StEntry brand={brand} helpHref="/workspace?view=help">
    <StHead title={tenant?.siteName ? `You don’t have access to ${tenant.siteName}` : "You don’t have access to this business"} meta="The business decides who can open its workspace." />
    <StNotice>You’re signed in, but this email isn’t a member of this business’s workspace. Use the exact email address that received your invite. The button below signs you out so you can choose that account.</StNotice>
    {brand ? <p className="text-sm text-gray-muted">Runs on Strelva. Same account as strelva.com.</p> : null}
    <UseInvitedEmailButton redirectUrl={withClientFallbackRoot(clientFallbackRoot, "/sign-in")} />
    <StTextButton href="/account" tone="accent">Choose another business</StTextButton>
    <p className="text-sm text-gray-muted">Need help connecting the right account? <StTextButton href="mailto:jacob@strelva.com">Email Jacob</StTextButton></p>
  </StEntry>;
}
