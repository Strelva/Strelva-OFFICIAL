// Screen-language gate. Parse source so comments, identifiers, imports, routes,
// tests and legacy dashboard pages do not become screen-copy findings.
// Escape hatch: words-allow: <retired word> -- <specific reason>, on the same
// or immediately preceding line. Each allowance covers only that word/line.
import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const retired = [
  "Strelva handled", "Internal applications", "Custom application", "Reusable applications",
  "Private app", "Delegated work", "Reservations", "Website monitoring",
  "saved investigation", "Provider handoff", "Provider change", "Your dashboard", "Make it real",
  "People and access", "offering record", "Business installations", "active provider seat",
  "All apps and files",
  // October 12: "Apps" names reusable Systems creators publish (GLOSSARY App / Apps).
  "Ready-made",
];
const businessScreen = /^(src\/experience\/(?!agency\/)|src\/products\/[^/]+\/[^/]+\.tsx$|src\/app\/(workspace|apps|preview)\/)/;
const excluded = /(^|\/)(__tests__|tests|migrations|dashboard)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/;

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const path = resolve(dir, entry.name);
    if (excluded.test(relative(root, path))) continue;
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(path);
  }
  return files.sort();
}

function isScreenCandidate(node) {
  const parent = node.parent;
  // Property names, type literals, element indexes and module specifiers are
  // identifiers/contracts. Their values and JSX text remain eligible.
  if (ts.isPropertyAssignment(parent) && /^(id|kind|type|status|outcome|action|resourceKind|productId|view)$/.test(parent.name.getText()) && /^[\w./:@-]+$/.test(node.text)) return false;
  if (ts.isLiteralTypeNode(parent) || ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return false;
  if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) return false;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return false;
  if (ts.isJsxAttribute(parent) && !/^(title|label|placeholder|alt|aria-label|aria-description)$/.test(parent.name.getText())) return false;
  if (ts.isCallExpression(parent) && (parent.expression.kind === ts.SyntaxKind.ImportKeyword || /^(require|describe|it|test)$/.test(parent.expression.getText()))) return false;
  return true;
}

export function screenWordProblems(source, filename) {
  if (excluded.test(filename)) return [];
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const problems = [], literalRanges = [], allowances = [];
  function collect(node) {
    if (ts.isStringLiteral(node) || ts.isJsxText(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) literalRanges.push([node.getStart(tree), node.end]);
    ts.forEachChild(node, collect);
  }
  collect(tree);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, source);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const position = scanner.getTokenPos();
    if (literalRanges.some(([start, end]) => position >= start && position < end)) continue;
    const comment = scanner.getTokenText();
    for (const match of comment.matchAll(/words-allow:\s*([^\n]+?)\s*--\s*([^\n]*)/g)) {
      const reason = match[2].replace(/\*\/.*$/, "").trim();
      if (reason.length < 3) continue;
      const line = tree.getLineAndCharacterOfPosition(position + match.index).line;
      allowances.push({ line, word: match[1].trim().toLowerCase() });
    }
  }
  const words = businessScreen.test(filename) ? [...retired, "capability"] : retired;
  function visit(node) {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) && isScreenCandidate(node)) {
      const value = node.text;
      const displayProperty = ts.isPropertyAssignment(node.parent) && /^(title|label|name|heading|description|summary|message|placeholder)$/.test(node.parent.name.getText());
      // Stable identifiers, addresses and wire-format tokens are not copy.
      if (!/^[\w./:@-]+$/.test(value) || ts.isJsxText(node) || ts.isJsxAttribute(node.parent) || displayProperty || /^[A-Z]/.test(value)) {
        const start = ts.isJsxText(node) ? node.pos : node.getStart(tree) + 1;
        for (const word of words) {
          const parent = node.parent;
          const reservationProperty = ts.isPropertyAssignment(parent) && /^(title|heading|label|name)$/.test(parent.name.getText());
          const heading = ts.isJsxElement(parent) && /^h[1-6]$/.test(parent.openingElement.tagName.getText());
          const titleVariable = ts.isVariableDeclaration(parent) && /^(title|heading|label)$/.test(parent.name.getText());
          if (word === "Reservations" && !/^reservations\b/i.test(value.trim())) continue;
          if (word === "Reservations" && !reservationProperty && !heading && !titleVariable && !ts.isJsxAttribute(parent) && !/^reservations(?:\s*[·:—-].*)?$/i.test(value.trim())) continue;
          const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll(" ", "\\s+")}(?:s)?\\b`, "ig");
          for (const match of value.matchAll(pattern)) {
            const line = tree.getLineAndCharacterOfPosition(start + match.index).line;
            if (!allowances.some(allowance => allowance.word === word.toLowerCase() && (allowance.line === line || allowance.line === line - 1))) problems.push({ line: line + 1, word, value: value.trim().replace(/\s+/g, " ").slice(0, 180) });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return problems;
}

async function main() {
  const failures = [];
  for (const file of await walk(resolve(root, "src"))) {
    const name = relative(root, file);
    for (const problem of screenWordProblems(await readFile(file, "utf8"), name)) failures.push(`${name}:${problem.line}  retired screen word "${problem.word}": ${problem.value}`);
  }
  if (failures.length) {
    console.error(`Words check failed (${failures.length}):\n${failures.join("\n")}`);
    process.exitCode = 1;
  } else console.log("Words check passed: no retired screen words.");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
