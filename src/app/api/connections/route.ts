/**
 * Connections API - Lists all connections for a tenant with sync status
 */

import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess } from "@/lib/auth";
import { getConnections } from "@/lib/connections";
import type { Connection, IntegrationProvider } from "@/lib/types";

export interface ConnectionStatus {
  provider: IntegrationProvider;
  connected: boolean;
  lastSyncedAt: string | null;
  status: Connection["status"] | "disconnected";
}

export async function GET() {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const connections = await getConnections(tenant);

    // Build status map for all providers
    const providers: IntegrationProvider[] = ["google", "yelp", "calendly", "instagram"];
    const statuses: ConnectionStatus[] = providers.map((provider) => {
      const conn = connections.find((c) => c.provider === provider);
      return {
        provider,
        connected: conn?.status === "connected",
        lastSyncedAt: conn?.lastSyncedAt ?? null,
        status: conn?.status ?? "disconnected",
      };
    });

    return NextResponse.json({ connections: statuses });
  } catch (err) {
    console.error("[connections GET]", err);
    return NextResponse.json({ error: "Failed to load connections" }, { status: 500 });
  }
}
