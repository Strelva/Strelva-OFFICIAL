import { NextResponse } from "next/server";
import { getAuditReport } from "@/lib/audit-report-store";
import { renderAuditReport } from "@/lib/audit/html";

/**
 * Hosted "View full report" target. Resolves a stored audit report by id and
 * returns the sendable one-pager HTML — the page a prospect lands on from the
 * on-page button or the emailed link, and prints/saves to PDF. Read-only, no
 * state written; the id is an unguessable random token, so no auth beyond it.
 */

function notFoundHtml(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Report not found</title>
<style>body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#f4f5f7;color:#1a1d21}main{text-align:center;padding:32px}h1{font-family:Georgia,serif;font-weight:600;font-size:24px;margin:0 0 8px}p{color:#6b7280;font-size:15px;margin:0 0 20px}a{color:#1a1d21;font-weight:600;text-decoration:none;border-bottom:1px solid #c9ced4}</style>
</head><body><main><h1>This report has expired</h1><p>Audit reports are available for 60 days. Run a fresh one anytime.</p><a href="https://strelva.com/audit">Run a new audit</a></main></body></html>`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const stored = id ? await getAuditReport(id) : null;

  if (!stored) {
    return new NextResponse(notFoundHtml(), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  return new NextResponse(renderAuditReport(stored.result), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Private, short-lived: the report is a one-off artifact behind an unguessable id.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
