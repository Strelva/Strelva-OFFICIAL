import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AgencyOnboarding } from "@/experience/workspace/agency/AgencyOnboarding";
import { agencySignupReleaseEnabled } from "@/platform/agency-signup-release";
import { agencyAddClientReleaseEnabled } from "@/products/agency-clients";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Set up your agency",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * The agency setup checklist (#258). A public shell like /workspace: the read
 * behind it checks the session and the agency membership on every request.
 */
export default async function AgencyStartPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string | string[] }> }) {
  if (!agencySignupReleaseEnabled()) redirect("/workspace");
  const workspaceId = (await searchParams).workspaceId;
  return <AgencyOnboarding initialWorkspaceId={typeof workspaceId === "string" ? workspaceId : null} addClient={agencyAddClientReleaseEnabled()} />;
}
