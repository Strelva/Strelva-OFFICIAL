import path from "node:path";
import ts from "typescript";

export interface BoundaryViolation {
  file: string;
  line: number;
  importPath: string;
  reason: string;
}

const PRODUCT_ENTRIES = new Set(["index", "contracts", "server", "client"]);

function localTarget(file: string, specifier: string): string | null {
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

/** Check static imports, re-exports, literal dynamic imports, and require calls. */
export function checkProductBoundaries(file: string, source: string): BoundaryViolation[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const violations: BoundaryViolation[] = [];
  function inspect(node: ts.Node): void {
    let literal: ts.Node | undefined;
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
    }
    if (literal && ts.isStringLiteralLike(literal)) {
      const target = localTarget(file, literal.text);
      const reason = target && boundaryReason(file, target);
      if (reason) {
        violations.push({
          file,
          line: ast.getLineAndCharacterOfPosition(literal.getStart(ast)).line + 1,
          importPath: literal.text,
          reason,
        });
      }
    }
    ts.forEachChild(node, inspect);
  }
  inspect(ast);
  return violations;
}
