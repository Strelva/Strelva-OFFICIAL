import { AgencyApplicationDraftExperience } from "@/experience/applications/AgencyApplicationDraftExperience";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { readAgencyApplicationDraftContext } from "@/platform/offerings/agency-application-draft-context";
import { workspaceHttpActor } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

/** The agency's internal tool draft, in the agency shell when the grant and client can be read. */
export default async function AgencyApplicationDraftPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params;
  const actor = await workspaceHttpActor();
  const context = actor ? await readAgencyApplicationDraftContext(actor, workId).catch(() => null) : null;
  if (!context) return <AgencyApplicationDraftExperience workId={workId} />;
  const businessHref = `/workspace?workspaceId=${encodeURIComponent(context.businessWorkspaceId)}`;
  return <StrelvaShell title="" systemsReleased workspaceId={context.agencyWorkspaceId} workspaceName={context.agencyName} accountName={context.personName ?? undefined}
    agencyNavigation={{ active: "clients" }}>
    <AgencyApplicationDraftExperience workId={workId} context={{
      businessName: context.businessName, businessHref, ownerName: context.ownerName, agencyName: context.agencyName,
      personName: context.personName ?? "you", clientsHref: `/workspace?workspaceId=${encodeURIComponent(context.agencyWorkspaceId)}`,
    }} />
  </StrelvaShell>;
}
