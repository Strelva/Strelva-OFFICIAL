import { mutateDurableConnection, mirrorRecord, removeRecord, readRecord, readRecords, durableRecordAuthority, writeDurableRecord, removeDurableRecord } from "./client-records";
import { getRedis } from "@/platform/infra/redis";
import { decryptSecret, encryptSecret } from "@/platform/infra/crypto/secrets";
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

const storedConnections = new WeakMap<Connection, Connection>();
function decodeConnection(c: Connection): Connection {
  const decoded = {
    ...c,
    accessToken: decryptSecret(c.accessToken),
    refreshToken: decryptSecret(c.refreshToken) ?? undefined,
    apiKey: decryptSecret(c.apiKey) ?? undefined,
  };
  storedConnections.set(decoded, c);
  return decoded;
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
  const data = await readRecord<Connection>("provider_connections", tenantId, provider, async () => {
    const redis = getRedis();
    return redis ? redis.get<Connection>(connectionKey(tenantId, provider)) : null;
  });
  return data ? decodeConnection(data) : null;
}

export async function getConnections(tenantId: string): Promise<Connection[]> {
  const rows = await readRecords<Connection>("provider_connections", tenantId, () => getRedisConnections(tenantId));
  return rows.map(decodeConnection);
}

async function getRedisConnections(tenantId: string): Promise<Connection[]> {
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
    if (data) connections.push(data);
  }
  return connections;
}

export async function saveConnection(connection: Connection): Promise<void> {
  return saveConnectionAt(connection, new Date().toISOString());
}

async function saveConnectionAt(connection: Connection, capturedAt: string): Promise<void> {
  if (connection.provider === "google" && process.env.STRELVA_NATIVE_GOOGLE_ONLY === "1") throw new Error("Legacy Google grant writes are disabled in native-only admission mode.");
  const redis = getRedis();
  const durable = await durableRecordAuthority("provider_connections");
  const encoded = encodeConnection(connection);
  if (durable) {
    const status = await writeDurableRecord("provider_connections", connection.tenantId, connection.provider, encoded, capturedAt);
    if (status === "kept") throw new Error("Connection update was superseded by a newer change.");
    if (redis) await redis.set(connectionKey(connection.tenantId, connection.provider), encoded).catch(() => {});
    return;
  }
  if (!redis) throw new Error("Connection storage is unavailable");
  await redis.set(connectionKey(connection.tenantId, connection.provider), encoded);
  await mirrorRecord("provider_connections", connection.tenantId, connection.provider, encoded);
}

/** Refresh/status mutations preserve their pre-read time and cannot recreate a
 * removed cache value. Reconnects use saveConnection, not this mutation path. */
export async function saveConnectionMutation(expected: Connection, patch: Partial<Connection>, capturedAt: string): Promise<void> {
  const next = { ...expected, ...patch };
  if (next.provider === "google" && process.env.STRELVA_NATIVE_GOOGLE_ONLY === "1") throw new Error("Legacy Google grant mutations are disabled in native-only admission mode.");
  const encoded = encodeConnection(next);
  const durable = await durableRecordAuthority("provider_connections");
  const raw = storedConnections.get(expected);
  if (!raw) throw new Error("Connection mutation authority is unavailable.");
  if (durable) {
    const status = await mutateDurableConnection(next.tenantId,next.provider,raw,encoded,capturedAt);
    if (status === "kept") throw new Error("Connection mutation was superseded or revoked.");
  }
  const redis = getRedis();
  if (!durable && (!redis || !raw)) throw new Error("Connection mutation authority is unavailable.");
  if (redis && raw) {
    // Compare the exact stored generation, including encrypted tokens. A
    // disconnect or reconnect between the read and EVAL cannot be overwritten.
    const changed = await redis.eval<[string, string], number>(`local value=redis.call('GET',KEYS[1]); if not value then return 0 end
local function equal(a,b) if type(a)~=type(b) then return false end; if type(a)~='table' then return a==b end; for k,v in pairs(a) do if not equal(v,b[k]) then return false end end; for k,v in pairs(b) do if a[k]==nil then return false end end; return true end
if not equal(cjson.decode(value),cjson.decode(ARGV[1])) then return 0 end
redis.call('SET',KEYS[1],ARGV[2]); return 1`, [connectionKey(next.tenantId, next.provider)], [JSON.stringify(raw), JSON.stringify(encoded)]).catch(error => { if (!durable) throw error; return 0; });
    if (!durable && changed !== 1) throw new Error("Connection mutation was superseded or revoked.");
    if (!durable && changed === 1) await mirrorRecord("provider_connections", next.tenantId, next.provider, encoded, capturedAt);
  }
  if (durable || redis) {
    const current = await getConnection(next.tenantId, next.provider);
    if (!current || current.status !== next.status || current.accessToken !== next.accessToken || current.refreshToken !== next.refreshToken) throw new Error("Connection mutation was superseded or revoked.");
  }
}

export async function updateLastSynced(
  tenantId: string,
  provider: IntegrationProvider
): Promise<void> {
  const capturedAt = new Date().toISOString();
  const existing = await getConnection(tenantId, provider);
  if (!existing) return;

  // getConnection returns a DECODED (plaintext) object, so write it back through
  // saveConnection to re-encrypt — a direct redis.set here would persist plaintext.
  await saveConnectionAt({
    ...existing,
    lastSyncedAt: capturedAt,
  }, capturedAt);
}

export async function deleteConnection(
  tenantId: string,
  provider: IntegrationProvider
): Promise<boolean> {
  const redis = getRedis();
  if (await durableRecordAuthority("provider_connections")) {
    await removeDurableRecord("provider_connections", tenantId, provider);
    if (redis) await redis.del(connectionKey(tenantId, provider)).catch(() => {});
    return true;
  }
  if (!redis) throw new Error("Connection storage is unavailable");
  await redis.del(connectionKey(tenantId, provider));
  await removeRecord("provider_connections", tenantId, provider);
  return true;
}
