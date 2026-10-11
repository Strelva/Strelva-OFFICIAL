import { existsSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { localTarget, sourceImports } from "../../scripts/product-boundaries";

const builtins = new Set(builtinModules.flatMap(name => [name, name.replace(/^node:/, "")]));

function runtimeDependencies(file: string, source: string) {
  // Types may describe a server result without importing its implementation.
  const emitted = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return sourceImports(file, emitted);
}

function forbiddenClientPaths(entry: string): string[] {
  const pending = [[entry]];
  const visited = new Set<string>();
  const violations: string[] = [];
  while (pending.length) {
    const chain = pending.pop()!;
    const file = chain.at(-1)!;
    if (visited.has(file)) continue;
    visited.add(file);
    for (const { specifier } of runtimeDependencies(file, readFileSync(file, "utf8"))) {
      if (specifier === null) {
        violations.push(`${chain.join(" -> ")} -> unresolved dynamic import`);
        continue;
      }
      if (specifier.startsWith("node:") || builtins.has(specifier) || specifier === "server-only" || specifier === "next/headers") {
        violations.push([...chain, specifier].join(" -> "));
      }
      const target = localTarget(file, specifier);
      if (!target) continue;
      const resolved = [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`, `${target}/index.tsx`]
        .find(candidate => existsSync(candidate) && statSync(candidate).isFile());
      if (resolved) pending.push([...chain, path.posix.normalize(resolved)]);
      else violations.push([...chain, `unresolved ${specifier}`].join(" -> "));
    }
  }
  return violations;
}

describe("product client entry runtime dependencies", () => {
  it("erases type-only server references while retaining value re-exports", () => {
    expect(runtimeDependencies("src/products/example/client.ts", `
      export type { Result } from "./server";
      import type { Receipt } from "./repository";
      export { preview } from "./projection";
    `).map(value => value.specifier)).toEqual(["./projection"]);
  });

  it.each(["google-listing", "inquiries", "publishing", "websites"])(
    "%s stays independent of Node and server-only implementations", product => {
      expect(forbiddenClientPaths(`src/products/${product}/client.ts`)).toEqual([]);
    },
  );
});
