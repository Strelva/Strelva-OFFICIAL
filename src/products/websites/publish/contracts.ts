import type { WorkspaceActor } from "@/platform/workspaces/types";

/**
 * A linked website going live from the workspace, as one command. Callers keep
 * their own validation, authority and response shape; the outcome's `detail`
 * is what the rebuild publisher returned, unchanged.
 *
 * Tenant sections publish through src/lib/publish-tenant-sections.ts (the
 * tenant model). A coding agent's shipped commit is recorded as a Release by
 * the site-changes store (observeWebsiteSystemRelease), not here: nothing in
 * this facade deploys.
 */
export type WebsitePublishCommand =
  { via: "site_document"; actor: WorkspaceActor; workId: string; input: unknown };

export type SiteDocumentPublishDetail = Awaited<ReturnType<typeof import("../rebuild-service").publishWebsiteRebuildOntoLinkedSite>>;

export type WebsitePublishDetail<C extends WebsitePublishCommand> =
  C extends { via: "site_document" } ? SiteDocumentPublishDetail : never;

export interface WebsitePublishOutcome<C extends WebsitePublishCommand = WebsitePublishCommand> {
  via: C["via"];
  /** recorded: the publisher recorded a Release (or reconciled it, best effort). */
  releaseObserved: "recorded" | "reconcile_pending" | "not_applicable";
  detail: WebsitePublishDetail<C>;
}
