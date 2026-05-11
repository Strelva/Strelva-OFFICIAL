import { ClerkLoaded, ClerkLoading, SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { AuthDocumentTitle } from "@/components/AuthDocumentTitle";
import {
  getAuthSwitchUrl,
  getInvitedEmail,
  type InvitedEmailSearchParams,
} from "@/lib/invited-email";
import { isMarketingHost } from "@/lib/marketing-hosts";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantSiteName } from "@/lib/tenant-display";
import { getTenantConfig } from "@/lib/tenants";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";

async function getPostSignUpUrl(): Promise<string> {
  const requestHeaders = await headers();
  const clientFallbackRoot = getClientFallbackRoot(requestHeaders);
  if (clientFallbackRoot) {
    return withClientFallbackRoot(clientFallbackRoot, "/dashboard");
  }

  const host = requestHeaders.get("host") || "";
  return isMarketingHost(host) ? "/account" : "/dashboard";
}

async function getSignUpSiteName() {
  const tenant = await getTenantFromHeaders();
  const config = await getTenantConfig(tenant);
  return getTenantSiteName(tenant, config);
}

function getSignUpTitle(siteName: string) {
  return siteName === "Scaffold Web"
    ? "Create your dashboard account"
    : `Create your ${siteName} dashboard account`;
}

export async function generateMetadata(): Promise<Metadata> {
  const siteName = await getSignUpSiteName();

  return {
    title: getSignUpTitle(siteName),
    description: `Create your account with the exact email address from your ${siteName} invite.`,
  };
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<InvitedEmailSearchParams>;
}) {
  const params = await searchParams;
  const siteName = await getSignUpSiteName();
  const postSignUpUrl = await getPostSignUpUrl();
  const title = getSignUpTitle(siteName);
  const invitedEmail = getInvitedEmail(params);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 py-10"
      style={{ background: "#08080a" }}
    >
      <AuthDocumentTitle title={title} />
      <div className="max-w-md text-center">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#d4a052]">
          Scaffold Web
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-[#e8e8ec]">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#8e8e96]">
          Use the exact email address that received your invite. That is how we
          connect your account to the right website dashboard.
        </p>
        {invitedEmail ? (
          <p className="mt-4 rounded-md border border-[#2b2418] bg-[#15110b] px-3 py-2 text-sm text-[#d9c099]">
            Invited email: <span className="font-medium text-[#f1d7a5]">{invitedEmail}</span>
          </p>
        ) : null}
      </div>
      <ClerkLoading>
        <div className="w-full max-w-md rounded-xl border border-[#1c1c20] bg-[#0f0f12] p-6 text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border border-[#2b2418] border-t-[#d4a052]" />
          <p className="text-sm font-medium text-[#e8e8ec]">Loading secure signup...</p>
          <p className="mt-2 text-xs leading-5 text-[#8e8e96]">
            If this takes more than a few seconds, use the invited email or email jacob@scaffoldweb.com.
          </p>
        </div>
      </ClerkLoading>
      <ClerkLoaded>
        <SignUp
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "shadow-none !bg-[#0f0f12] border border-[#1c1c20]",
              headerTitle: "font-display !text-[#e8e8ec]",
              headerSubtitle: "!text-[#8e8e96]",
              socialButtonsBlockButton:
                "!bg-[#1c1c20] !border-[#26262b] !text-[#e8e8ec] hover:!bg-[#26262b]",
              formFieldLabel: "!text-[#8e8e96]",
              formFieldInput:
                "!bg-[#08080a] !border-[#26262b] !text-[#e8e8ec] focus:!border-[#d4a052]",
              formButtonPrimary: "!bg-[#d4a052] hover:!bg-[#c4903e] !text-[#08080a]",
              footerActionLink: "!text-[#d4a052] hover:!text-[#c4903e]",
              footerActionText: "!text-[#55555c]",
              dividerLine: "!bg-[#1c1c20]",
              dividerText: "!text-[#55555c]",
            },
          }}
          forceRedirectUrl={postSignUpUrl}
          fallbackRedirectUrl={postSignUpUrl}
          signInUrl={getAuthSwitchUrl("/sign-in", invitedEmail)}
          initialValues={invitedEmail ? { emailAddress: invitedEmail } : undefined}
        />
      </ClerkLoaded>
      <p className="max-w-md text-center text-sm leading-6 text-[#66666f]">
        If your invite email is missing, access does not appear after signup,
        or the signup form is not loading, email{" "}
        <a className="text-[#d4a052] underline-offset-4 hover:underline" href="mailto:jacob@scaffoldweb.com">
          jacob@scaffoldweb.com
        </a>{" "}
        and we&apos;ll get it connected.
      </p>
    </div>
  );
}
