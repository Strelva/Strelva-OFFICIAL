import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AgencyImportClients } from "@/experience/workspace/agency/AgencyImportClients";
import { agencyImportReleaseEnabled } from "@/products/agency-clients";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Import clients", robots: { index: false, follow: false }, referrer: "no-referrer" };

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Import clients. The shell is public like /workspace; the preview and every
 * add recheck the session and the agency role. Off unless
 * STRELVA_AGENCY_IMPORT_RELEASE=1 on top of the add-client release.
 */
export default async function AgencyImportClientsPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string | string[] }> }) {
  if (!agencyImportReleaseEnabled()) redirect("/workspace");
  const { workspaceId } = await searchParams;
  if (typeof workspaceId !== "string" || !UUID.test(workspaceId)) redirect("/workspace");
  // HighLevel is lane L6's source, off unless STRELVA_GHL_IMPORT_RELEASE=1. At
  // merge, read L6's ghlImportReleaseEnabled() here instead of the variable.
  return <AgencyImportClients agencyWorkspaceId={workspaceId} highLevel={process.env.STRELVA_GHL_IMPORT_RELEASE === "1"} />;
}
