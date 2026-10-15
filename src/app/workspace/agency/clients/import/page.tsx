import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AgencyImportClients } from "@/experience/workspace/agency/AgencyImportClients";
import { agencyImportReleaseEnabled } from "@/products/agency-clients";
import { ghlImportReleaseEnabled } from "@/products/agency-clients/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Import clients", robots: { index: false, follow: false }, referrer: "no-referrer" };

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Import clients. The shell is public like /workspace; the preview and every
 * add recheck the session and the agency role. Off unless
 * STRELVA_AGENCY_IMPORT_RELEASE=1 on top of the add-client release.
 */
export default async function AgencyImportClientsPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string | string[]; source?: string | string[]; highlevel?: string | string[]; highlevelError?: string | string[] }> }) {
  if (!agencyImportReleaseEnabled()) redirect("/workspace");
  const { workspaceId, source, highlevel, highlevelError } = await searchParams;
  if (typeof workspaceId !== "string" || !UUID.test(workspaceId)) redirect("/workspace");
  // HighLevel is off unless STRELVA_GHL_IMPORT_RELEASE=1. Its OAuth callback lands here with the outcome.
  const highLevelOn = ghlImportReleaseEnabled();
  return <AgencyImportClients
    agencyWorkspaceId={workspaceId}
    highLevel={highLevelOn}
    initialSource={highLevelOn && source === "highlevel" ? "highlevel" : undefined}
    initialNotice={highLevelOn && highlevel === "connected" ? "HighLevel is connected. Read your sub-accounts to preview them." : undefined}
    initialError={highLevelOn && typeof highlevelError === "string" ? highlevelError.slice(0, 300) : undefined}
  />;
}
