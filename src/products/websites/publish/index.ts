/**
 * One way to put a website live. Each route that publishes (tenant sections
 * from the content API, an approved event or the agent; an approved rebuild
 * onto a linked site) calls publishWebsite, so the receipt and the Release it
 * records come from one place. The heavy rebuild service loads only when a
 * rebuild is published.
 */
import { publishTenantSections } from "./tenant-sections";
import type { WebsitePublishCommand, WebsitePublishDetail, WebsitePublishOutcome } from "./contracts";

export {
  isSectionWriteFailure,
  publishTenantSections,
  writeTenantSections,
  type PublishTenantSectionsInput,
  type TenantPublishReceipt,
  type TenantSectionWrite,
} from "./tenant-sections";
export type { SiteDocumentPublishDetail, WebsitePublishCommand, WebsitePublishDetail, WebsitePublishOutcome } from "./contracts";

export async function publishWebsite<C extends WebsitePublishCommand>(command: C): Promise<WebsitePublishOutcome<C>> {
  if (command.via === "tenant_sections") {
    // appendVersion records the Release through observeTenantContentVersion.
    const detail = await publishTenantSections(command.input);
    return { via: command.via, releaseObserved: detail.status === "published" ? "recorded" : "not_applicable", detail } as WebsitePublishOutcome<C>;
  }
  // The rebuild service invalidates the published document, revalidates and
  // reads back. The document store observes the Release when it commits; this
  // heals it for a replayed publish, where the store is not called again.
  const { publishWebsiteRebuildOntoLinkedSite } = await import("@/products/websites/index");
  const detail = await publishWebsiteRebuildOntoLinkedSite(command.actor, command.workId, command.input);
  const { observeWebsiteWorkRelease } = await import("@/products/websites/system-releases");
  await observeWebsiteWorkRelease(command.actor, detail.workspaceId, command.workId);
  return { via: command.via, releaseObserved: "recorded", detail: detail as WebsitePublishDetail<C> } as WebsitePublishOutcome<C>;
}
