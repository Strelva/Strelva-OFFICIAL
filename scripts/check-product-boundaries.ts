import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkProductBoundaries, type BoundaryViolation } from "./product-boundaries";
import { checkDomainDependencies } from "./domain-boundaries";
import { LIB_IMPORTS_WORKSPACE, checkLayerBoundaries, type LayerViolation } from "./layer-boundaries";
import { compareWithBaseline, pruneBaseline, type BoundaryBaseline } from "./boundary-baseline";

/**
 * pnpm check:boundaries [--prune]
 *
 * Fails on any import that breaks a boundary and is not in
 * scripts/boundary-baseline.json, on any src/lib -> workspace import (never
 * baselined), and on baseline entries that no longer occur. The baseline only
 * shrinks: --prune drops entries that are gone and never adds one.
 */
const BASELINE_PATH = "scripts/boundary-baseline.json";

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(file);
    return entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name) ? [file] : [];
  });
}

const files = new Map(["src", "scripts"].flatMap(sources).map((file) => [file, readFileSync(file, "utf8")]));
const boundaryViolations: BoundaryViolation[] = [
  ...[...files].flatMap(([file, source]) => checkProductBoundaries(file, source)),
  ...checkDomainDependencies(files),
];
const layerViolations: LayerViolation[] = [...files].flatMap(([file, source]) => checkLayerBoundaries(file, source));

const baseline: BoundaryBaseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as BoundaryBaseline
  : { boundaries: [], workspaceImportsLib: {} };

if (process.argv.includes("--prune")) {
  const pruned = pruneBaseline(baseline, boundaryViolations, layerViolations);
  writeFileSync(BASELINE_PATH, `${JSON.stringify(pruned.baseline, null, 2)}\n`);
  console.log(`Pruned ${pruned.removed} baseline entr${pruned.removed === 1 ? "y" : "ies"} that no longer occur.`);
}

const current: BoundaryBaseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as BoundaryBaseline : baseline;
const result = compareWithBaseline(current, boundaryViolations, layerViolations);

for (const violation of result.failures) {
  console.error(`${violation.file}:${violation.line} ${violation.reason} (${violation.importPath})`);
}
for (const stale of result.stale) {
  console.error(`${BASELINE_PATH}: ${stale} no longer occurs. Run pnpm check:boundaries --prune to shrink the baseline.`);
}
const libToWorkspace = result.failures.filter((violation) => "rule" in violation && violation.rule === LIB_IMPORTS_WORKSPACE).length;
if (result.failures.length > 0 || result.stale.length > 0) {
  process.exitCode = 1;
  if (libToWorkspace) console.error(`${libToWorkspace} src/lib -> workspace import(s): never allowed.`);
} else {
  console.log(
    `Product boundaries passed (source and scripts, including untracked files). Baseline, shrink only: ` +
    `${result.baselined.workspaceImportsLib} workspace -> src/lib imports in ${result.baselined.workspaceFiles} files, ` +
    `${result.baselined.boundaries} older boundary imports.`,
  );
}
