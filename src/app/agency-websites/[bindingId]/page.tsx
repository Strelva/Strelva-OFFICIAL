import { AgencyWebsiteDocumentDraftExperience } from "@/experience/agency-website/AgencyWebsiteDocumentDraftExperience";

import { AgencyManagedWebsiteDraftExperience } from "@/experience/agency-website/AgencyManagedWebsiteDraftExperience";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export default async function AgencyManagedWebsiteDraftPage({ params }: { params: Promise<{ bindingId: string }> }) {
  const { bindingId } = await params;
  return workspaceReleaseEnabled() && process.env.STRELVA_WEBSITE_REBUILD_RELEASE === "1" ? <AgencyWebsiteDocumentDraftExperience bindingId={bindingId} /> : <AgencyManagedWebsiteDraftExperience bindingId={bindingId} />;
}
