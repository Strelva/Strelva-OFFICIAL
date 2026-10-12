import { load } from "cheerio";
import { z } from "zod";
import { verifyWorkspaceApproveToken, type WorkspaceApproveLinkClaims } from "@/lib/approve-link";
import { WEBSITE_PREVIEW_CSP } from "@/lib/website-preview-policy";
import { getSupabase } from "@/platform/infra/db/client";
import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { renderRebuildPreview, websiteRebuildSchema, safeSitePathSchema, escapeSiteHtml, type WebsiteRebuildRecord } from "@/products/websites/index";
import { ownerDecisionSchema, type OwnerDecision } from "@/platform/needs-you/contracts";
import { ownerWebsitePreviewHref, ownerWebsitePreviewMayBeOn } from "./links";
export { OWNER_WEBSITE_PREVIEW_PATH, ownerWebsitePreviewHref, ownerWebsitePreviewMayBeOn } from "./links";
import { websiteDocumentCopyItems, websiteDocumentFactItems, websiteDocumentItem } from "@/server/needs-you/sources/website-document";

const resultSchema = z.object({
  item: ownerDecisionSchema,
  record: z.object({ workId: z.string().uuid(), workspaceId: z.string().uuid(), rebuild: websiteRebuildSchema }),
});

/** Service-only read: SQL rechecks the signed recipient and open item. No actor/session is created. */
async function readPreview(claims: WorkspaceApproveLinkClaims): Promise<unknown> {
  const db = getSupabase();
  if (!db) throw new Error("owner_preview_unavailable");
  const { data, error } = await (db as unknown as {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  }).rpc("read_owner_decision_website_preview", {
    p_workspace_id: claims.workspaceId, p_decision_id: claims.itemId,
    p_revision_hash: claims.revision, p_recipient: claims.recipient,
  });
  if (error) throw new Error("owner_preview_refused");
  return data;
}

const headers = {
  "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": WEBSITE_PREVIEW_CSP,
};

/** Shared renderer for the authorized read and the explicitly fictional UI specimen. */
export function renderOwnerWebsitePreview(item: OwnerDecision, record: WebsiteRebuildRecord, token: string, page: string, options: {
  previewHrefBase?: string;
  decisionHref?: string;
} = {}): Response {
  const candidate = record.rebuild.candidate!;
  const previewHrefBase = options.previewHrefBase ?? ownerWebsitePreviewHref(token);
  const previewPath = new URL(previewHrefBase, "https://preview.strelva.invalid").pathname;
  const html = load(renderRebuildPreview(record, { revision: candidate.revision, contentHash: candidate.contentHash, page }, { previewHrefBase }));
  html("head").prepend('<meta name="referrer" content="no-referrer">');
  html("img").attr("referrerpolicy", "no-referrer");
  // Preview links navigate only inside this immutable document. Public contact,
  // booking, payment and other destinations cannot act from a preview.
  html("a[href]").each((_index, element) => {
    const anchor = html(element);
    const href = anchor.attr("href") ?? "";
    if (!href.startsWith(`${previewPath}?`) && !href.startsWith("#")) {
      anchor.removeAttr("href").attr("aria-disabled", "true");
    }
  });
  html("button,input,textarea,select").attr("disabled", "disabled");
  html("form").removeAttr("action").removeAttr("method");
  const copyId = item.sourceId.split(":").at(-1)?.match(/^copy\.(.+)$/)?.[1];
  const completeCopy = copyId ? candidate.document.nodes[copyId]?.props : null;
  const copyValues = (value: unknown): string[] => {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) return value.flatMap(copyValues);
    if (typeof value === "object") return Object.values(value).flatMap(copyValues);
    return [String(value)];
  };
  const copy = completeCopy ? `<details open><summary>Complete copy awaiting your decision</summary><div style="white-space:pre-wrap;overflow-wrap:anywhere;max-width:65ch;line-height:1.6">${copyValues(completeCopy).map(value => `<p>${escapeSiteHtml(value)}</p>`).join("")}</div></details>` : "";
  const decisionHref = options.decisionHref ?? `/api/approve?${new URLSearchParams({ token })}`;
  html("body").prepend(`<aside aria-label="Website review" style="padding:24px;font-family:Arial,sans-serif;border-bottom:1px solid #dedbd7"><h1>${escapeSiteHtml(item.title)}</h1><p>This is the exact website preview for your decision. Nothing changes here. Visitor actions are disabled.</p>${copy}<a href="${escapeSiteHtml(decisionHref)}">Return to your decision</a></aside>`);
  return new Response(html.html(), { headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "X-Website-Content-Hash": candidate.contentHash } });
}

/** A bearer link can read ONE current website decision; GET never claims or executes it. */
export async function ownerWebsitePreviewResponse(request: Request, deps: {
  read?: typeof readPreview;
  flag?: typeof workspaceReleaseFlagEnabled;
} = {}): Promise<Response> {
  const refuse = (status = 404) => new Response("This preview is unavailable or has changed. Open the latest email from Strelva.", { status, headers });
  if (!ownerWebsitePreviewMayBeOn()) return refuse();
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  let claims: WorkspaceApproveLinkClaims | null;
  try { claims = token.length <= 4096 ? verifyWorkspaceApproveToken(token) : null; }
  catch { return refuse(); }
  if (!claims) return refuse();
  try {
    const flag = deps.flag ?? workspaceReleaseFlagEnabled;
    for (const name of ["owner_entry", "owner_decision_links", "website_rebuild"] as const) {
      if (!await flag(name, claims.workspaceId)) return refuse();
    }
    const { item, record } = resultSchema.parse(await (deps.read ?? readPreview)(claims));
    if (item.id !== claims.itemId || item.workspaceId !== claims.workspaceId || record.workspaceId !== claims.workspaceId
      || item.revisionHash !== claims.revision || item.state !== "open" || item.signInRequired
      || item.route !== "owner_decides" || item.sourceLifecycle !== "website_document" || Date.parse(item.expiresAt) <= Date.now()) return refuse();
    // Hashes include the current work revision, candidate revision and document hash.
    // A source changed since the email cannot disclose a newer private preview.
    const current = [websiteDocumentItem(record), ...websiteDocumentFactItems(record), ...websiteDocumentCopyItems(record)]
      .find(proposed => proposed?.sourceId === item.sourceId && proposed.revisionHash === claims.revision);
    const candidate = record.rebuild.candidate;
    if (!current || !candidate) return refuse();
    const page = safeSitePathSchema.parse(url.searchParams.get("page") ?? "/");
    if (!candidate.document.pages.some(value => value.path === page)) return refuse();
    return renderOwnerWebsitePreview(item, record, token, page);
  } catch { return refuse(); }
}
