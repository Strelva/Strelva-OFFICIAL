import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { renderOwnerWebsitePreview } from "@/app/api/owner-website-preview/preview";
import { ownerDecisionSchema } from "@/platform/needs-you/contracts";
import { websiteDocumentCopyItems } from "@/platform/needs-you/sources/website-document";
import { websiteRebuildSchema, siteDocumentHash, siteDocumentSchema, safeSitePathSchema } from "@/products/websites/index";

export const dynamic = "force-dynamic";

/** Fictional renderer specimen only: no token issuing, auth, database, session or decisions. */
export async function GET(request: Request): Promise<Response> {
  if (!strelvaUiPreviewEnabled()) return new Response("Not found", { status: 404 });
  const page = safeSitePathSchema.safeParse(new URL(request.url).searchParams.get("page") ?? "/");
  if (!page.success || !["/", "/about"].includes(page.data)) return new Response("Not found", { status: 404 });
  const workId = "b7000000-0000-4000-8000-000000000002";
  const workspaceId = "b7000000-0000-4000-8000-000000000001";
  const body = "Our first conversation gives you room to describe what happened and what you want to do next. We listen, explain the possible paths, and identify the information needed before you choose a course of action. You can ask about the work, the timing, and the terms before making a commitment. This fictional preview demonstrates how the complete wording reaches an owner for review. ".repeat(4);
  const document = siteDocumentSchema.parse({ version: 2, siteName: "Fictional Firm", theme: { palette: "light", typeScale: "standard" },
    pages: [{ path: "/", title: "Fictional Firm", description: "Fictional review only", root: "root" }, { path: "/about", title: "About this fictional firm", description: "Fictional review only", root: "root" }],
    nodes: {
      root: { id: "root", type: "Section", variant: "container", props: {}, children: ["nav", "hero", "inquiry"], factIds: [] },
      nav: { id: "nav", type: "Header", variant: "logo-left", props: { brand: "Fictional Firm", links: [{ label: "Home", href: "/" }, { label: "About", href: "/about" }] }, children: [], factIds: [] },
      hero: { id: "hero", type: "Hero", variant: "statement", props: { title: "Start with a conversation", body }, children: [], factIds: [], verification: { supported: false, confidence: 0.5, needsReview: true } },
      inquiry: { id: "inquiry", type: "InquiryForm", variant: "inline", props: { title: "Tell us what you need" }, children: [], factIds: [] },
    }, facts: {}, assets: {}, redirects: [], provenance: { composer: "rules" },
  });
  const record = { workId, workspaceId, rebuild: websiteRebuildSchema.parse({ version: 2, revision: 4, title: "Fictional Firm",
    input: { requestId: "fictional-preview", description: "A fictional firm website", businessName: "Fictional Firm" }, status: "review_ready",
    stages: [], checkpoint: null, candidate: { revision: 2, contentHash: siteDocumentHash(document), document, previewHref: `/api/websites/${workId}/preview` },
    approvedCandidateRevision: null, tenantId: null, launch: { receipt: null, readBack: null }, lastError: null, createdBy: workId,
    createdAt: "2026-10-07T14:00:00Z", history: [],
  }) };
  const proposed = websiteDocumentCopyItems(record)[0]!;
  const item = ownerDecisionSchema.parse({ ...proposed, id: "b7000000-0000-4000-8000-000000000003", workspaceId, systemId: null,
    signInRequired: false, state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null,
    deliveryState: "not_sent", operatorNote: null, openedAt: "2026-10-07T14:00:00Z", expiresAt: "2026-10-21T14:00:00Z",
    reminded1At: null, reminded2At: null, deliveries: [],
  });
  return renderOwnerWebsitePreview(item, record, "fictional-preview-only", page.data, {
    previewHrefBase: "/preview/strelva/owner-website-preview?fixture=1",
    decisionHref: "/preview/strelva/owner-website-preview?fixture=1",
  });
}
