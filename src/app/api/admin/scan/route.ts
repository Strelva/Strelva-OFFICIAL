import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantPublicUrl } from "@/lib/tenant-urls";
import { runAudit } from "@/lib/audit/checks";
import { computeOverallScore, scoreToGrade } from "@/lib/audit/scoring";
import { readJsonObject } from "@/lib/request-body";
import { saveScanSummary } from "@/lib/scan-store";

export const maxDuration = 60;

/**
 * Operator SEO + site-health scan: runs the audit engine on a tenant's live site
 * and returns the grade + category breakdown. Super-admin only.
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

  const config = await getTenantConfig(tenantId);
  if (!config) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  // Always scan the client's real live site, not the localhost dev URL.
  const url = getTenantPublicUrl(config, "production");

  try {
    const categories = await runAudit(url);
    const overallScore = computeOverallScore(categories);
    const grade = scoreToGrade(overallScore);
    const scannedAt = new Date().toISOString();

    // Persist a compact summary so the overview + agent can read it later.
    await saveScanSummary(tenantId, {
      url,
      scannedAt,
      overallScore,
      grade,
      categories: categories.map((c) => ({ name: c.name, slug: c.slug, score: c.score })),
    });

    return NextResponse.json({ url, scannedAt, overallScore, grade, categories });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed", url },
      { status: 502 }
    );
  }
}
