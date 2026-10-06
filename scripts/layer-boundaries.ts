import path from "node:path";
import { localTarget, sourceImports, type BoundaryViolation } from "./product-boundaries";

/**
 * The two-model layer rule (Strelva Reborn section 7, "Structure that keeps
 * it this way"):
 *
 * - src/lib (the tenant model) never imports a workspace layer
 *   (src/platform outside infra, src/products, src/experience, src/server).
 *   No exceptions and no baseline: src/lib declares a port in
 *   src/lib/workspace-ports.ts and the app edge registers it.
 * - A workspace layer importing src/lib is shrinking: every such import that
 *   exists today is listed in scripts/boundary-baseline.json, and no new one
 *   may be added. Shared infrastructure lives in src/platform/infra, which
 *   both models may import.
 */
export const LIB_IMPORTS_WORKSPACE = "lib-imports-workspace";
export const WORKSPACE_IMPORTS_LIB = "workspace-imports-lib";

const WORKSPACE = /^src\/(?:platform\/(?!infra(?:\/|$))|products\/|experience\/|server\/)/;
const PLATFORM_OR_WORKSPACE = /^src\/(?:platform|products|experience|server)\//;
const LIB = /^src\/lib(?:\/|$)/;

/** A workspace layer src/lib may not import (shared infrastructure excluded). */
export function isWorkspaceLayer(file: string): boolean {
  return WORKSPACE.test(file);
}

/** Code that must not grow new src/lib imports: every workspace layer, infra included. */
export function isAboveLib(file: string): boolean {
  return PLATFORM_OR_WORKSPACE.test(file);
}

export function isTenantLib(file: string): boolean {
  return LIB.test(file);
}

export interface LayerViolation extends BoundaryViolation {
  rule: typeof LIB_IMPORTS_WORKSPACE | typeof WORKSPACE_IMPORTS_LIB;
  /** The imported module, extension-free (src/lib/tenants). */
  target: string;
}

export function checkLayerBoundaries(file: string, source: string): LayerViolation[] {
  file = path.posix.normalize(file.replaceAll("\\", "/"));
  const fromLib = isTenantLib(file);
  const fromWorkspace = isAboveLib(file);
  if (!fromLib && !fromWorkspace) return [];
  return sourceImports(file, source).flatMap(({ specifier, line }): LayerViolation[] => {
    if (specifier === null) return [];
    const target = localTarget(file, specifier);
    if (!target) return [];
    if (fromLib && isWorkspaceLayer(target)) {
      return [{
        file, line, importPath: specifier, target, rule: LIB_IMPORTS_WORKSPACE,
        reason: "src/lib cannot import a workspace layer. Declare a port in src/lib/workspace-ports.ts and register it at the app edge, or move the module into the workspace layer.",
      }];
    }
    if (fromWorkspace && isTenantLib(target)) {
      return [{
        file, line, importPath: specifier, target, rule: WORKSPACE_IMPORTS_LIB,
        reason: "New workspace -> src/lib import. Import shared infrastructure from src/platform/infra, or move the tenant code into the workspace layer (scripts/boundary-baseline.json only shrinks).",
      }];
    }
    return [];
  });
}
