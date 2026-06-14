import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/auth";
import { getAuditLog, getAllAuditEvents } from "@/lib/storage";

/**
 * Operator audit feed for Mission Control. Portfolio-wide by default; pass
 * `?tenant=<id>` to scope to one tenant. `?limit=` caps at 500.
 */
export async function GET(req: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const tenant = searchParams.get("tenant");
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);

  const events = tenant
    ? await getAuditLog(tenant, limit)
    : await getAllAuditEvents(limit);

  return NextResponse.json({ events, count: events.length });
}
