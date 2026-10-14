import { authEmailReady } from "@/components/auth/email-readiness";
import { invitationEntryIdentity } from "@/server/agency-brand-entry";
import { AGENCY_IDENTITY_UNAVAILABLE, resolveTenantBrand } from "@/platform/agency-brand/server";
import { StEntry, StHead, StPillLink, StTextButton } from "@/components/ui/strelva/Kit";
import type { Metadata } from "next";
import { SupabaseSignIn } from "@/components/auth/SupabaseSignIn";
import { StChoiceLink } from "@/components/ui/strelva/ChoiceCards";
import { headers } from "next/headers";
import { getClientFallbackRoot, isClientFallbackRoot } from "@/lib/client-fallback";
import { getInvite } from "@/lib/invites";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantSiteName } from "@/lib/tenant-display";
import { getStoredContent } from "@/lib/storage/content-store";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { AGENCY_START_PATH, agencySignupReleaseEnabled } from "@/platform/agency-signup-release";
import { businessSignupReleaseEnabled } from "@/platform/business-signup-release";
import { BUSINESS_SIGNUP_PATH } from "@/platform/workspaces/business-start";
import { tenantSignInNext } from "@/platform/owner-entry/env";
import { accountReturnTarget, workspaceInvitationReturnTarget, workspaceReturnTarget } from "@/platform/workspaces/location";

export const metadata: Metadata = {
  title: "Create your Strelva account",
  description: "Create a Strelva account to run your business yourself, or to run it for clients.",
};

export const dynamic = "force-dynamic";

type AuthSearchParams = Record<string, string | string[] | undefined>;

function searchValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function normalizeEmail(value: string | null): string | null {
  const email = value?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function getInviteContext(searchParams: AuthSearchParams) {
  const email = normalizeEmail(searchValue(searchParams.email));
  if (!email) return null;

  const invite = await getInvite(email);
  if (!invite) return null;

  const tenantConfig = await getTenantConfig(invite.tenant);
  if (!tenantConfig || tenantConfig.active === false) return null;

  return {
    email,
    siteName: tenantConfig.siteName || invite.tenant,
    brand: await resolveTenantBrand(invite.tenant),
  };
}

async function getTenantAuthContext() {
  const requestHeaders = await headers();
  const tenant =
    requestHeaders.get("x-tenant") ||
    requestHeaders.get("x-client-fallback-root")?.match(/^\/client\/([a-z0-9-]+)$/)?.[1] ||
    null;

  if (!tenant) return null;

  const tenantConfig = await getTenantConfig(tenant);
  if (!tenantConfig || tenantConfig.active === false) return null;

  // A missing or unavailable site theme is normal at entry. Never borrow the
  // generic template brand just because this business has no saved theme.
  const theme = tenantConfig ? await getStoredContent("theme", tenant).catch(() => null) : null;
  const clientFallbackRoot = getClientFallbackRoot(requestHeaders);
  return {
    tenant,
    brand: await resolveTenantBrand(tenant),
    clientFallbackRoot: isClientFallbackRoot(clientFallbackRoot) ? clientFallbackRoot : `/client/${tenant}`,
    siteName: getTenantSiteName(tenant, tenantConfig || undefined),
    host: requestHeaders.get("host") || undefined,
    brandFontFamily: theme?.fontDisplay?.trim().replaceAll("_", " ") || undefined,
  };
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<AuthSearchParams>;
}) {
  const params = await searchParams;
  const workspaceOpen = workspaceReleaseEnabled();
  const requestedNext = searchValue(params.next);
  const workspaceTarget = workspaceOpen ? workspaceReturnTarget(requestedNext) : null;
  const invitationTarget = workspaceOpen ? workspaceInvitationReturnTarget(requestedNext) : null;
  const accountTarget = workspaceOpen ? accountReturnTarget(requestedNext) : null;
  const invite = await getInviteContext(params);

  if (invite) return <StEntry brand={invite.brand} helpHref="/workspace?view=help"><SupabaseSignIn emailReady={authEmailReady()} heading={<StHead title={`Create access for ${invite.siteName}`} meta={`Use ${invite.email}, the email your invitation was sent to.`} />} next={workspaceTarget ? `/account?next=${encodeURIComponent(workspaceTarget)}` : accountTarget || "/account"} prefillEmail={invite.email} /><p className="text-sm text-gray-muted">Runs on Strelva. Same account as strelva.com.</p></StEntry>;
  const tenantAuth = await getTenantAuthContext();
  if (tenantAuth) return <StEntry brand={tenantAuth.brand} brandFontFamily={tenantAuth.brandFontFamily} host={tenantAuth.host} helpHref="/workspace?view=help"><SupabaseSignIn emailReady={authEmailReady()} heading={<StHead title={`Manage ${tenantAuth.siteName}`} meta="Use the email your invitation was sent to." />} next={tenantSignInNext(tenantAuth.clientFallbackRoot)} /><p className="text-sm text-gray-muted">Runs on Strelva. Same account as strelva.com.</p></StEntry>;
  const agencyDoor = agencySignupReleaseEnabled();
  const businessDoor = businessSignupReleaseEnabled();
  // Opening the workspace no longer opens direct business sign-up to everyone:
  // an invitation, an open agency door or STRELVA_BUSINESS_SIGNUP_RELEASE does.
  const asAgency = agencyDoor && searchValue(params.as) === "agency";
  if (workspaceOpen && (invitationTarget || asAgency || businessDoor)) {
    // ADR 0015: "I run a business" goes straight to creating that business,
    // not to a personal workspace with the business one click away in Help.
    const next = asAgency ? AGENCY_START_PATH : invitationTarget || workspaceTarget || accountTarget || BUSINESS_SIGNUP_PATH;
    const identity = await invitationEntryIdentity(invitationTarget);
    return <StEntry brand={identity?.brand ?? (invitationTarget ? AGENCY_IDENTITY_UNAVAILABLE : undefined)} helpHref="/workspace?view=help">
      <SupabaseSignIn emailReady={authEmailReady()} key={next} next={next} heading={<><StHead title={identity ? `Create access for ${identity.businessName}` : "Create your account"} />{agencyDoor && businessDoor ? <AccountKindChoice selected={asAgency ? "agency" : "business"} next={requestedNext} /> : null}</>} />
      {identity ? <p className="text-sm text-gray-muted">Runs on Strelva. Same account as strelva.com.</p> : null}
      <StTextButton href={`/sign-in?next=${encodeURIComponent(next)}`}>Already have an account? Sign in</StTextButton>
    </StEntry>;
  }
  return <StEntry helpHref="/workspace?view=help"><StHead title="New accounts open soon" meta="Already have access? Sign in with the email connected to your business. Until then, check your business for free." /><StPillLink href="/audit">Check your business</StPillLink><StTextButton href="/agencies">Want it done for you? Find an agency</StTextButton><StTextButton href="/sign-in">Sign in</StTextButton>{workspaceOpen && agencyDoor ? <StTextButton href="/sign-up?as=agency">Build for clients? Create an agency account</StTextButton> : null}</StEntry>;
}

function AccountKindChoice({ selected, next }: { selected: "business" | "agency"; next: string | null }) {
  const href = (kind: "business" | "agency") => {
    const query = new URLSearchParams();
    if (kind === "agency") query.set("as", "agency");
    else if (next) query.set("next", next);
    return query.size ? `/sign-up?${query}` : "/sign-up";
  };
  return <nav aria-label="Who this account is for" className="flex flex-col gap-3">
    <p className="text-sm text-gray-muted">Who is this for?</p>
    {(["business", "agency"] as const).map(kind => <StChoiceLink key={kind} href={href(kind)} selected={selected === kind} label={kind === "business" ? "I run a business" : "I build for clients"} detail={kind === "business" ? "Start with your website and business details. Bring in an agency anytime." : "Clients own their workspace; you work inside it."} />)}
  </nav>;
}
