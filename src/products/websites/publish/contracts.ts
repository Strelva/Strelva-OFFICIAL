import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { PublishTenantSectionsInput, TenantPublishReceipt } from "./tenant-sections";

/**
 * Every way a website goes live, as one command. Callers keep their own
 * validation, authority and response shape; the outcome's `detail` is what the
 * underlying publisher returned, unchanged.
 *
 * A coding agent's shipped commit is recorded as a Release by the site-changes
 * store (observeWebsiteSystemRelease), not here: nothing in this facade deploys.
 */
export type WebsitePublishCommand =
  | { via: "tenant_sections"; input: PublishTenantSectionsInput }
  | { via: "site_document"; actor: WorkspaceActor; workId: string; input: unknown };

export type SiteDocumentPublishDetail = Awaited<ReturnType<typeof import("../rebuild-service").publishWebsiteRebuildOntoLinkedSite>>;

export type WebsitePublishDetail<C extends WebsitePublishCommand> =
  C extends { via: "tenant_sections" } ? TenantPublishReceipt : SiteDocumentPublishDetail;

export interface WebsitePublishOutcome<C extends WebsitePublishCommand = WebsitePublishCommand> {
  via: C["via"];
  /**
   * recorded: the publisher recorded a Release (or reconciled it, best effort).
   * not_applicable: nothing went live, so there is no Release to record.
   */
  releaseObserved: "recorded" | "reconcile_pending" | "not_applicable";
  detail: WebsitePublishDetail<C>;
}
