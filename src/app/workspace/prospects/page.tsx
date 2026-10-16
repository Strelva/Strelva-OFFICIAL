import type { Metadata } from "next";
import { AgencyProspectsView } from "@/experience/workspace/agency/AgencyProspectsView";
import { readAgencyClients } from "@/experience/places/place-chrome-server";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { listAgencyProspects, AgencyProspectingError } from "@/platform/agency-prospecting/server";
import { agencyAddClientReleaseEnabled } from "@/products/agency-clients";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Check results", robots: { index: false, follow: false }, referrer: "no-referrer" };

const ID = /^[a-f0-9-]{36}$/i;

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<{ workspace?: string; prospect?: string }> }) {
  const user = await getSessionUser();
  const { workspace, prospect } = await searchParams;
  let error: string | null = null;
  let prospects: Awaited<ReturnType<typeof listAgencyProspects>> = [];
  const verified = Boolean(user?.email && user.email_confirmed_at);
  if (!verified) error = "Sign in with a verified account to see who ran your check links.";
  else if (!workspace || !ID.test(workspace)) error = "Open this page from your agency workspace.";
  else {
    try { prospects = await listAgencyProspects(workspace, user!.id, user!.email!); }
    catch (cause) { error = cause instanceof AgencyProspectingError ? cause.message : "Check results are temporarily unavailable."; }
  }
  // The agency rail and the "already a client" check read the same authorized client list.
  const clients = !error && verified ? await readAgencyClients({ userId: user!.id, verifiedEmail: user!.email!.trim().toLowerCase() }) : [];
  return <AgencyProspectsView workspaceId={workspace} prospects={prospects} error={error} signedIn={verified} addClientEnabled={agencyAddClientReleaseEnabled()}
    selectedId={typeof prospect === "string" && ID.test(prospect) ? prospect : undefined}
    knownClients={clients.map(({ id, name, href }) => ({ id, name, href }))}
    chrome={clients.length ? { agencyNavigation: { clients } } : undefined} />;
}
