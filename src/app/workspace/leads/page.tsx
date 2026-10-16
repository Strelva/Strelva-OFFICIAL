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
import { readAgencyClients } from "@/experience/places/place-chrome-server";

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
    return <StrelvaShell title="" workspaceId={workspaceId}><XaPlace label="Service requests"><XaPlaceHead title="Service requests" />
      <XaPlaceTrouble pose="waving" title="These service requests belong to an agency team." action={<XaButtonLink variant="primary" href="/workspace">Open your workspace</XaButtonLink>}>
        <p>Only a verified owner or admin of this agency can open its service requests.</p>
      </XaPlaceTrouble>
    </XaPlace></StrelvaShell>;
  }
  const [brand, clients] = await Promise.all([resolveOwnerBrand(agency.id), readAgencyClients(actor)]);
  // The agency shell (Today, Queue, Library, Minutes, Service requests, Clients), the same rail as Check results.
  return <StrelvaShell title="" workspaceId={agency.id} workspaceName={brand.agencyId === agency.id ? brand.name : "Agency identity unavailable"} ownerBrand={brand} agencyNavigation={{ leadsCurrent: true, leadsAvailable: true, clients }}>
    <AgencyLeads agencyWorkspaceId={agency.id} knownClients={clients.map(({ id, name, href }) => ({ id, name, href }))} />
  </StrelvaShell>;
}
