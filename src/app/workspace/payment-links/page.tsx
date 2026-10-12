import { notFound, redirect } from "next/navigation";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StHead, StNotice, StPage } from "@/components/ui/strelva/Kit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { AgencyPaymentLinks } from "@/experience/workspace/billing/AgencyPaymentLinks";
import { paymentLinkAgency } from "@/experience/workspace/billing/payment-links-server";
import { resolveOwnerBrand } from "@/platform/agency-brand/server";

export const dynamic = "force-dynamic";
export default async function PaymentLinksPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  if (!workspaceReleaseEnabled()) notFound();
  const actor = await workspaceHttpActor();
  if (!actor) redirect("/sign-in?next=%2Fworkspace");
  const { workspaceId = "" } = await searchParams;
  let agency;
  try { agency = await paymentLinkAgency(actor, workspaceId); }
  catch { return <StrelvaShell title="" workspaceId={workspaceId}><StPage><StHead title="Payment links" /><StNotice tone="critical">Only a verified owner or admin of this agency can manage its payment links.</StNotice></StPage></StrelvaShell>; }
  const brand = await resolveOwnerBrand(agency.id);
  return <StrelvaShell title="" workspaceId={agency.id} workspaceName={brand.agencyId === agency.id ? brand.name : "Agency identity unavailable"} ownerBrand={brand} agencyNavigation={{ paymentLinksCurrent: true }}>
    <StPage><StHead title="Payment links" crumb={{ label: "Agency billing", href: `/workspace/billing?workspaceId=${encodeURIComponent(agency.id)}` }} />
      <AgencyPaymentLinks agencyWorkspaceId={agency.id} />
    </StPage>
  </StrelvaShell>;
}
