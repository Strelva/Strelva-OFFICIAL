import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/auth";
import { readJsonObject } from "@/lib/request-body";
import { scanTenant } from "@/lib/scan";

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
    return NextResponse.json({ ...summary, categories: detail });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    const status = message.startsWith("No tenant") ? 404 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
