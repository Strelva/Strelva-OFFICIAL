/**
 * Full Site Audit — one URL in, the whole picture out (CLI).
 *
 *   npx tsx scripts/full-audit.ts <url> [--html] [--out=dir]      # single, pretty
 *   npx tsx scripts/full-audit.ts <url1> <url2> ... [--json]      # batch, table or JSON
 *   npx tsx scripts/full-audit.ts --file=leads.txt --json         # batch from a file
 *
 * Runs Strelva's comprehensive site audit: SEO, security, accessibility, trust,
 * content, Core Web Vitals / mobile (PageSpeed), and AI-readability (schema.org
 * / structured data / AI-crawler access / answer-format content — whether the
 * site is AI-optimized, deterministic from the markup; NOT live AI-search).
 *
 * --json emits a compact structured array (for agents doing lead research at
 * scale). --html writes a sendable one-pager per URL. Reuses the audit engine
 * + report renderer — no re-implementation.
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { auditUrl, auditUrls, type LeadAuditResult } from "../src/lib/lead-audit";
import { renderAuditReport } from "../src/lib/audit/html";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=").replace(/^["']|["']$/g, "") : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
function slugify(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "site";
  } catch { return "site"; }
}

const R = "\x1b[0m", DIM = "\x1b[2m", BOLD = "\x1b[1m";
const gradeColor = (g: string) => ({ A: "\x1b[32m", B: "\x1b[32m", C: "\x1b[33m", D: "\x1b[33m", F: "\x1b[31m" }[g] ?? DIM);
const scoreColor = (s: number) => (s >= 80 ? "\x1b[32m" : s >= 55 ? "\x1b[33m" : "\x1b[31m");
const bar = (score: number, width = 20) => "█".repeat(Math.round((Math.max(0, Math.min(100, score)) / 100) * width)) + "░".repeat(width - Math.round((Math.max(0, Math.min(100, score)) / 100) * width));

function writeHtml(r: LeadAuditResult): string {
  const outDir = arg("out");
  if (outDir) mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir ?? process.cwd(), `full-audit-${slugify(r.url)}.html`);
  writeFileSync(outPath, renderAuditReport(r.full), "utf8");
  return outPath;
}

function printOne(r: LeadAuditResult, html?: string) {
  const c = gradeColor(r.grade);
  const rule = "─".repeat(52);
  console.log(`\n  ${BOLD}STRELVA · FULL SITE AUDIT${R}`);
  console.log(`  ${DIM}${r.url}${R}`);
  console.log(`  ${rule}`);
  console.log(`  ${c}${BOLD}GRADE  ${r.grade}${R}    ${c}${r.score}/100${R}\n`);
  console.log(`  ${BOLD}By category${R}`);
  for (const cat of r.categories) console.log(`   ${scoreColor(cat.score)}${bar(cat.score)}${R} ${String(cat.score).padStart(3)}  ${cat.name}`);
  if (r.topFixes.length) {
    console.log(`\n  ${BOLD}Fix these first${R}`);
    r.topFixes.forEach((f, i) => {
      console.log(`   ${c}${i + 1}.${R} ${BOLD}${f.title}${R}  ${DIM}[${f.category}]${R}${f.quantified ? `  \x1b[31m${f.quantified}${R}` : ""}`);
      console.log(`      ${DIM}${f.detail}${R}`);
    });
  }
  console.log(`\n  ${rule}\n  ${DIM}Powered by Strelva · strelva.com${R}`);
  if (html) console.log(`  ${BOLD}HTML:${R} ${html}`);
  console.log("");
}

function printTable(results: Array<LeadAuditResult | { url: string; error: string }>) {
  console.log(`\n  ${BOLD}STRELVA · LEAD AUDIT — ${results.length} sites${R}`);
  console.log(`  ${"─".repeat(64)}`);
  console.log(`  ${DIM}${"GRADE".padEnd(7)}${"SCORE".padEnd(7)}SITE${R}`);
  for (const r of results) {
    if ("error" in r) { console.log(`  ${"\x1b[31mERR".padEnd(7)}${"".padEnd(7)}${r.url}${R}  ${DIM}${r.error}${R}`); continue; }
    const c = gradeColor(r.grade);
    const weak = r.categories.filter((x) => x.score < 55).sort((a, b) => a.score - b.score).slice(0, 3).map((x) => x.name).join(", ");
    console.log(`  ${c}${(r.grade + "").padEnd(7)}${(r.score + "/100").padEnd(7)}${R}${r.url}${weak ? `  ${DIM}weak: ${weak}${R}` : ""}`);
  }
  console.log(`  ${"─".repeat(64)}\n`);
}

async function main() {
  const urls = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const fileArg = arg("file");
  if (fileArg) urls.push(...readFileSync(fileArg, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  if (!urls.length) {
    console.error("Usage: npx tsx scripts/full-audit.ts <url> [more urls...] [--file=leads.txt] [--json] [--html] [--out=dir]");
    process.exit(1);
  }

  // Single URL, human-readable: full pretty output.
  if (urls.length === 1 && !flag("json")) {
    const r = await auditUrl(urls[0]);
    printOne(r, flag("html") ? writeHtml(r) : undefined);
    return;
  }

  // Batch (or --json): run all, then table or JSON.
  const results = await auditUrls(urls);
  if (flag("html")) for (const r of results) if (!("error" in r)) writeHtml(r);
  if (flag("json")) {
    // Compact shape for agents — drop the heavy `full` engine result.
    const compact = results.map((r) => ("error" in r ? r : { url: r.url, grade: r.grade, score: r.score, scannedAt: r.scannedAt, categories: r.categories, topFixes: r.topFixes }));
    console.log(JSON.stringify(compact, null, 2));
  } else {
    printTable(results);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
