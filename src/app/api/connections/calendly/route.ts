/**
 * Calendly Connection API - Get status and disconnect
 */

import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess, requireTenantPermission, verifyAuth } from "@/lib/auth";
import { getConnection, deleteConnection } from "@/lib/connections";

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const connection = await getConnection(tenant, "calendly");

    return NextResponse.json({
      connected: connection?.status === "connected",
      lastSyncedAt: connection?.lastSyncedAt ?? null,
      status: connection?.status ?? "disconnected",
    });
  } catch (err) {
    console.error("[calendly GET]", err);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function DELETE() {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const tenant = await getTenantFromHeaders();
    const permissionDenied = await requireTenantPermission(tenant, "settings:write");
    if (permissionDenied) return permissionDenied;

    await deleteConnection(tenant, "calendly");

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[calendly DELETE]", err);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
