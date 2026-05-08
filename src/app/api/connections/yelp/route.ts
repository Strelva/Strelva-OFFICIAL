import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { saveConnection, getConnection } from "@/lib/connections";
import { requireActiveSubscription } from "@/lib/subscription";

const YELP_API_BASE = "https://api.yelp.com/v3";

interface YelpConnectRequest {
  apiKey: string;
  businessId: string;
}

async function validateYelpCredentials(apiKey: string, businessId: string): Promise<boolean> {
  const res = await fetch(`${YELP_API_BASE}/businesses/${businessId}/reviews`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

export async function POST(req: Request) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const permissionDenied = await requireTenantPermission(tenant, "settings:write");
  if (permissionDenied) return permissionDenied;

  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  let body: YelpConnectRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { apiKey, businessId } = body;
  if (!apiKey || !businessId) {
    return NextResponse.json({ error: "apiKey and businessId are required" }, { status: 400 });
  }

  const valid = await validateYelpCredentials(apiKey, businessId);
  if (!valid) {
    return NextResponse.json({ error: "Invalid Yelp credentials" }, { status: 400 });
  }

  await saveConnection({
    provider: "yelp",
    tenantId: tenant,
    accessToken: apiKey,
    apiKey: businessId,
    status: "connected",
  });

  return NextResponse.json({ success: true });
}

export async function GET(_req: Request) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const connection = await getConnection(tenant, "yelp");
  if (!connection) {
    return NextResponse.json({ connected: false });
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
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const permissionDenied = await requireTenantPermission(tenant, "settings:write");
  if (permissionDenied) return permissionDenied;

  const { deleteConnection } = await import("@/lib/connections");
  await deleteConnection(tenant, "yelp");

  return NextResponse.json({ success: true });
}
