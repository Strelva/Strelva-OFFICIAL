import { getRedis } from "./redis";
import { decryptSecret, encryptSecret } from "./crypto/secrets";
import type { IntegrationProvider, Connection } from "./types";

// At-rest envelope encryption for the secret-bearing fields. Redis auto-JSON-
// serializes the whole Connection, so we encrypt before write and decrypt after
// read. Both helpers are INERT until SECRETS_ENC_KEY is set (staged rollout), and
// encrypt/decrypt pass through null/undefined/"" so the optional fields are safe.
function encodeConnection(c: Connection): Connection {
  return {
    ...c,
    accessToken: encryptSecret(c.accessToken),
    // `?? undefined` only narrows the type (the null branch can't occur for a
    // string|undefined input) so the object still matches Connection's optionals.
    refreshToken: encryptSecret(c.refreshToken) ?? undefined,
    apiKey: encryptSecret(c.apiKey) ?? undefined,
  };
}

function decodeConnection(c: Connection): Connection {
  return {
    ...c,
    accessToken: decryptSecret(c.accessToken),
    refreshToken: decryptSecret(c.refreshToken) ?? undefined,
    apiKey: decryptSecret(c.apiKey) ?? undefined,
  };
}

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
  return data ? decodeConnection(data) : null;
}

export async function getConnections(tenantId: string): Promise<Connection[]> {
  const redis = getRedis();
  if (!redis) return [];

  // Collect all matching keys first via full SCAN, then fetch values in one
  // mget call. This avoids interleaved get-per-key reads that can see
  // duplicate or missing keys when a key migration (e.g. tenant rename) is
  // concurrent with the scan. The key-collection pass is still non-atomic, but
  // the value reads all happen at the same logical instant.
  const allKeys: string[] = [];
  let cursor = "0";
  const pattern = tenantConnectionsPattern(tenantId);

  do {
    const [next, keys] = await redis.scan(cursor, { match: pattern, count: 250 });
    cursor = String(next);
    allKeys.push(...keys);
  } while (cursor !== "0");

  if (allKeys.length === 0) return [];

  const values = await redis.mget<(Connection | null)[]>(...allKeys);
  const connections: Connection[] = [];
  for (const data of values) {
    if (data) connections.push(decodeConnection(data));
  }
  return connections;
}

export async function saveConnection(connection: Connection): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  await redis.set(
    connectionKey(connection.tenantId, connection.provider),
    encodeConnection(connection)
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

  // getConnection returns a DECODED (plaintext) object, so write it back through
  // saveConnection to re-encrypt — a direct redis.set here would persist plaintext.
  await saveConnection({
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
