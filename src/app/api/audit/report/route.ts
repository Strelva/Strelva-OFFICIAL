import { NextRequest, NextResponse } from "next/server";
import { renderAuditReport } from "@/lib/audit/html";
import type { AuditResult, CategoryResult } from "@/lib/audit/types";

/**
 * Public report renderer. Accepts an `AuditResult` JSON body and returns the
 * sendable one-pager HTML (`text/html`) so the front-end can open or download
 * it to print/save as PDF.
 *
 * This route renders only the body it is given. It performs NO data access and
 * holds no state, so there is nothing tenant-scoped to leak; it is a pure
 * transform of caller-supplied JSON into HTML.
 */

const GRADES = new Set(["A", "B", "C", "D", "F"]);

/** Minimal structural validation — enough to render safely, not a full schema. */
function isAuditResult(value: unknown): value is AuditResult {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  if (typeof r.url !== "string" || r.url.length === 0) return false;
  if (typeof r.scannedAt !== "string") return false;
  if (typeof r.overallScore !== "number" || Number.isNaN(r.overallScore)) return false;
  if (typeof r.grade !== "string" || !GRADES.has(r.grade)) return false;
  if (!Array.isArray(r.categories)) return false;
  return (r.categories as unknown[]).every((c) => {
    if (!c || typeof c !== "object") return false;
    const cat = c as Partial<CategoryResult>;
    return (
      typeof cat.name === "string" &&
      typeof cat.score === "number" &&
      Array.isArray(cat.checks)
    );
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isAuditResult(body)) {
    return NextResponse.json(
      { error: "Body must be a valid AuditResult." },
      { status: 400 }
    );
  }

  const html = renderAuditReport(body);
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
