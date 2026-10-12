import type { Observation } from "@/platform/system-health/contracts";
import { bareHostname } from "@/products/websites/client";
import { investigationSchema } from "./contracts";

/**
 * A saved check is health evidence for the System it watches, not a System
 * of its own (docs/product/specs/systems-catalog.md 3.6). Each check yields
 * one observation per watched System from its latest run:
 *
 * - agreement, no change or a first baseline: pass
 * - discrepancy or a changed page: warn, naming the check
 * - unavailable evidence or no run yet: unknown
 *
 * Evidence expires after two check intervals. Scheduled runs need
 * STRELVA_BACKGROUND_WORK_RELEASE, which is off, so a check nobody re-runs
 * goes stale and health reads "Last checked <date>", never healthy.
 */
export interface WatchedSystem {
  systemId: string;
  savedWorkId: string | null;
  /** Bare public hostname for a website System, when known. */
  domain: string | null;
}

export interface SavedCheckWork {
  id: string;
  productId: string;
  resourceKind: string;
  title?: string | null;
  payload: unknown;
}

const RESULT_OUTCOME = {
  baseline: "pass", agreement: "pass", no_change: "pass",
  discrepancy: "warn", changed: "warn", unavailable: "unknown",
} as const;

export function savedCheckObservations(work: readonly SavedCheckWork[], systems: readonly WatchedSystem[]): Observation[] {
  const observations: Observation[] = [];
  for (const item of work) {
    if (item.productId !== "investigations" || item.resourceKind !== "investigation") continue;
    const parsed = investigationSchema.safeParse(item.payload);
    if (!parsed.success) continue;
    const check = parsed.data;
    const title = (item.title?.trim() || check.title || "A saved check").slice(0, 120);
    const watched = new Set<string>();
    for (const source of check.sources) {
      if ("workId" in source) {
        for (const system of systems) if (system.savedWorkId === source.workId) watched.add(system.systemId);
      } else {
        const host = bareHostname(source.url);
        for (const system of systems) if (host && system.domain === host) watched.add(system.systemId);
      }
    }
    if (!watched.size) continue;
    const latest = check.runs.at(-1);
    const outcome = latest ? RESULT_OUTCOME[latest.result] : "unknown";
    const message = !latest ? `${title} has not run yet.`
      : latest.result === "discrepancy" ? `${title}: the sources disagree.`
        : latest.result === "changed" ? `${title}: the page changed since the last check.`
          : latest.result === "unavailable" ? `${title}: the last check could not read its sources.`
            : `${title}: no difference found.`;
    for (const subjectId of watched) {
      observations.push({
        subjectId, signal: `saved-check.${item.id}`, outcome, observedAt: latest?.at ?? null,
        maxAgeSeconds: check.intervalMinutes * 60 * 2, source: "saved-check", message,
      });
    }
  }
  return observations;
}
