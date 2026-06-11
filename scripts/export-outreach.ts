/**
 * export-outreach.ts — Export enriched leads to a CSV for outreach.
 *
 * Usage:
 *   pnpm exec tsx scripts/export-outreach.ts
 *
 * Reads:  ~/.leverage/store/angi-leads/angi-enriched.json
 * Writes: ~/.leverage/store/angi-leads/outreach.csv
 *
 * CSV columns (in order):
 *   business, trade, city, email, emailSource, phone,
 *   grade, topFix, opener, openerBasis, reportUrl, listingUrl
 *
 * Rows are sorted: email-present first, then by grade (F -> A worst first
 * as best prospects — most room to improve), then alphabetically.
 *
 * The CSV is paste-ready into Gmail mail-merge or any send tool.
 * Rows without an email are included (grade + opener still valid for
 * phone outreach or social channel DMs).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { EnrichedLead } from "./enrich-leads";

const OUT_DIR = join(homedir(), ".leverage", "store", "angi-leads");
const IN_FILE = join(OUT_DIR, "angi-enriched.json");
const OUT_FILE = join(OUT_DIR, "outreach.csv");

const COLUMNS: Array<{ key: keyof EnrichedLead; label: string }> = [
  { key: "business", label: "business" },
  { key: "trade", label: "trade" },
  { key: "city", label: "city" },
  { key: "email", label: "email" },
  { key: "emailSource", label: "emailSource" },
  { key: "phone", label: "phone" },
  { key: "grade", label: "grade" },
  { key: "topFix", label: "topFix" },
  { key: "opener", label: "opener" },
  { key: "openerBasis", label: "openerBasis" },
  { key: "reportUrl", label: "reportUrl" },
  { key: "listingUrl", label: "listingUrl" },
];

const GRADE_SORT: Record<string, number> = { F: 0, D: 1, C: 2, B: 3, A: 4 };

function gradeSort(g: string | null): number {
  return g ? (GRADE_SORT[g] ?? 5) : 6; // no grade (no website) last
}

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toRow(lead: EnrichedLead): string {
  return COLUMNS.map((col) => csvEscape(lead[col.key])).join(",");
}

function main() {
  if (!existsSync(IN_FILE)) {
    console.error(`Input file not found: ${IN_FILE}`);
    console.error("Run scripts/enrich-leads.ts first.");
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const leads: EnrichedLead[] = JSON.parse(readFileSync(IN_FILE, "utf-8"));

  // Sort: email-present first, then worst grade first (most improvement room),
  // then alphabetical within grade.
  const sorted = [...leads].sort((a, b) => {
    const aHasEmail = a.email ? 0 : 1;
    const bHasEmail = b.email ? 0 : 1;
    if (aHasEmail !== bHasEmail) return aHasEmail - bHasEmail;

    const aGrade = gradeSort(a.grade);
    const bGrade = gradeSort(b.grade);
    if (aGrade !== bGrade) return aGrade - bGrade;

    return a.business.localeCompare(b.business);
  });

  const header = COLUMNS.map((c) => c.label).join(",");
  const rows = sorted.map(toRow);
  const csv = [header, ...rows].join("\n");

  writeFileSync(OUT_FILE, csv, "utf-8");

  // Summary
  const total = sorted.length;
  const withEmail = sorted.filter((l) => l.email).length;
  const withWebsite = sorted.filter((l) => l.website).length;
  const gradeBreakdown: Record<string, number> = {};
  for (const l of sorted) {
    const g = l.grade ?? "none";
    gradeBreakdown[g] = (gradeBreakdown[g] ?? 0) + 1;
  }

  console.log(`\nExport complete. ${total} rows written to ${OUT_FILE}`);
  console.log(`  With email:   ${withEmail}/${total}`);
  console.log(`  With website: ${withWebsite}/${total}`);
  console.log(`  Grades:       ${JSON.stringify(gradeBreakdown)}`);
  console.log(`\n  Top 5 by outreach priority (email + worst grade):`);
  for (const l of sorted.slice(0, 5)) {
    console.log(`    ${l.business} (${l.grade ?? "no-grade"}) — ${l.email ?? "no email"}`);
  }
}

main();
