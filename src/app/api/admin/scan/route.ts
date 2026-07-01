import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { readJsonObject } from "@/lib/request-body";
import { scanTenant } from "@/lib/scan";
import { logAuditEvent } from "@/lib/storage";
import { prioritizeIssues } from "@/lib/audit/prioritize";

export const maxDuration = 60;

/**
 * Operator SEO + site-health scan: runs the audit engine on a tenant's live
 * site, persists the summary, and returns the grade + category breakdown.
 * Super-admin only.
 */
export async function POST(req: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonObject(req);
  const tenantId = typeof body?.tenant === "string" ? body.tenant.trim() : "";
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenant" }, { status: 400 });
  }

  try {
    const { detail, ...summary } = await scanTenant(tenantId);

    // Admin-only ranked action list — the raw failing/warning issues the client
    // dashboard never shows. Client sees the grade/score; the operator sees what
    // to fix first.
    const prioritized = prioritizeIssues({
      url: summary.url,
      scannedAt: summary.scannedAt,
      overallScore: summary.overallScore,
      grade: summary.grade,
      categories: detail,
    });

    await logAuditEvent({
      tenant: tenantId,
      action: "scan.run",
      targetType: "tenant",
      targetId: tenantId,
      actor: await getActorContext(tenantId),
      metadata: { grade: summary.grade, overallScore: summary.overallScore },
    });

    return NextResponse.json({ ...summary, categories: detail, prioritizedIssues: prioritized });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    const status = message.startsWith("No tenant") ? 404 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
