import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { logAuditEvent } from "@/lib/storage";
import { getConnections, deleteConnection } from "@/lib/connections";
import type { IntegrationProvider } from "@/lib/types";

/**
 * Admin connections surface — lists and removes OAuth/API connections for a
 * tenant. Super-admin only.
 *
 * GET  — returns safe connection metadata (provider, connectedAt via
 *        lastSyncedAt, status, scopes). Secret values (accessToken,
 *        refreshToken, apiKey) are NEVER included in the response.
 * DELETE — removes one provider's connection, audit-logs it, and returns the
 *          refreshed connection list (same safe shape).
 */

const KNOWN_PROVIDERS: IntegrationProvider[] = [
  "google",
  "yelp",
  "calendly",
  "instagram",
  "vegaro",
];

function isKnownProvider(value: unknown): value is IntegrationProvider {
  return typeof value === "string" && KNOWN_PROVIDERS.includes(value as IntegrationProvider);
}

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
  const { id } = await params;
  if (!(await getTenantConfig(id))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const connections = await getConnections(id).catch(() => []);
  return NextResponse.json({ connections: connections.map(safeConnection) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await getTenantConfig(id))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { provider } = (body ?? {}) as { provider?: unknown };
  if (!isKnownProvider(provider)) {
    return NextResponse.json(
      { error: `provider must be one of: ${KNOWN_PROVIDERS.join(", ")}.` },
      { status: 400 },
    );
  }

  await deleteConnection(id, provider);

  const actor = await getActorContext(id);
  await logAuditEvent({
    tenant: id,
    action: "connection.delete",
    targetType: "connection",
    targetId: provider,
    actor,
    metadata: { provider },
  }).catch(() => {});

  const connections = await getConnections(id).catch(() => []);
  return NextResponse.json({ connections: connections.map(safeConnection) });
}
