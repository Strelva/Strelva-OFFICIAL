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
  const targetTenant = requestHeaders.get("x-tenant") || undefined;
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

  return <StEntry helpHref="/workspace?view=help">
    <StHead title="You don’t have access to this site" meta="The business decides who can open its workspace." />
    <StNotice>You’re signed in, but this email is not connected to a Strelva dashboard yet. Use the exact email address that received your invite. The button below signs you out so you can choose that account.</StNotice>
    <UseInvitedEmailButton redirectUrl={withClientFallbackRoot(clientFallbackRoot, "/sign-in")} />
    <StTextButton href="/account" tone="accent">Choose another site</StTextButton>
    <p className="text-sm text-gray-muted">Need help connecting the right account? <StTextButton href="mailto:jacob@strelva.com">Email Jacob</StTextButton></p>
  </StEntry>;
}
