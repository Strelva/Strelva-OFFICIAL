import { existsSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { localTarget, sourceImports } from "../../scripts/product-boundaries";

const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, "")));
const serverPackages = /^(?:server-only|next\/(?:headers|server)|@supabase\/|@upstash\/|stripe$|resend$)/;
const extensions = [".ts", ".tsx", ".js", ".jsx"];

/** Check the emitted client graph: erased types aren't browser dependencies,
 * and a module-level server action is a Next transport boundary. */
function browserDependencies(root: string, read: (file: string) => string | undefined): string[] {
  const pending = [root];
  const visited = new Set<string>();
  const violations: string[] = [];
  while (pending.length) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    const source = read(file);
    if (source === undefined) {
      violations.push(`${file}: unresolved dependency`);
      continue;
    }
    const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const first = syntax.statements[0];
    if (first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression)
      && first.expression.text === "use server") continue;
    const emitted = ts.transpileModule(source, {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext, jsx: ts.JsxEmit.Preserve },
    }).outputText;
    for (const { specifier } of sourceImports(file, emitted)) {
      if (specifier === null) {
        violations.push(`${file}: nonliteral dependency`);
      } else if (specifier.startsWith("node:") || builtins.has(specifier) || serverPackages.test(specifier)) {
        violations.push(`${file}: ${specifier}`);
      } else {
        const target = localTarget(file, specifier);
        if (target === null) continue;
        const dependency = [...extensions.map(extension => target + extension), ...extensions.map(extension => `${target}/index${extension}`)]
          .find(candidate => read(candidate) !== undefined);
        if (dependency) pending.push(dependency);
        else violations.push(`${file}: unresolved ${specifier}`);
      }
    }
  }
  return violations;
}

const leadRows = "src/app/admin/leads/LeadRows.tsx";
function readSource(file: string): string | undefined {
  const absolute = path.join(process.cwd(), file);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : undefined;
}

describe("delivery client dependencies", () => {
  it("keeps the actual lead-row runtime graph free of Node and provider dependencies", () => {
    expect(browserDependencies(leadRows, readSource)).toEqual([]);
  });

  it("detects the original server-store import even through its transitive helpers", () => {
    const originalImport = readSource(leadRows)!.replace("@/lib/access-request-delivery-contracts", "@/lib/access-request-delivery");
    const violations = browserDependencies(leadRows, file => file === leadRows ? originalImport : readSource(file));
    expect(violations).toContain("src/lib/access-request-delivery.ts: crypto");
  });

  it("erases type-only edges and honors module-level server-action boundaries", () => {
    const files = new Map([
      ["src/client.tsx", '"use client"; import type { Row } from "./store"; import { save } from "./action"; export const submit = (row: Row) => save(row);'],
      ["src/store.ts", 'import { randomBytes } from "node:crypto"; export type Row = { id: string }; export const secret = randomBytes(4);'],
      ["src/action.ts", '"use server"; import { secret } from "./store"; export async function save() { return secret.length; }'],
    ]);
    expect(browserDependencies("src/client.tsx", file => files.get(file))).toEqual([]);
    files.set("src/action.ts", 'import { secret } from "./store"; export async function save() { "use server"; return secret.length; }');
    expect(browserDependencies("src/client.tsx", file => files.get(file))).toContain("src/store.ts: node:crypto");
  });
});
