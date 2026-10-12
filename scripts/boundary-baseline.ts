import type { BoundaryViolation } from "./product-boundaries";
import { LIB_IMPORTS_WORKSPACE, WORKSPACE_IMPORTS_LIB, type LayerViolation } from "./layer-boundaries";

/**
 * scripts/boundary-baseline.json: the boundary imports that existed when the
 * check started failing CI (Strelva Reborn section 7). It only shrinks.
 *
 * - `workspaceImportsLib`: workspace file -> the src/lib modules it imports.
 * - `boundaries`: older product-entry, platform and domain violations, as
 *   "file -> import :: reason".
 *
 * src/lib -> workspace imports are never baselined.
 */
export interface BoundaryBaseline {
  about?: string;
  workspaceImportsLib: Record<string, string[]>;
  boundaries: string[];
}

export function boundaryKey(violation: BoundaryViolation): string {
  return `${violation.file} -> ${violation.importPath} :: ${violation.reason}`;
}

function observedLayerPairs(layer: LayerViolation[]): Map<string, Set<string>> {
  const pairs = new Map<string, Set<string>>();
  for (const violation of layer) {
    if (violation.rule !== WORKSPACE_IMPORTS_LIB) continue;
    const targets = pairs.get(violation.file) ?? new Set<string>();
    targets.add(violation.target);
    pairs.set(violation.file, targets);
  }
  return pairs;
}

export function compareWithBaseline(baseline: BoundaryBaseline, boundaries: BoundaryViolation[], layer: LayerViolation[]) {
  const allowedBoundaries = new Set(baseline.boundaries ?? []);
  const allowedPairs = baseline.workspaceImportsLib ?? {};
  const failures: (BoundaryViolation | LayerViolation)[] = [];

  const seenBoundaries = new Set<string>();
  for (const violation of boundaries) {
    const key = boundaryKey(violation);
    seenBoundaries.add(key);
    if (!allowedBoundaries.has(key)) failures.push(violation);
  }

  for (const violation of layer) {
    if (violation.rule === LIB_IMPORTS_WORKSPACE) {
      failures.push(violation);
    } else if (!(allowedPairs[violation.file] ?? []).includes(violation.target)) {
      failures.push(violation);
    }
  }

  const observed = observedLayerPairs(layer);
  const stale = [
    ...[...allowedBoundaries].filter((key) => !seenBoundaries.has(key)).map((key) => `boundaries entry "${key}"`),
    ...Object.entries(allowedPairs).flatMap(([file, targets]) =>
      targets.filter((target) => !observed.get(file)?.has(target)).map((target) => `workspaceImportsLib entry ${file} -> ${target}`)),
  ];

  return {
    failures,
    stale,
    baselined: {
      boundaries: allowedBoundaries.size,
      workspaceFiles: Object.keys(allowedPairs).length,
      workspaceImportsLib: Object.values(allowedPairs).reduce((sum, targets) => sum + targets.length, 0),
    },
  };
}

/** Drop entries that no longer occur. Never adds one. */
export function pruneBaseline(baseline: BoundaryBaseline, boundaries: BoundaryViolation[], layer: LayerViolation[]) {
  const seenBoundaries = new Set(boundaries.map(boundaryKey));
  const observed = observedLayerPairs(layer);
  let removed = 0;
  const keptBoundaries = (baseline.boundaries ?? []).filter((key) => {
    const keep = seenBoundaries.has(key);
    if (!keep) removed += 1;
    return keep;
  });
  const keptPairs: Record<string, string[]> = {};
  for (const [file, targets] of Object.entries(baseline.workspaceImportsLib ?? {})) {
    const kept = targets.filter((target) => observed.get(file)?.has(target));
    removed += targets.length - kept.length;
    if (kept.length) keptPairs[file] = kept;
  }
  return { removed, baseline: { ...baseline, boundaries: keptBoundaries, workspaceImportsLib: keptPairs } };
}
