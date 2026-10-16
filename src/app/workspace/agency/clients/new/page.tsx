import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { agencyClaimEmailReleased } from "@/products/agency-clients/server";
import { AgencyAddClient, AgencyAddClientFrame } from "@/experience/workspace/agency/AgencyAddClient";
import { agencyProspectingEnabled } from "@/platform/agency-prospecting/server";
import { agencyAddClientReleaseEnabled } from "@/products/agency-clients";
import { addAgencyClientInputSchema } from "@/products/agency-clients/contracts";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { readAgencyLead } from "@/experience/workspace/leads/leads-server";
import { listMemberAgencies } from "@/platform/workspaces/agency-onboarding";

/** The agency's name for the frame, read through the same membership check as setup. Unknown stays unnamed. */
async function agencyNameFor(actor: Awaited<ReturnType<typeof workspaceHttpActor>>, workspaceId: string): Promise<string | undefined> {
  if (!actor) return undefined;
  return listMemberAgencies(actor).then(agencies => agencies.find(agency => agency.id === workspaceId)?.name).catch(() => undefined);
}

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add a client", robots: { index: false, follow: false }, referrer: "no-referrer" };

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * An agency adds a client (#259). The shell is public like /workspace; every
 * read and write behind it rechecks the session and the agency role.
 * Operators keep /admin/onboard. Off unless STRELVA_AGENCY_ADD_CLIENT_RELEASE=1.
 */
export default async function AgencyAddClientPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string | string[]; prospect?: string | string[]; client?: string | string[]; leadToken?: string | string[] }> }) {
  if (!agencyAddClientReleaseEnabled()) redirect("/workspace");
  const { workspaceId, prospect, client, leadToken } = await searchParams;
  if (typeof workspaceId !== "string" || !UUID.test(workspaceId)) redirect("/workspace");
  if (leadToken !== undefined) {
    const leadsHref = `/workspace/leads?workspaceId=${encodeURIComponent(workspaceId)}`;
    if (typeof leadToken !== "string" || !/^[a-f0-9]{36}$/.test(leadToken) || prospect !== undefined) redirect(leadsHref);
    const actor = await workspaceHttpActor();
    if (!actor) redirect(`/sign-in?next=${encodeURIComponent(`/workspace/agency/clients/new?${new URLSearchParams({ workspaceId, leadToken })}`)}`);
    const detail = await readAgencyLead(actor, workspaceId, leadToken).catch(() => null);
    if (!detail) redirect(leadsHref);
    const conversion = detail.lead.conversion;
    const saved = conversion?.actorId === actor.userId ? addAgencyClientInputSchema.safeParse(conversion.input) : null;
    const initialConversion = saved?.success && saved.data.agencyWorkspaceId === workspaceId && saved.data.leadToken === leadToken
      && saved.data.idempotencyKey === conversion?.idempotencyKey ? saved.data : null;
    const conversionHeld = Boolean(conversion || detail.workflow.status === "converted") && !initialConversion;
    const agencyName = await agencyNameFor(actor, workspaceId);
    return <AgencyAddClientFrame agencyWorkspaceId={workspaceId} agencyName={agencyName}><AgencyAddClient emailEnabled={agencyClaimEmailReleased()} agencyWorkspaceId={workspaceId} agencyName={agencyName} prospecting={false} initialProspectId={null}
      initialLead={{ token: detail.lead.statusToken, businessName: detail.lead.businessName, email: detail.lead.email, currentWebsite: detail.lead.currentWebsite ?? null }}
      initialConversion={initialConversion} conversionHeld={conversionHeld} convertedBusinessWorkspaceId={conversion?.businessWorkspaceId} /></AgencyAddClientFrame>;
  }
  const actor = await workspaceHttpActor().catch(() => null);
  const agencyName = await agencyNameFor(actor, workspaceId);
  return <AgencyAddClientFrame agencyWorkspaceId={workspaceId} agencyName={agencyName}><AgencyAddClient emailEnabled={agencyClaimEmailReleased()} agencyWorkspaceId={workspaceId} agencyName={agencyName} prospecting={agencyProspectingEnabled()}
    initialProspectId={typeof prospect === "string" && UUID.test(prospect) ? prospect : null}
    initialClientId={typeof client === "string" && UUID.test(client) ? client : null} /></AgencyAddClientFrame>;
}
