import { AgencyWebsiteDocumentDraftExperience } from "@/experience/agency-website/AgencyWebsiteDocumentDraftExperience";

import { AgencyManagedWebsiteDraftExperience } from "@/experience/agency-website/AgencyManagedWebsiteDraftExperience";
import { createAgencyManagedWebsiteDraftAccessService } from "@/platform/offerings/agency-website-draft";
import { releaseViewerFor } from "@/platform/release-flags/viewer";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { websiteRebuildReleaseEnabled, websiteRebuildReleaseEnabledForTenant, websiteRebuildReleaseMayBeOn } from "@/products/websites";

/**
 * The v2 document draft when the rebuild is on for the client's site: env `1`,
 * or `workspace` with the client's business row on. Unresolvable (signed out,
 * no grant, a failed read): the env-only rule decides, and the APIs behind
 * either experience still check the grant and the flag themselves.
 */
async function documentDraftReleased(bindingId: string): Promise<boolean> {
  if (!websiteRebuildReleaseMayBeOn()) return false;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return websiteRebuildReleaseEnabled();
    const grant = await createAgencyManagedWebsiteDraftAccessService().read(actor, bindingId);
    if (!grant) return websiteRebuildReleaseEnabled();
    return await websiteRebuildReleaseEnabledForTenant(grant.tenantId, await releaseViewerFor(actor));
  } catch {
    return websiteRebuildReleaseEnabled();
  }
}

export default async function AgencyManagedWebsiteDraftPage({ params }: { params: Promise<{ bindingId: string }> }) {
  const { bindingId } = await params;
  return await documentDraftReleased(bindingId) ? <AgencyWebsiteDocumentDraftExperience bindingId={bindingId} /> : <AgencyManagedWebsiteDraftExperience bindingId={bindingId} />;
}
