import path from "node:path";
import { localTarget, sourceImports, type BoundaryViolation } from "./product-boundaries";

const PRODUCT_ROOT = /^src\/products\/[^/]+\/(?:contracts|domain|engine|inquiry-engine)\.[cm]?[jt]s$/;
const PLATFORM_ROOTS = new Set([
  "src/platform/work-execution/engine.ts",
  "src/platform/work-execution/standing.ts",
  "src/platform/service-requests/delivery-commitment.ts",
  "src/platform/work-economics/types.ts",
  "src/platform/work-economics/execution-contracts.ts",
  "src/platform/work-economics/execution-engine.ts",
  "src/platform/work-economics/allowances-types.ts",
  "src/lib/ai-governance.ts",
  "src/lib/agent-risk.ts",
]);
const RULE_PACKAGES = new Set(["zod", "node:crypto"]);
const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

function runtimeModule(target: string): boolean {
  return /^src\/(?:app|components|experience|server)(?:\/|$)/.test(target)
    || /^src\/lib\/(?:db|auth|redis)(?:\/|$)/.test(target)
    || /(?:^|\/)(?:server|service|repository|adapters?)(?:\/|$)/.test(target)
    || /-(?:service|repository|adapter)$/.test(target);
}

/** Follow every local dependency of domain roots, including imports of types. */
export function checkDomainDependencies(input: ReadonlyMap<string, string>): BoundaryViolation[] {
  const files = new Map([...input].map(([file, source]) => [path.posix.normalize(file.replaceAll("\\", "/")), source]));
  const pending = [...files.keys()].filter((file) => PRODUCT_ROOT.test(file) || PLATFORM_ROOTS.has(file));
  const visited = new Set<string>();
  const violations: BoundaryViolation[] = [];
  while (pending.length) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    for (const { specifier, line } of sourceImports(file, files.get(file)!)) {
      const target = specifier === null ? null : localTarget(file, specifier);
      let reason: string | null = null;
      if (specifier === null) {
        reason = "Domain dependencies must use literal module names so their complete dependency graph can be checked.";
      } else if (target === null) {
        if (!RULE_PACKAGES.has(specifier)) reason = "Domain rules and contracts cannot import provider, storage, framework, or other runtime packages.";
      } else if (runtimeModule(target)) {
        reason = "Domain rules and contracts cannot depend on runtime adapters, including through shared types or re-exports.";
      } else {
        const dependency = [...EXTENSIONS.map((extension) => target + extension), ...EXTENSIONS.map((extension) => `${target}/index${extension}`)]
          .find((candidate) => files.has(candidate));
        if (dependency) pending.push(dependency);
        else reason = "A local domain dependency could not be resolved; its dependency graph must not be silently skipped.";
      }
      if (reason) violations.push({ file, line, importPath: specifier ?? "<dynamic>", reason });
    }
  }
  return violations;
}
