import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { XaEmpty } from "@/components/ui/strelva/Xa";
import { XaCrumbs, XaOutside } from "@/components/ui/strelva/Xa";
import styles from "@/experience/agency-website/agency-website.module.css";
import { readAgencyWebsiteContext } from "@/platform/offerings/agency-website-context";
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
 *
 * October 16 (XA): AgencyWebsiteDocumentDraftExperience still uses St kit
 * internals and has not been rebuilt to the XA object layout. Keep the website
 * rebuild release off for agency drafts until it is; the XA editor is
 * AgencyManagedWebsiteDraftExperience below.
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
  const actor = await workspaceHttpActor();
  const context = actor ? await readAgencyWebsiteContext(actor, bindingId).catch(() => null) : null;
  if (!context) return <XaOutside from={null} label="Website preparation"><div role="alert"><XaEmpty pose="alone" title="This website couldn't be opened" job="Nothing on the client's website changed.">The agency and client couldn&apos;t be confirmed for your account. Sign in with the account you were assigned, then open this website from the client.</XaEmpty></div></XaOutside>;
  const crumbs = <XaCrumbs items={[{ label: context.businessName, href: `/workspace?workspaceId=${encodeURIComponent(context.businessWorkspaceId)}` }, { label: context.websiteName }, { label: "Prepare an update" }]} />;
  return <StrelvaShell title="" systemsReleased workspaceId={context.businessWorkspaceId} businessContext={context.businessName} accountName={context.personName} accountDetail="Agency access">{await documentDraftReleased(bindingId) ? <><div className={styles.crumbs}>{crumbs}</div><AgencyWebsiteDocumentDraftExperience bindingId={bindingId} /></> : <AgencyManagedWebsiteDraftExperience bindingId={bindingId} businessName={context.businessName} crumbs={crumbs} />}</StrelvaShell>;
}
