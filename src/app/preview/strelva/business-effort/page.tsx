import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { BusinessEffortPortfolio } from "@/app/admin/work/BusinessEffort";
import type { BusinessEffortLoad } from "@/app/admin/work/effort-data";
import { measureBusinessEffort } from "@/platform/business-effort/measure";
import type { BusinessEffortEntry, EffortBusiness } from "@/platform/business-effort/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Human-minute coverage · Local preview", robots: { index: false, follow: false } };

/** Fictional local-only fixture, rendering the /admin/work component and real
 * measure. Mutations still require a verified operator session; no fake saves. */
export default async function BusinessEffortPreview({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { scenario } = await searchParams;
  const operator = "00000000-0000-4000-8000-000000000001";
  const now = new Date("2026-10-07T12:00:00Z");
  const businesses: EffortBusiness[] = scenario === "empty" ? [] : [
    { id: "10000000-0000-4000-8000-000000000001", name: "Harbor Bakery", tenantIds: ["harbor-bakery"], firstEffortOn: "2026-08-01" },
    { id: "10000000-0000-4000-8000-000000000002", name: "Alder Tile", tenantIds: [], firstEffortOn: "2026-08-01" },
    { id: "10000000-0000-4000-8000-000000000003", name: "Willow Pilates", tenantIds: [], firstEffortOn: null },
  ];
  const entries: BusinessEffortEntry[] = businesses.flatMap((business, index) => {
    if (index === 2 && scenario !== "complete") return [];
    return ["2026-08-31", "2026-09-30"].map((occurredOn, month) => ({
      id: `20000000-0000-4000-8000-${String(index * 2 + month + 1).padStart(12, "0")}`,
      businessId: business.id, minutes: index === 0 ? (month === 0 ? 90 : 30) : 0,
      category: "other", occurredOn, note: index === 0 ? "Customer change review" : "No human work this month",
      recordedBy: operator, recordedAt: `${occurredOn}T12:00:00Z`, void: null,
    }));
  });
  const load: BusinessEffortLoad = scenario === "unavailable" || scenario === "denied" || scenario === "disabled"
    ? { state: scenario }
    : { state: "ready", today: "2026-10-07", overview: { businesses, entries, measure: measureBusinessEffort({ businesses, entries, now }) } };
  return <main data-dashboard className="min-h-screen bg-surface-base px-5 py-6 text-warm-white md:px-8 md:py-7"><BusinessEffortPortfolio load={load} /></main>;
}
