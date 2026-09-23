import path from "node:path";
import ts from "typescript";

export interface BoundaryViolation {
  file: string;
  line: number;
  importPath: string;
  reason: string;
}

const PRODUCT_ENTRIES = new Set(["index", "contracts", "server", "client"]);

// This migrated domain and its transitive local dependencies stay independent
// of storage and UI. Checking the contracts too prevents a server re-export
// from becoming an indirect dependency of otherwise clean domain code.
const APPLICATION_DOMAIN_MODULES = new Set([
  "src/products/applications/domain",
  "src/products/applications/contracts",
  "src/products/applications/date-only",
  "src/platform/bounded-work/contracts",
  "src/platform/workspaces/types",
]);

function applicationDomainReason(file: string, target: string | null, specifier: string): string | null {
  const modulePath = file.replace(/\.(?:[cm]?[jt]sx?)$/, "");
  if (!APPLICATION_DOMAIN_MODULES.has(modulePath)) return null;
  if (specifier === "zod" || (target && APPLICATION_DOMAIN_MODULES.has(target))) return null;
  return "Native application rules and their contracts cannot depend on runtime adapters. Keep storage, providers, and presentation outside the domain.";
}

export function localTarget(file: string, specifier: string): string | null {
  const target = specifier.startsWith("@/")
    ? `src/${specifier.slice(2)}`
    : specifier.startsWith(".")
      ? path.posix.join(path.posix.dirname(file), specifier)
      : null;
  return target ? path.posix.normalize(target).replace(/\.(?:[cm]?[jt]sx?)$/, "") : null;
}

function productOf(file: string): string | null {
  return /^src\/products\/([^/]+)(?:\/|$)/.exec(file)?.[1] ?? null;
}

function boundaryReason(file: string, target: string): string | null {
  if (file.startsWith("src/platform/") && /^src\/(app|products|experience)(\/|$)/.test(target)) {
    return "Platform modules cannot depend on routes, products, or the experience layer.";
  }
  if (productOf(file) && /^src\/(app|experience)(\/|$)/.test(target)) {
    return "Products cannot depend on routes or the experience layer.";
  }
  const targetProduct = productOf(target);
  if (targetProduct && productOf(file) !== targetProduct && !file.startsWith("src/__tests__/")) {
    const entry = target.split("/").slice(3);
    if (entry.length > 1 || (entry.length === 1 && !PRODUCT_ENTRIES.has(entry[0]!))) {
      return "Import a product through its index, contracts, server, or client entry point.";
    }
  }
  return null;
}

export interface SourceImport {
  specifier: string | null;
  line: number;
}

/** Includes type imports, re-exports and dynamic loads; comments are not imports. */
export function sourceImports(file: string, source: string): SourceImport[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports: SourceImport[] = [];
  function inspect(node: ts.Node): void {
    let literal: ts.Node | undefined;
    let moduleLoad = false;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      literal = node.moduleSpecifier;
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      literal = node.moduleReference.expression;
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      literal = node.argument.literal;
    } else if (ts.isCallExpression(node) && (
      node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require")
    )) {
      literal = node.arguments[0];
      moduleLoad = true;
    }
    if (literal || moduleLoad) {
      imports.push({
        specifier: literal && ts.isStringLiteralLike(literal) ? literal.text : null,
        line: ast.getLineAndCharacterOfPosition((literal ?? node).getStart(ast)).line + 1,
      });
    }
    ts.forEachChild(node, inspect);
  }
  inspect(ast);
  return imports;
}

export function checkProductBoundaries(file: string, source: string): BoundaryViolation[] {
  file = path.posix.normalize(file.replaceAll("\\", "/"));
  return sourceImports(file, source).flatMap(({ specifier, line }) => {
    if (specifier === null) return [];
    const target = localTarget(file, specifier);
    const reason = applicationDomainReason(file, target, specifier) ?? (target && boundaryReason(file, target));
    return reason ? [{ file, line, importPath: specifier, reason }] : [];
  });
}
