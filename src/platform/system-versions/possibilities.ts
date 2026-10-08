/** Version alternatives join the System's Possibilities projection while the
 * existing version_release decision remains their sole activation path.
 * Generic Possibility effects cannot also activate this candidate. */
import { changedPaths, jsonEqual } from "./compare";
import { applyOverrides } from "./service";
import { improvementPossibility } from "./improvement";
import type { ImprovementComparison, VersionLineage } from "./types";
import { versionReleaseRevision } from "@/platform/needs-you/sources/version-release";

export function projectVersionPossibilities(lineage: VersionLineage, offers: readonly ImprovementComparison[], sourceName: string) {
  const latest = offers.at(-1);
  const declined = latest && [...lineage.decisions].reverse().find(decision => decision.sourceRevision === latest.sourceRevision)?.choice === "declined";
  const possibilities = latest && latest.status !== "up_to_date" && !declined ? [improvementPossibility(lineage, latest, sourceName)] : [];
  const preview = applyOverrides(lineage.baseline.definition, lineage.overrides);
  const release = lineage.releases.find(item => item.number === lineage.currentRelease);
  const pendingRelease = release && jsonEqual(release.definition, preview) ? null : {
    id: `version-release:${lineage.id}:${lineage.rowRevision}`,
    system: lineage.version,
    title: `Updated ${lineage.context.label}`,
    status: "ready" as const,
    rowRevision: lineage.rowRevision,
    decisionRevision: versionReleaseRevision(lineage.id, lineage.rowRevision),
    current: release?.definition ?? null,
    preview,
    changedPaths: changedPaths(release?.definition ?? {}, preview),
    makeReal: { kind: "version_release" as const, versionId: lineage.id },
  };
  return { possibilities, pendingRelease };
}
