import "server-only";
import { readRecord } from "@/lib/client-records";
import { getRedis } from "@/platform/infra/redis";
import type { WorkspaceConnection } from "@/platform/connections/contracts";
import type { Connection } from "@/lib/types";
import { listLinkedOAuthTenants } from "../calendly/connection-source";

/**
 * The legacy clients' Google accounts live only in the tenant connection store
 * (Redis, mirrored to provider_connections), with no workspace binding yet.
 * Behind STRELVA_CONNECTIONS_LEGACY_GOOGLE (default off), Connections shows them
 * honestly: holders read Unknown and say "Reconnect to record whose account this
 * is". Status only: no token field is read out of the record, returned or logged.
 */
export function legacyGoogleConnectionsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.STRELVA_CONNECTIONS_LEGACY_GOOGLE === "1";
}

async function readLegacyGoogle(tenantId: string): Promise<Connection | null> {
  return readRecord<Connection>("provider_connections", tenantId, "google", async () => {
    const redis = getRedis();
    if (!redis) throw new Error("Connection storage is unavailable.");
    return redis.get<Connection>(`connections:${tenantId}:google`);
  });
}

export async function listLegacyGoogleRows(workspaceId: string): Promise<WorkspaceConnection[]> {
  const tenants = await listLinkedOAuthTenants(workspaceId);
  const rows = await Promise.all(tenants.map(async (tenant): Promise<WorkspaceConnection | null> => {
    const connection = await readLegacyGoogle(tenant.tenantId);
    if (!connection) return null;
    // A malformed or cross-tenant cache payload must not become a workspace connection.
    if (connection.provider !== "google" || connection.tenantId !== tenant.tenantId) throw new Error("Connection identity does not match the business.");
    const expired = connection.expiresAt !== undefined && (!Number.isFinite(Date.parse(connection.expiresAt)) || Date.parse(connection.expiresAt) <= Date.now());
    return {
      ref: `google_business_profile:legacy:${tenant.stableId}`, provider: "google_business_profile", workspaceId,
      accountLabel: `Google Business Profile · ${tenant.label}`.slice(0, 200),
      accountHolder: { kind: "unknown" }, accessThrough: { kind: "unknown" },
      state: connection.status === "disconnected" ? "disconnected" : connection.status !== "connected" || expired ? "stale" : "connected",
      unavailableReason: null, connectedAt: null, systemIds: [],
    };
  }));
  return rows.filter((row): row is WorkspaceConnection => row !== null);
}
