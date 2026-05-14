import type { Metadata } from "next";
import { headers } from "next/headers";
import { getInvitedEmail, type InvitedEmailSearchParams } from "@/lib/invited-email";
import { isMarketingHost } from "@/lib/marketing-hosts";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantSiteName } from "@/lib/tenant-display";
import { getTenantConfig } from "@/lib/tenants";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import { SignInClient } from "./SignInClient";

async function getPostSignInUrl(): Promise<string> {
  const requestHeaders = await headers();
  const clientFallbackRoot = getClientFallbackRoot(requestHeaders);
  if (clientFallbackRoot) {
    return withClientFallbackRoot(clientFallbackRoot, "/dashboard");
  }

  const host = requestHeaders.get("host") || "";
  return isMarketingHost(host) ? "/account" : "/dashboard";
}

async function getSignInSiteName() {
  const requestHeaders = await headers();
  const explicitTenant = requestHeaders.get("x-tenant");
  const host = requestHeaders.get("host") || "";
  if (!explicitTenant && isMarketingHost(host)) return "Scaffold Web";

  const tenant = await getTenantFromHeaders();
  const config = await getTenantConfig(tenant);
  return getTenantSiteName(tenant, config);
}

export async function generateMetadata(): Promise<Metadata> {
  const siteName = await getSignInSiteName();

  return {
    title: `Sign in to ${siteName}`,
    description: "Sign in with the email address from your invite to access your website dashboard.",
  };
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<InvitedEmailSearchParams>;
}) {
  const params = await searchParams;
  const siteName = await getSignInSiteName();
  const postSignInUrl = await getPostSignInUrl();
  const invitedEmail = getInvitedEmail(params);

  return (
    <SignInClient
      invitedEmail={invitedEmail}
      siteName={siteName}
      postSignInUrl={postSignInUrl}
    />
  );
}
