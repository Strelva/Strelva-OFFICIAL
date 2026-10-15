/**
 * Putting a linked website live from the workspace. An approved rebuild onto a
 * linked site publishes here, so its receipt and the Release it records come
 * from one place. The heavy rebuild service loads only when a rebuild is
 * published.
 *
 * Tenant sections (the content API, an approved event and the agent) publish
 * through src/lib/publish-tenant-sections.ts instead: that publisher writes the
 * tenant model, and src/lib never imports a workspace layer (Strelva Reborn
 * section 7), so the two cannot share one module.
 */
import type { WebsitePublishCommand, WebsitePublishDetail, WebsitePublishOutcome } from "./contracts";

export type { SiteDocumentPublishDetail, WebsitePublishCommand, WebsitePublishDetail, WebsitePublishOutcome } from "./contracts";

export async function publishWebsite<C extends WebsitePublishCommand>(command: C): Promise<WebsitePublishOutcome<C>> {
  // The rebuild service invalidates the published document, revalidates and
  // reads back. The document store observes the Release when it commits; this
  // heals it for a replayed publish, where the store is not called again.
  const { publishWebsiteRebuildOntoLinkedSite } = await import("@/products/websites/index");
  const detail = await publishWebsiteRebuildOntoLinkedSite(command.actor, command.workId, command.input);
  const { observeWebsiteWorkRelease } = await import("@/products/websites/system-releases");
  await observeWebsiteWorkRelease(command.actor, detail.workspaceId, command.workId);
  return { via: command.via, releaseObserved: "recorded", detail: detail as WebsitePublishDetail<C> } as WebsitePublishOutcome<C>;
}
