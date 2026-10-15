import "server-only";
import { z } from "zod";
import { readRecord } from "@/lib/client-records";
import { getSupabase } from "@/platform/infra/db/client";
import { getRedis } from "@/platform/infra/redis";
import type { ConnectionSource, WorkspaceConnection } from "@/platform/connections/contracts";
import type { Connection } from "@/lib/types";

const uuid = z.string().uuid();
export type TenantOAuthProvider = "calendly" | "instagram";
export interface LinkedOAuthTenant { tenantId: string; stableId: string; label: string }

/** Uses the current stable identity, never the historical slug on the link. */
export async function listLinkedOAuthTenants(workspaceId: string): Promise<LinkedOAuthTenant[]> {
  const db = getSupabase();
  if (!db) throw new Error("Connection storage is unavailable.");
  const links = await db.from("tenant_workspace_links").select("tenant_stable_id").eq("workspace_id", uuid.parse(workspaceId));
  if (links.error) throw new Error("The business's connection links could not be read.");
  const ids = (links.data ?? []).flatMap(row => row.tenant_stable_id ? [uuid.parse(row.tenant_stable_id)] : []);
  if (!ids.length) return [];
  const tenants = await db.from("tenants").select("id,stable_id,site_name").in("stable_id", ids);
  if (tenants.error) throw new Error("The business's connected accounts could not be read.");
  return (tenants.data ?? []).map(row => ({ tenantId: row.id, stableId: uuid.parse(row.stable_id), label: row.site_name }));
}

/** Read the existing authoritative store without decrypting or returning tokens. */
export async function readTenantOAuthConnection(tenantId: string, provider: TenantOAuthProvider): Promise<Connection | null> {
  return readRecord<Connection>("provider_connections", tenantId, provider, async () => {
    const redis = getRedis();
    if (!redis) throw new Error("Connection storage is unavailable.");
    return redis.get<Connection>(`connections:${tenantId}:${provider}`);
  });
}

export function tenantOAuthRef(provider: TenantOAuthProvider, stableId: string): string {
  return `${provider}:${uuid.parse(stableId)}`;
}

export function tenantOAuthSource(provider: TenantOAuthProvider): ConnectionSource {
  return {
    provider,
    async list({ workspaceId }) {
      const tenants = await listLinkedOAuthTenants(workspaceId);
      const rows = await Promise.all(tenants.map(async tenant => {
        const connection = await readTenantOAuthConnection(tenant.tenantId, provider);
        if (!connection) return null;
        // A malformed/cross-tenant cache payload must not become a workspace connection.
        if (connection.provider !== provider || connection.tenantId !== tenant.tenantId) throw new Error("Connection identity does not match the business.");
        const expired = connection.expiresAt !== undefined && (!Number.isFinite(Date.parse(connection.expiresAt)) || Date.parse(connection.expiresAt) <= Date.now());
        const state = connection.status === "disconnected" ? "disconnected" : connection.status !== "connected" || expired ? "stale" : "connected";
        return {
          ref: tenantOAuthRef(provider, tenant.stableId), provider, workspaceId,
          accountLabel: `${provider === "calendly" ? "Calendly" : "Instagram"} · ${tenant.label}`.slice(0, 200),
          accountHolder: { kind: "unknown" }, accessThrough: { kind: "unknown" },
          state, unavailableReason: null, connectedAt: null, systemIds: [],
        } satisfies WorkspaceConnection;
      }));
      return rows.filter((row): row is NonNullable<typeof row> => row !== null);
    },
  };
}

export const calendlyConnectionSource = tenantOAuthSource("calendly");
