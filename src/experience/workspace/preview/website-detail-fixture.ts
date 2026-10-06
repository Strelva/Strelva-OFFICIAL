import { buildWebsiteSystemDetail, type WebsiteSystemDetail } from "@/experience/systems/website-detail";

/**
 * Fictional website System lists for the local preview (`websiteDetail=`
 * empty | partial | error | loading | permission). Built through the same
 * merge the server uses; nothing here touches a real site.
 */
export type PreviewWebsiteDetailMode = "full" | "empty" | "partial" | "error" | "loading" | "permission";

export function previewWebsiteDetailMode(value: string | null): PreviewWebsiteDetailMode {
  return value === "empty" || value === "partial" || value === "error" || value === "loading" || value === "permission" ? value : "full";
}

export function previewWebsiteDetail(systemId: string, mode: PreviewWebsiteDetailMode, now = Date.parse("2026-10-07T15:00:00.000Z")): WebsiteSystemDetail {
  const day = (offset: number) => new Date(now - offset * 86_400_000).toISOString();
  if (mode === "empty") return buildWebsiteSystemDetail({ systemId, actorId: "preview", domains: [], decisions: [], draftSections: [], siteReview: null, changeRequests: [], serviceRequests: [], contentVersions: [], snapshots: [], documentRevisions: [], linkedPublications: [], unavailable: [] });
  return buildWebsiteSystemDetail({
    systemId, actorId: "preview",
    domains: [
      { hostname: "www.attymooney.com", state: "verified", label: "Verified", lastCheckedAt: day(0.1), whoCanChange: "The owner decides; Strelva prepares the records." },
      { hostname: "attymooney.com", state: "misconfigured", label: "DNS misconfigured", lastCheckedAt: day(0.1), whoCanChange: "The owner decides; Strelva prepares the records." },
    ],
    decisions: [{ id: "preview-holiday", title: "Put the spring consultation offer at the top of the homepage until May 1", detail: "Strelva drafted it. It goes live when you approve.", openedAt: day(1), openHref: null }],
    draftSections: ["faq"],
    siteReview: null,
    changeRequests: [
      { requestId: "preview-events", title: "Add a private consultations page", kind: "custom_request", status: "in_progress", createdAt: day(3) },
      { requestId: "preview-footer", title: "New office hours in the footer", kind: "custom_request", status: "shipped", createdAt: day(9), resolvedAt: day(6) },
    ],
    serviceRequests: [],
    contentVersions: [
      { id: "v_preview_1", section: "hero", author: "ai", timestamp: day(2), status: "live" },
      { id: "v_preview_2", section: "contact", author: "user", timestamp: day(5), status: "rolled-back" },
    ],
    snapshots: [{ id: "snap_preview", label: "Daily copy", reason: "daily", author: "system", createdAt: day(1), status: "available" }],
    documentRevisions: [],
    linkedPublications: [],
    unavailable: mode === "partial" ? ["Domains", "Content history"] : [],
  });
}
