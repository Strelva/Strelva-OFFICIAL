import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getConnection, deleteConnection } from "@/lib/connections";
import { requireActiveSubscription } from "@/lib/subscription";

export async function POST(req: Request) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const permissionDenied = await requireTenantPermission(tenant, "settings:write");
  if (permissionDenied) return permissionDenied;

  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  await req.text().catch(() => "");
  return NextResponse.json(
    {
      error: "Vegaro is not available yet",
      status: "coming_soon",
    },
    { status: 501 }
  );
}

export async function GET(_req: Request) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const connection = await getConnection(tenant, "vegaro");
  if (!connection) {
    return NextResponse.json({ connected: false, status: "coming_soon" });
  }

  return NextResponse.json({
    connected: true,
    businessId: connection.apiKey,
    lastSyncedAt: connection.lastSyncedAt,
    status: connection.status,
  });
}

export async function DELETE(_req: Request) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const permissionDenied = await requireTenantPermission(tenant, "settings:write");
  if (permissionDenied) return permissionDenied;

  await deleteConnection(tenant, "vegaro");

  return NextResponse.json({ success: true });
}
