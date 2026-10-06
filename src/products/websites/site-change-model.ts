import { z } from "zod";

/**
 * The browser-safe half of website repo-change Requests (site-changes.ts):
 * shapes, stages and the command that files one. No server imports.
 */

export const SITE_CHANGE_SCOPE = "website.repo_change";

export const siteChangeReceiptSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["preview", "approved", "declined", "deployed"]),
  previewUrl: z.string().nullable(),
  commitSha: z.string().nullable(),
  deploymentUrl: z.string().nullable(),
  readBack: z.enum(["confirmed", "not_confirmed", "not_checked"]).nullable(),
  note: z.string().nullable(),
  recordedAt: z.string(),
});
export type SiteChangeReceipt = z.infer<typeof siteChangeReceiptSchema>;

export const siteChangeRequestSchema = z.object({
  id: z.string().uuid(),
  request: z.string(),
  status: z.enum(["draft", "requested", "withdrawn"]),
  accepted: z.enum(["pending", "accepted", "declined"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  receipts: z.array(siteChangeReceiptSchema),
});
export type SiteChangeRequest = z.infer<typeof siteChangeRequestSchema>;

/** Where a Request stands, in the Request stages (needs-you spec): the newest receipt decides. */
export type SiteChangeStage = "asked" | "in_progress" | "ready_for_review" | "approved" | "declined" | "done" | "done_unconfirmed" | "withdrawn";

export function siteChangeStage(request: SiteChangeRequest): SiteChangeStage {
  if (request.status === "withdrawn") return "withdrawn";
  const last = request.receipts.at(-1);
  if (!last) return request.accepted === "accepted" ? "in_progress" : "asked";
  if (last.kind === "preview") return "ready_for_review";
  if (last.kind === "approved") return "approved";
  if (last.kind === "declined") return "declined";
  return last.readBack === "confirmed" ? "done" : "done_unconfirmed";
}

export const SITE_CHANGE_STAGE_LABEL: Record<SiteChangeStage, string> = {
  asked: "Asked · Strelva agrees scope and timing with you next",
  in_progress: "In progress · Strelva is building it on a copy of the site",
  ready_for_review: "Ready for your review · open the preview, then approve or decline",
  approved: "Approved · Strelva deploys it next",
  declined: "Declined · nothing on the site changed",
  done: "Done · live and checked on the site",
  done_unconfirmed: "Deployed · not yet confirmed on the live site",
  withdrawn: "Withdrawn",
};

export const recordSiteChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preview"), previewUrl: z.string().trim().url().max(500).startsWith("https://"), note: z.string().trim().min(1).max(1_000).optional() }).strict(),
  z.object({ kind: z.literal("approved"), note: z.string().trim().min(1).max(1_000).optional() }).strict(),
  z.object({ kind: z.literal("declined"), note: z.string().trim().min(1).max(1_000).optional() }).strict(),
  z.object({
    kind: z.literal("deployed"),
    commitSha: z.string().trim().regex(/^[0-9a-fA-F]{7,40}$/),
    deploymentUrl: z.string().trim().url().max(500).startsWith("https://"),
    readBack: z.enum(["confirmed", "not_confirmed", "not_checked"]),
    note: z.string().trim().min(1).max(1_000).optional(),
  }).strict(),
]);
export type RecordSiteChange = z.infer<typeof recordSiteChangeSchema>;

/** The service-request command that files "Ask for a change" on a website System. */
export function siteChangeRequestCommand(input: {
  workspaceId: string; systemId: string; tenantStableId: string; editing: "native" | "request"; words: string; page?: string; idempotencyKey: string;
}) {
  const words = input.words.trim().slice(0, 3_000);
  return {
    action: "save" as const,
    businessId: input.workspaceId,
    status: "requested" as const,
    request: words,
    outcome: words,
    context: {
      source: "website_change",
      systemId: input.systemId,
      tenantStableId: input.tenantStableId,
      implementation: input.editing === "request" ? "custom_repo" : "custom_repo_content",
      ...(input.page ? { page: input.page.slice(0, 200) } : {}),
    },
    scope: [SITE_CHANGE_SCOPE],
    provider: { kind: "strelva" as const },
    idempotencyKey: input.idempotencyKey,
  };
}
