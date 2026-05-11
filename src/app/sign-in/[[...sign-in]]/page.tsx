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

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenantFromHeaders();
  const config = await getTenantConfig(tenant);
  const siteName = getTenantSiteName(tenant, config);

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
  const tenant = await getTenantFromHeaders();
  const config = await getTenantConfig(tenant);
  const siteName = getTenantSiteName(tenant, config);
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
