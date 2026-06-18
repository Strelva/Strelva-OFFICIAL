import { getRedis } from "./redis";
import type { IntegrationProvider, Connection } from "./types";

function connectionKey(tenantId: string, provider: IntegrationProvider): string {
  return `connections:${tenantId}:${provider}`;
}

function tenantConnectionsPattern(tenantId: string): string {
  return `connections:${tenantId}:*`;
}

export async function getConnection(
  tenantId: string,
  provider: IntegrationProvider
): Promise<Connection | null> {
  const redis = getRedis();
  if (!redis) return null;

  const data = await redis.get<Connection>(connectionKey(tenantId, provider));
  return data ?? null;
}

export async function getConnections(tenantId: string): Promise<Connection[]> {
  const redis = getRedis();
  if (!redis) return [];

  const connections: Connection[] = [];
  let cursor = "0";
  const pattern = tenantConnectionsPattern(tenantId);
  
  do {
    const [next, keys] = await redis.scan(cursor, { match: pattern, count: 250 });
    cursor = String(next);
    for (const key of keys) {
      const data = await redis.get<Connection>(key);
      if (data) connections.push(data);
    }
  } while (cursor !== "0");

  return connections;
}

export async function saveConnection(connection: Connection): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  await redis.set(
    connectionKey(connection.tenantId, connection.provider),
    connection
  );
}

export async function updateLastSynced(
  tenantId: string,
  provider: IntegrationProvider
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const existing = await getConnection(tenantId, provider);
  if (!existing) return;

  await redis.set(connectionKey(tenantId, provider), {
    ...existing,
    lastSyncedAt: new Date().toISOString(),
  });
}

export async function deleteConnection(
  tenantId: string,
  provider: IntegrationProvider
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  await redis.del(connectionKey(tenantId, provider));
}
