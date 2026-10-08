import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AgencyAddClient } from "@/experience/workspace/agency/AgencyAddClient";
import { agencyProspectingEnabled } from "@/platform/agency-prospecting/server";
import { agencyAddClientReleaseEnabled } from "@/products/agency-clients";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add a client", robots: { index: false, follow: false }, referrer: "no-referrer" };

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * An agency adds a client (#259). The shell is public like /workspace; every
 * read and write behind it rechecks the session and the agency role.
 * Operators keep /admin/onboard. Off unless STRELVA_AGENCY_ADD_CLIENT_RELEASE=1.
 */
export default async function AgencyAddClientPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string | string[]; prospect?: string | string[] }> }) {
  if (!agencyAddClientReleaseEnabled()) redirect("/workspace");
  const { workspaceId, prospect } = await searchParams;
  if (typeof workspaceId !== "string" || !UUID.test(workspaceId)) redirect("/workspace");
  return <AgencyAddClient agencyWorkspaceId={workspaceId} prospecting={agencyProspectingEnabled()}
    initialProspectId={typeof prospect === "string" && UUID.test(prospect) ? prospect : null} />;
}
