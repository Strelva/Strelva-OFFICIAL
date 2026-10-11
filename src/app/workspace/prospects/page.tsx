import type { Metadata } from "next";
import { AgencyProspectsView } from "@/experience/workspace/agency/AgencyProspectsView";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { listAgencyProspects, AgencyProspectingError } from "@/platform/agency-prospecting/server";
import { agencyAddClientReleaseEnabled } from "@/products/agency-clients";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agency prospects", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const user = await getSessionUser();
  const { workspace } = await searchParams;
  let error: string | null = null;
  let prospects: Awaited<ReturnType<typeof listAgencyProspects>> = [];
  if (!user?.email || !user.email_confirmed_at) error = "Sign in with a verified account to see agency prospects.";
  else if (!workspace || !/^[a-f0-9-]{36}$/i.test(workspace)) error = "Open this page with your agency workspace.";
  else {
    try { prospects = await listAgencyProspects(workspace, user.id, user.email); }
    catch (cause) { error = cause instanceof AgencyProspectingError ? cause.message : "Prospects are temporarily unavailable."; }
  }
  return <AgencyProspectsView workspaceId={workspace} prospects={prospects} error={error} signedIn={Boolean(user?.email && user.email_confirmed_at)} addClientEnabled={agencyAddClientReleaseEnabled()} />;
}
