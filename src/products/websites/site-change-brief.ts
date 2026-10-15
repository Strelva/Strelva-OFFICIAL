import { SITE_CHANGE_STAGE_LABEL, siteChangeStage, type SiteChangeRequest, type SiteChangeStage } from "./site-change-model";

/**
 * What a coding agent is told about one website Request: the task, the site,
 * where it stands and the one thing to do next. Pure, so the same words reach
 * the MCP tool and the agency's copy-and-paste handoff.
 */

/** A Request as the agent tools read it: the Request plus the site it is for. */
export interface SiteRequestRow extends SiteChangeRequest {
  outcome?: string | null;
  systemId: string | null;
  tenantId: string | null;
  siteName: string;
  repoUrl?: string | null;
  repoName?: string | null;
  productionDomain?: string | null;
  /** Whether this agent's agency holds the publish permission for the site. */
  mayDeploy: boolean;
}

export type SiteRequestNextStep = "wait_for_agency_acceptance" | "build_and_report_preview" | "wait_for_owner" | "merge_deploy_and_report" | "done" | "stop";

export function siteRequestNextStep(row: SiteRequestRow): SiteRequestNextStep {
  const stage: SiteChangeStage = siteChangeStage(row);
  if (stage === "withdrawn") return "stop";
  if (stage === "asked" || row.accepted !== "accepted") return "wait_for_agency_acceptance";
  if (stage === "ready_for_review") return "wait_for_owner";
  if (stage === "approved") return row.mayDeploy ? "merge_deploy_and_report" : "wait_for_agency_acceptance";
  if (stage === "done") return "done";
  return "build_and_report_preview";
}

export function siteRequestNextStepWords(row: SiteRequestRow): string {
  const step = siteRequestNextStep(row);
  if (step === "wait_for_agency_acceptance") {
    return siteChangeStage(row) === "approved"
      ? "Stop. The owner approved this, but your agency does not hold publish permission for this site yet. Ask the owner to grant it in Strelva, then read this Request again."
      : "Stop. A person at your agency must accept this Request in Strelva before you work on it.";
  }
  if (step === "build_and_report_preview") return "Build the change on a branch, wait for its preview deploy, then call report_site_preview. Do not merge to production.";
  if (step === "wait_for_owner") return "Stop. The owner is reviewing the preview in Strelva. Read this Request again later; merge only when the stage is approved.";
  if (step === "merge_deploy_and_report") return "Merge to production, wait for the deploy, then call report_site_deploy with the production commit and deployment URL.";
  if (step === "done") return "Nothing to do. This change is live and checked.";
  return "Stop. This Request was withdrawn.";
}

/** The branch a Request is built on. */
export const siteRequestBranch = (requestId: string) => `strelva/${requestId.slice(0, 8)}`;

export function siteRequestReviewHref(origin: string, workspaceId: string, systemId: string | null): string {
  const query = new URLSearchParams({ workspaceId, ...(systemId ? { system: systemId } : {}), tab: "request" });
  return `${origin}/workspace/site?${query}`;
}

/** Plain markdown for a coding agent: no secrets, no business data beyond this Request. */
export function siteRequestBrief(row: SiteRequestRow, context: { origin: string; workspaceId: string }): string {
  const stage = siteChangeStage(row);
  const repo = row.repoUrl ?? row.repoName ?? "not recorded";
  return [
    `# Website change: ${row.siteName}`,
    "",
    "## What to change",
    row.request,
    ...(row.page ? ["", `Page: ${row.page}`] : []),
    "",
    "## Site",
    `- Site: ${row.siteName}`,
    `- Repo: ${repo}`,
    ...(row.productionDomain ? [`- Live at: ${row.productionDomain}`] : []),
    "",
    "## Where things stand",
    SITE_CHANGE_STAGE_LABEL[stage],
    "",
    "## Next step",
    siteRequestNextStepWords(row),
    "",
    "## Rules",
    "- Keep the Strelva contract files working: /api/reb-capabilities (or /api/capabilities), /api/v1/revalidate and src/lib/reb-contracts.ts.",
    `- Work on branch ${siteRequestBranch(row.id)}.`,
    "- Never merge to production before the stage is approved.",
    "- Never put secrets, customer data or other businesses' data in commits or summaries.",
    "",
    `Review link: ${siteRequestReviewHref(context.origin, context.workspaceId, row.systemId)}`,
  ].join("\n");
}
