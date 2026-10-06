import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { WorkspaceRecaps, type RecapPeriodFilter, type WorkspaceRecapsState } from "@/experience/recaps/WorkspaceRecaps";
import type { RecapView } from "@/products/recaps/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strelva · Recaps preview", robots: { index: false, follow: false } };

const WORKSPACE = "5e000000-0000-4000-8000-000000000010";

/** Fictional recaps for a fictional business. */
const RECAPS: RecapView[] = [
  { id: "w40", period: "week", start: "2026-09-28", end: "2026-10-04", summary: "More people found the fall menu this week, mostly from Google Maps.", highlights: ["Strelva fixed a broken image on the menu page", "Two new 5-star reviews"], visits: 486, visitsDelta: 14, customerActions: 23, nextAction: { title: "Add the holiday hours", description: "Three visitors asked about Thanksgiving week." } },
  { id: "m09", period: "month", start: "2026-09-01", end: "2026-09-30", summary: "September was the busiest month since spring. Catering inquiries doubled.", highlights: ["1,912 visits", "Catering page is now the second most visited page"], visits: 1912, visitsDelta: 22, customerActions: 87, nextAction: null },
  { id: "w39", period: "week", start: "2026-09-21", end: "2026-09-27", summary: "A steady week.", highlights: [], visits: 402, visitsDelta: -3, customerActions: 17, nextAction: null },
];

export default async function RecapsPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string; period?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state: name, period: periodParam } = await searchParams;
  const period: RecapPeriodFilter = periodParam === "week" || periodParam === "month" ? periodParam : "all";
  const site = { tenantId: "juniper", siteName: "Juniper Bakery", unavailable: false, recaps: RECAPS };
  const state: WorkspaceRecapsState = name === "permission" ? { kind: "permission" }
    : name === "error" ? { kind: "error" }
    : name === "empty" ? { kind: "ready", sites: [{ ...site, recaps: [] }] }
    : name === "unlinked" ? { kind: "ready", sites: [] }
    : name === "unavailable" ? { kind: "ready", sites: [{ ...site, recaps: [], unavailable: true }] }
    : { kind: "ready", sites: [site] };
  return <WorkspaceRecaps workspaceId={WORKSPACE} state={state} period={period} />;
}
