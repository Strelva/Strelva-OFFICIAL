import { notFound, redirect } from "next/navigation";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { XaButtonLink } from "@/components/ui/strelva/Xa";
import { XaPlace, XaPlaceHead, XaPlaceTrouble } from "@/experience/places/XaPlace";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceReturnTarget } from "@/platform/workspaces/location";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { resolveOwnerBrand } from "@/platform/agency-brand/server";
import { AgencyLeads } from "@/experience/workspace/leads/AgencyLeads";
import { leadAgency } from "@/experience/workspace/leads/leads-server";

export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  if (!workspaceReleaseEnabled()) notFound();
  const { workspaceId = "" } = await searchParams;
  const actor = await workspaceHttpActor();
  if (!actor) {
    const next = workspaceReturnTarget(`/workspace/leads?${new URLSearchParams({ workspaceId })}`) || "/workspace";
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }
  let agency;
  try { agency = await leadAgency(actor, workspaceId); }
  catch {
    return <StrelvaShell title="" workspaceId={workspaceId}><XaPlace label="Leads"><XaPlaceHead title="Leads" />
      <XaPlaceTrouble pose="waving" title="These leads belong to an agency team." action={<XaButtonLink href="/workspace">Open your workspace</XaButtonLink>}>
        <p>Only a verified owner or admin of this agency can manage its leads.</p>
      </XaPlaceTrouble>
    </XaPlace></StrelvaShell>;
  }
  const brand = await resolveOwnerBrand(agency.id);
  return <StrelvaShell title="" workspaceId={agency.id} workspaceName={brand.agencyId === agency.id ? brand.name : "Agency identity unavailable"} ownerBrand={brand} agencyNavigation={{ leadsCurrent: true, leadsAvailable: true }}>
    <AgencyLeads agencyWorkspaceId={agency.id} />
  </StrelvaShell>;
}
