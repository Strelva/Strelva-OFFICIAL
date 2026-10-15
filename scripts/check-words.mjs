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
  "Approve and publish", "Source revisions", "Filed for Strelva", "All files and results",
];
const businessScreen = /^(src\/experience\/(?!agency\/)|src\/products\/[^/]+\/[^/]+\.tsx$|src\/app\/(workspace|apps|preview)\/)/;
const excluded = /(^|\/)(__tests__|tests|migrations|dashboard)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/;
const visitorScreen = /^(custom-repo-starter\/|public\/connect\.js$|src\/(experience\/bookings\/|app\/(b|booking-confirm|pay\/business)\/|products\/(connected-sites\/|scheduling\/(public-booking[^/]*\.[jt]s$|[^/]+\.tsx$))|platform\/bookings\/public-admission\.ts$|app\/preview\/strelva\/(inquiry-booking|booking-manage|deposit|visitor-inquiries)\/))/;
const releaseScreen = /\.tsx$|^src\/(experience\/|platform\/presentation\/)/;
const buttonTag = /^(button|Button|StPill|StPillLink|StTextButton|StHold)$/;

function isButtonCopy(node) {
  if (ts.isPropertyAssignment(node.parent) && /^(makeReal|primaryLabel|actionLabel|buttonLabel)$/.test(node.parent.name.getText())) return true;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isJsxAttribute(parent) && !/^(label|aria-label)$/.test(parent.name.getText())) return false;
    if (ts.isJsxElement(parent) && buttonTag.test(parent.openingElement.tagName.getText())) return true;
    if (ts.isJsxSelfClosingElement(parent)) return buttonTag.test(parent.tagName.getText());
    if (ts.isStatement(parent)) break;
  }
  return false;
}

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
  let parent = node.parent;
  while (ts.isTemplateExpression(parent) || ts.isJsxExpression(parent)) parent = parent.parent;
  // Property names, type literals, element indexes and module specifiers are
  // identifiers/contracts. Their values and JSX text remain eligible.
  if (ts.isPropertyAssignment(parent) && /^(id|\w+Id|kind|type|status|outcome|action|resourceKind|productId|view)$/.test(parent.name.getText()) && /^[\w./:@-]+$/.test(node.text)) return false;
  if (ts.isLiteralTypeNode(parent) || ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return false;
  if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) return false;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return false;
  if (ts.isJsxAttribute(parent) && !/^(title|label|meta|detail|placeholder|alt|aria-label|aria-description)$/.test(parent.name.getText())) return false;
  if (ts.isCallExpression(parent) && (parent.expression.kind === ts.SyntaxKind.ImportKeyword || /^(require|describe|it|test)$/.test(parent.expression.getText()))) return false;
  return true;
}

export function screenWordProblems(source, filename) {
  if (excluded.test(filename)) return [];
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const problems = [], literalRanges = [], allowances = [], buttonCopyNames = new Set();
  function collect(node) {
    if (ts.isStringLiteral(node) || ts.isJsxText(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) literalRanges.push([node.getStart(tree), node.end]);
    if (ts.isIdentifier(node) && isButtonCopy(node)) buttonCopyNames.add(node.text);
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
  const words = businessScreen.test(filename) ? [...retired, "capability", "integration"] : retired;
  function report(node, word, value, index = 0) {
    const start = ts.isJsxText(node) ? node.pos : node.getStart(tree) + 1;
    const line = tree.getLineAndCharacterOfPosition(start + index).line;
    if (!allowances.some(allowance => allowance.word === word.toLowerCase() && (allowance.line === line || allowance.line === line - 1))) {
      problems.push({ line: line + 1, word, value: value.trim().replace(/\s+/g, " ").slice(0, 180) });
    }
  }
  function visit(node) {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) && isScreenCandidate(node)) {
      const value = node.text;
      const buttonVariable = ts.isVariableDeclaration(node.parent) && buttonCopyNames.has(node.parent.name.getText());
      if (isButtonCopy(node) || buttonVariable) {
        for (const match of value.matchAll(/\bMake\s+real\b/ig)) report(node, "Make real (button)", value, match.index);
        for (const match of value.matchAll(/\bHold\s+to\s+(publish|approve)\b/ig)) report(node, match[0], value, match.index);
      }
      // Short release labels include literal r12, template r${number}, and JSX
      // r{number}. Routes, record IDs and wire enums keep their internal names.
      const dynamicRevision = (ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) && /\br$/.test(value)
        || ts.isJsxText(node) && /\br\s*$/.test(value) && ts.isJsxElement(node.parent)
          && node.parent.children[node.parent.children.indexOf(node) + 1]?.kind === ts.SyntaxKind.JsxExpression;
      if (releaseScreen.test(filename) && !/^[\w./:@-]*[/@:][\w./:@-]*$/.test(value)) {
        for (const match of value.matchAll(/\br\d+(?:\s*\+\s*\d+)?\b/ig)) report(node, "r-number revision label", value, match.index);
        if (dynamicRevision) report(node, "r-number revision label", value, value.lastIndexOf("r"));
        for (const match of value.matchAll(/\bPackage\s+r(?=\d|$)/ig)) report(node, "Package r", value, match.index);
      }
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
      if (visitorScreen.test(filename) && (!/^[\w./:@-]+$/.test(value) || ts.isJsxText(node) || ts.isJsxAttribute(node.parent))) {
        for (const match of value.matchAll(/\breservations?\b/ig)) {
          // The existing kind/title rule already reports plural Reservations.
          const start = ts.isJsxText(node) ? node.pos : node.getStart(tree) + 1;
          const line = tree.getLineAndCharacterOfPosition(start + match.index).line + 1;
          if (!problems.some(problem => problem.line === line && problem.word === "Reservations")) report(node, "reservation (visitor)", value, match.index);
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
  for (const file of [...await walk(resolve(root, "src")), ...await walk(resolve(root, "custom-repo-starter")), resolve(root, "public/connect.js")]) {
    const name = relative(root, file);
    for (const problem of screenWordProblems(await readFile(file, "utf8"), name)) failures.push(`${name}:${problem.line}  retired screen word "${problem.word}": ${problem.value}`);
  }
  if (failures.length) {
    console.error(`Words check failed (${failures.length}):\n${failures.join("\n")}`);
    process.exitCode = 1;
  } else console.log("Words check passed: no retired screen words.");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
