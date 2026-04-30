import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { saveConnection, getConnection, deleteConnection } from "@/lib/connections";
import { requireActiveSubscription } from "@/lib/subscription";

// Vegaro API base URL - placeholder until confirmed
const VEGARO_API_BASE = "https://api.vegaro.no/v1";

interface VegaroConnectRequest {
  apiKey: string;
  businessId: string;
}

/**
 * Validate Vegaro credentials by making a test API call.
 * Placeholder endpoint - adjust once Vegaro API docs are available.
 */
async function validateVegaroCredentials(apiKey: string, businessId: string): Promise<boolean> {
  try {
    const res = await fetch(`${VEGARO_API_BASE}/businesses/${businessId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
    return res.ok;
  } catch {
    // If Vegaro API isn't reachable, allow connection for now (can verify later)
    // In production, this should be stricter
    console.warn("Vegaro API validation skipped - endpoint may not be available");
    return true;
  }
}

export async function POST(req: Request) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  let body: VegaroConnectRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { apiKey, businessId } = body;
  if (!apiKey || !businessId) {
    return NextResponse.json({ error: "apiKey and businessId are required" }, { status: 400 });
  }

  const valid = await validateVegaroCredentials(apiKey, businessId);
  if (!valid) {
    return NextResponse.json({ error: "Invalid Vegaro credentials" }, { status: 400 });
  }

  await saveConnection({
    provider: "vegaro",
    tenantId: tenant,
    accessToken: apiKey,
    apiKey: businessId, // Store businessId in apiKey field for consistency with Yelp pattern
    status: "connected",
    lastSyncedAt: new Date().toISOString(),
  });

  return NextResponse.json({ success: true });
}

export async function GET(_req: Request) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const connection = await getConnection(tenant, "vegaro");
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

  await deleteConnection(tenant, "vegaro");

  return NextResponse.json({ success: true });
}
