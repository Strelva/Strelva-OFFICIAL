import { buildWebsiteSystemDetail, type WebsiteSystemDetail } from "@/experience/systems/website-detail";

/**
 * Fictional website System lists for the local preview (`websiteDetail=`
 * empty | partial | connected | error | loading | permission). Built through
 * the same merge the server uses; nothing here touches a real site.
 */
export type PreviewWebsiteDetailMode = "full" | "empty" | "partial" | "connected" | "error" | "loading" | "permission";

const MODES = new Set<PreviewWebsiteDetailMode>(["empty", "partial", "connected", "error", "loading", "permission"]);
export function previewWebsiteDetailMode(value: string | null): PreviewWebsiteDetailMode {
  return value && MODES.has(value as PreviewWebsiteDetailMode) ? value as PreviewWebsiteDetailMode : "full";
}

export function previewWebsiteDetail(systemId: string, mode: PreviewWebsiteDetailMode, now = Date.parse("2026-10-07T15:00:00.000Z"), workspaceId = "11111111-1111-4111-8111-111111111111"): WebsiteSystemDetail {
  const day = (offset: number) => new Date(now - offset * 86_400_000).toISOString();
  const empty = { systemId, actorId: "preview", workspaceId, workId: "f1000000-0000-4000-8000-000000000002", domains: [], decisions: [], draftSections: [], siteReview: null, changeRequests: [], serviceRequests: [], contentVersions: [], snapshots: [], documentRevisions: [], linkedPublications: [], unavailable: [] };
  if (mode === "empty") return buildWebsiteSystemDetail(empty);
  if (mode === "connected") return buildWebsiteSystemDetail({
    ...empty,
    domains: [{ hostname: "www.attymooney.com", state: "pending", label: "Waiting for proof it's yours", lastCheckedAt: null, whoCanChange: "Your site's builder; Strelva never changes it." }],
    connectedSite: {
      siteId: "f1000000-0000-4000-8000-000000000001", siteHost: "www.attymooney.com", verified: false, lastEventAt: null, activity: {}, inquiries: [],
      install: { script: '<script src="https://app.strelva.com/connect.js" data-strelva-site="sk_pub_fictionalpreviewkey00001" defer></script>', meta: '<meta name="strelva-site-verification" content="fictionalpreviewtoken00000000001">' },
    },
  });
  const partial = mode === "partial";
  return buildWebsiteSystemDetail({
    ...empty,
    domains: partial ? [] : [
      { hostname: "www.attymooney.com", state: "verified", label: "Verified", lastCheckedAt: day(0.1), whoCanChange: "The owner decides; Strelva prepares the records." },
      { hostname: "attymooney.com", state: "misconfigured", label: "DNS misconfigured", lastCheckedAt: day(0.1), whoCanChange: "The owner decides; Strelva prepares the records." },
    ],
    decisions: [{ id: "preview-holiday", title: "Put the spring consultation offer at the top of the homepage until May 1", detail: "Strelva drafted it. It goes live when you approve.", openedAt: day(1), openHref: null }],
    draftSections: ["faq"],
    changeRequests: [
      { requestId: "preview-events", title: "Add a private consultations page", kind: "custom_request", status: "in_progress", createdAt: day(3) },
      { requestId: "preview-footer", title: "New office hours in the footer", kind: "custom_request", status: "shipped", createdAt: day(9), resolvedAt: day(6) },
    ],
    contentVersions: partial ? [] : [
      { id: "v_preview_1", section: "hero", author: "ai", timestamp: day(2), status: "live" },
      { id: "v_preview_2", section: "contact", author: "user", timestamp: day(5), status: "rolled-back" },
    ],
    snapshots: [{ id: "snap_preview", label: "Daily copy", reason: "daily", author: "system", createdAt: day(1), status: "available" }],
    documentRevisions: [1, 2].map(revision => ({ revision, contentHash: String(revision).repeat(64), createdAt: day(10 - revision), createdBy: "preview", published: true })),
    unavailable: partial ? ["Domains", "Content history"] : [],
  });
}
