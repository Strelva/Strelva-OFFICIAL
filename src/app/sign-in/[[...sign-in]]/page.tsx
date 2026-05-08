import type { Metadata } from "next";
import { headers } from "next/headers";
import { isMarketingHost } from "@/lib/marketing-hosts";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { SignInClient } from "./SignInClient";

async function getPostSignInUrl(): Promise<"/account" | "/dashboard"> {
  const host = (await headers()).get("host") || "";
  return isMarketingHost(host) ? "/account" : "/dashboard";
}

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenantFromHeaders();
  const config = await getTenantConfig(tenant);
  const siteName = config?.siteName || "Scaffold Web";

  return {
    title: `Sign in to ${siteName}`,
    description: "Sign in with the email address from your invite to access your website dashboard.",
  };
}

export default async function SignInPage() {
  const tenant = await getTenantFromHeaders();
  const config = await getTenantConfig(tenant);
  const siteName = config?.siteName || "Scaffold Web";
  const postSignInUrl = await getPostSignInUrl();

  return <SignInClient siteName={siteName} postSignInUrl={postSignInUrl} />;
}
