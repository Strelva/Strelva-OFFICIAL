import { detectTrafficAnomaly } from "@/lib/anomaly";
import type { DailyMetric } from "@/lib/storage";
import type { SearchConnectionEvidence } from "@/platform/catalog-reports/search-connection";
import type { Observation } from "./contracts";

export function trafficObservation(subjectId: string, daily: DailyMetric[] | null): Observation {
  const base = { subjectId, signal: "website.traffic", maxAgeSeconds: 48 * 3600, source: "traffic" as const };
  if (!daily?.length) return { ...base, outcome: "unknown", observedAt: null, message: "Traffic trend is unavailable; this is not zero visits." };
  const ordered = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  const recent = ordered.slice(-7).reduce((sum, row) => sum + row.pageViews, 0);
  const anomaly = detectTrafficAnomaly(ordered);
  return { ...base, outcome: anomaly?.type === "drop" ? "warn" : "pass", observedAt: `${ordered.at(-1)!.date}T00:00:00.000Z`,
    message: anomaly?.headline ?? `${recent.toLocaleString()} page views in the last seven days. ${ordered.length < 28 ? "More history is needed to establish a traffic trend." : "No unusual traffic change was detected."}` };
}

export function searchConsoleObservation(subjectId: string, search: SearchConnectionEvidence | null): Observation {
  const base = { subjectId, signal: "website.search_console", maxAgeSeconds: 48 * 3600, source: "search-console" as const };
  if (!search) return { ...base, outcome: "unknown", observedAt: null, message: "Search Console has not been checked; search traffic is unavailable." };
  if (search.status === "unreachable") return { ...base, outcome: "unknown", observedAt: search.checkedAt,
    message: `Search Console is not reachable since ${(search.unreachableSince ?? search.checkedAt).slice(0, 10)}; search traffic is unavailable.` };
  return { ...base, outcome: "pass", observedAt: search.checkedAt,
    message: `Search Console: ${search.clicks!.toLocaleString()} clicks and ${search.impressions!.toLocaleString()} impressions in the last seven days.` };
}
