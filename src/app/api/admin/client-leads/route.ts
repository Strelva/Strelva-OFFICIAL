import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/platform/infra/auth";
import { getClientLeadsForOperator } from "@/lib/client-leads";
import { isTenantId } from "@/lib/scaffold-contracts";

export const dynamic = "force-dynamic";

/**
 * Client leads for operators: visitor submissions from client websites,
 * Postgres first with the Redis window merged in. Super-admin only. Strelva's
 * own prospects are /api/admin/leads.
 */
export async function GET(request: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await authorizeAdminOperatorRead("admin.client-leads.read");
  const url = new URL(request.url);
  const tenantParam = url.searchParams.get("tenant");
  if (tenantParam !== null && !isTenantId(tenantParam)) {
    return NextResponse.json({ error: "Invalid tenant" }, { status: 400 });
  }
  const limitParam = Number(url.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 500) : 100;
  const result = await getClientLeadsForOperator({ tenant: tenantParam, limit });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
