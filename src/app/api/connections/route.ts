import { authorizeTenantOperatorRead } from "@/platform/operator-read-audit/admission";
/**
 * Connections API - Lists all connections for a tenant with sync status
 */

import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess } from "@/platform/infra/auth";
import { getConnections } from "@/lib/connections";
import { providerKeyStatus, type KeyedIntegration } from "@/platform/connections/provider-keys";
import type { Connection, IntegrationProvider } from "@/lib/types";

export interface ConnectionStatus {
  provider: IntegrationProvider;
  connected: boolean;
  lastSyncedAt: string | null;
  status: Connection["status"] | "disconnected";
  /** False when Strelva has not added this provider's keys yet. Yelp is always true: the owner brings the key. */
  platformReady: boolean;
}

const PLATFORM_KEYS: Partial<Record<IntegrationProvider, KeyedIntegration>> = {
  google: "google_sign_in_legacy", calendly: "calendly", instagram: "instagram",
};

export async function GET() {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    await authorizeTenantOperatorRead(tenant);

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
        platformReady: PLATFORM_KEYS[provider] ? providerKeyStatus(PLATFORM_KEYS[provider]).ready : true,
      };
    });

    return NextResponse.json({ connections: statuses });
  } catch (err) {
    console.error("[connections GET]", err);
    return NextResponse.json({ error: "Failed to load connections" }, { status: 500 });
  }
}
