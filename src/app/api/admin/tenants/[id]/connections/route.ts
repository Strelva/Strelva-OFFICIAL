import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/platform/infra/auth";
import { getTenantConfig } from "@/lib/tenants";
import { getConnections } from "@/lib/connections";

/**
 * Audited, read-only client connection metadata for platform support.
 * Secret values never reach the response. DELETE is a compatibility refusal;
 * ordinary business/agency settings own connection changes.
 */
/** Strip all secret-bearing fields before sending over the wire. */
function safeConnection(conn: Awaited<ReturnType<typeof getConnections>>[number]) {
  return {
    provider: conn.provider,
    tenantId: conn.tenantId,
    status: conn.status,
    scopes: conn.scopes ?? [],
    lastSyncedAt: conn.lastSyncedAt ?? null,
    expiresAt: conn.expiresAt ?? null,
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

  const connections = await getConnections(id).catch(() => []);
  return NextResponse.json({ connections: connections.map(safeConnection) });
}

/** Connection changes require the business or its agency's ordinary access. */
export async function DELETE(_request: Request, _context: { params: Promise<{ id: string }> }) {
  if (!await isSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ error: "Manage client connections through ordinary business or agency access. Nothing changed." }, { status: 410 });
}
