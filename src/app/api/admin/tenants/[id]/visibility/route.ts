import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/platform/infra/auth";
import { getTenantConfig } from "@/lib/tenants";
import { getLatestSnapshots, diffSnapshots } from "@/lib/visibility/snapshots";
import { diagnoseVisibility, summarizeVisibility } from "@/lib/visibility/diagnose";

/**
 * GET  — the operator's visibility view: latest summary, findings, and the
 *        week-over-week diff (the "prove" signal).
 * POST is retired: ordinary business/agency authority owns client drafts.
 * The support read remains super-admin only and audit-logged.
 */

async function loadVisibility(id: string) {
  const snapshots = await getLatestSnapshots(id, 2).catch(() => []);
  const latest = snapshots[0] ?? null;
  if (!latest) return { hasData: false as const };
  return {
    hasData: true as const,
    summary: summarizeVisibility(latest),
    findings: diagnoseVisibility(latest),
    diff: diffSnapshots(snapshots[1] ?? null, latest),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await authorizeAdminOperatorRead("admin.tenant-controls.read");
  const { id } = await params;
  if (!(await getTenantConfig(id))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  return NextResponse.json(await loadVisibility(id));
}

export async function POST() {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ error: "Client content authoring belongs to the business owner or its authorized agency.", code: "client_content_decision_required" }, { status: 410 });
}
