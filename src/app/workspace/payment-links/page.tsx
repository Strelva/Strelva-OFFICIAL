import { notFound, redirect } from "next/navigation";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StHead, StNotice, StPage } from "@/components/ui/strelva/Kit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceReturnTarget } from "@/platform/workspaces/location";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { AgencyPaymentLinks } from "@/experience/workspace/billing/AgencyPaymentLinks";
import { paymentLinkAgency } from "@/experience/workspace/billing/payment-links-server";
import { readAgencyLead } from "@/experience/workspace/leads/leads-server";
import { strelvaAgencyWorkspaceId } from "@/platform/workspaces/strelva-agency";
import { resolveOwnerBrand } from "@/platform/agency-brand/server";

export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export const dynamic = "force-dynamic";
export default async function PaymentLinksPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string; leadToken?: string }> }) {
  if (!workspaceReleaseEnabled()) notFound();
  const { workspaceId = "", leadToken } = await searchParams;
  const actor = await workspaceHttpActor();
  if (!actor) {
    const next = workspaceReturnTarget(`/workspace/payment-links?${new URLSearchParams({ workspaceId, ...(leadToken ? { leadToken } : {}) })}`) || "/workspace";
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }
  let agency;
  try { agency = await paymentLinkAgency(actor, workspaceId); }
  catch { return <StrelvaShell title="" workspaceId={workspaceId}><StPage><StHead title="Payment links" /><StNotice tone="critical">Only a verified owner or admin of this agency can manage its payment links.</StNotice></StPage></StrelvaShell>; }
  let initialProspect;
  if (leadToken) {
    try { const { lead } = await readAgencyLead(actor, agency.id, leadToken); initialProspect = { token: leadToken, name: lead.businessName, description: (lead.description || `Work for ${lead.businessName}`).slice(0, 1000) }; }
    catch { return <StrelvaShell title="" workspaceId={workspaceId}><StPage><StHead title="Payment links" /><StNotice tone="critical">This lead is unavailable to your agency. Open your leads and choose a current request.</StNotice></StPage></StrelvaShell>; }
  }
  const brand = await resolveOwnerBrand(agency.id);
  return <StrelvaShell title="" workspaceId={agency.id} workspaceName={brand.agencyId === agency.id ? brand.name : "Agency identity unavailable"} ownerBrand={brand} agencyNavigation={{ paymentLinksCurrent: true, leadsAvailable: agency.id === strelvaAgencyWorkspaceId() }}>
    <StPage><StHead title="Payment links" crumb={{ label: "Agency billing", href: `/workspace/billing?workspaceId=${encodeURIComponent(agency.id)}` }} />
      <AgencyPaymentLinks agencyWorkspaceId={agency.id} initialProspect={initialProspect} />
    </StPage>
  </StrelvaShell>;
}
