"use client";
/** Client-only pieces of the legacy dashboard preview (functions cannot cross from the server page). */
import { DashboardErrorView } from "@/components/dashboard/DashboardErrorView";
import type { ReactNode } from "react";
import { ChatPageClient } from "@/app/dashboard/chat/ChatPageClient";
import SettingsPage from "@/app/dashboard/settings/page";
import { PhotoLibrary } from "@/components/dashboard/PhotoLibrary";
import { BrandKitPanel } from "@/components/dashboard/BrandKitPanel";
import { CollectionsManager } from "@/components/dashboard/CollectionsManager";
import { ConnectionsPage } from "@/components/dashboard/ConnectionsPage";
import { ConnectionDetailPage } from "@/components/dashboard/ConnectionDetailPage";
import { ContentWorkspace } from "@/components/dashboard/ContentWorkspace";
import type { SectionData } from "@/platform/infra/section-summary";
import { legacyPending, legacyResolved, type LegacyState } from "./legacy-dashboard-fixtures";

/** The route error view, rendered directly: nothing is thrown or logged. */
export function LegacyErrorPreview() {
  return <DashboardErrorView onRetry={() => window.location.reload()} />;
}

/**
 * Deleting a photo: the real PhotoLibrary with one photo open beside the grid
 * (marked in it) and its in-place question already asked. Saying yes takes it
 * out with Undo; the fixture API's delete only runs when the window ends.
 */
export function LegacyConfirmPreview() {
  return <PhotoLibrary initialSelectedId="m1" askDeleteFirst />;
}

/* ---------- Real client components, fixture props ---------- */


export function LegacyChat({ state }: { state: LegacyState }) {
  const pending = state === "empty" ? [] : legacyPending(state);
  return <ChatPageClient threadId={state === "ready" || state === "waiting" ? "t-hours" : undefined} ownerName="Dr. Lin"
    needsYou={{ pending, resolved: legacyResolved(), pendingCount: pending.length, staleSectionCount: 0 }} />;
}

export function LegacyPhotos() { return <PhotoLibrary />; }

export function LegacyBrandKit() {
  return <BrandKitPanel initialSettings={{ siteName: "Harbor Dental", siteTagline: "Gentle family dentistry on Elmwood Ave", siteDescription: "Cleanings, fillings, crowns and children's visits for families in Buffalo. Same-week appointments, most insurance taken.", brandVoice: "Warm and calm. First names. Never clinical or salesy.", logoUrl: "/images/workspace/ink-moss.webp" }} />;
}

export function LegacyCollections({ state }: { state: LegacyState }) {
  return <CollectionsManager types={["blog", "product"]} initialType="blog" initialEntries={state === "empty" ? [] : [
    { slug: "first-visit", status: "published", data: { title: "What happens at a child's first visit" }, updatedAt: "2026-11-20T15:00:00.000Z" },
    { slug: "insurance", status: "draft", data: { title: "Which insurance we take" }, updatedAt: "2026-11-22T21:00:00.000Z" },
    { slug: "emergency", status: "published", data: { title: "Same-week emergency visits" }, updatedAt: "2026-11-12T14:00:00.000Z" },
  ]} />;
}

export function LegacyConnections() { return <ConnectionsPage />; }
export function LegacyConnectionDetail({ id }: { id: string }) { return <ConnectionDetailPage connectionId={id} />; }
export function LegacySettings() { return <SettingsPage />; }

const SECTIONS: Record<string, SectionData> = {
  hero: { preview: "Gentle family dentistry on Elmwood.", status: "configured", chatPrompt: "Update the homepage" },
  services: { preview: "Cleanings, fillings, crowns, children's visits", status: "configured", chatPrompt: "Update the services" },
  faq: { preview: "Do you see children? What insurance do you take?", status: "configured", chatPrompt: "Update the FAQ" },
  contact: { preview: "1180 Elmwood Ave, Buffalo · (716) 555-0142", status: "configured", chatPrompt: "Update the contact details" },
};
export function LegacySite() {
  return <ContentWorkspace siteName="Harbor Dental" ownerName="Dr. Lin" sectionData={SECTIONS} timestamps={{}} />;
}

/** The history page's own scroll frame, as /dashboard/history renders it. */
export function LegacyHistoryFrame({ children }: { children: ReactNode }) {
  return <div className="h-full w-full overflow-y-auto px-4 pb-28 pt-6 md:px-[88px] md:pt-14">{children}</div>;
}
