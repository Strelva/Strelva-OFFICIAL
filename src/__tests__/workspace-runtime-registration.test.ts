import { existsSync, readFileSync, statSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";
import { localTarget } from "../../scripts/product-boundaries";

it("runtime registration eagerly loads only lightweight port definitions", () => {
  const pending = ["src/register-workspace-ports.ts"];
  const reachable = new Set<string>();
  const packages = new Set<string>();
  while (pending.length) {
    const file = pending.pop()!;
    if (reachable.has(file)) continue;
    reachable.add(file);
    const emitted = ts.transpileModule(readFileSync(file, "utf8"), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
    }).outputText;
    const ast = ts.createSourceFile(file, emitted, ts.ScriptTarget.Latest, true);
    // Dynamic imports inside callbacks are intentionally deferred until use.
    for (const statement of ast.statements) {
      if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) continue;
      const literal = statement.moduleSpecifier;
      if (!literal || !ts.isStringLiteralLike(literal)) continue;
      const target = localTarget(file, literal.text);
      if (!target) { packages.add(literal.text); continue; }
      const dependency = [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`]
        .find(candidate => existsSync(candidate) && statSync(candidate).isFile());
      expect(dependency, `${file} -> ${literal.text}`).toBeDefined();
      pending.push(dependency!);
    }
  }
  expect([...packages]).toEqual([]);
  expect([...reachable].filter(file => file.startsWith("src/platform/bookings/")))
    .toEqual(["src/platform/bookings/runtime-ports.ts"]);
  expect([...reachable].filter(file => file.startsWith("src/platform/infra/")))
    .toEqual(["src/platform/infra/tenant-publishing.ts"]);
  expect([...reachable].filter(file => file.startsWith("src/products/") || file.startsWith("src/experience/")))
    .toEqual([]);
  expect([...reachable].filter(file => file.startsWith("src/lib/")))
    .toEqual(["src/lib/workspace-ports.ts"]);
});
