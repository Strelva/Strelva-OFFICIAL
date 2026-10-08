/** Tenant-side adapter to the shared durable client-record move. */
import { workspacePorts, type ClientRecordStoreName } from "./workspace-ports";

export async function mirrorRecord(store: ClientRecordStoreName, tenant: string, recordId: string, value: unknown, capturedAt = new Date().toISOString()): Promise<void> {
  if (process.env.STRELVA_CLIENT_RECORDS_DUAL_WRITE !== "1" || process.env.DUAL_WRITE_PG === "0") return;
  const payload = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : { value };
  await (await workspacePorts().clientRecords()).mirrorClientRecord(store, tenant, { recordId, payload, capturedAt });
}
export async function removeRecord(store: ClientRecordStoreName, tenant: string, recordId: string): Promise<void> {
  if (process.env.STRELVA_CLIENT_RECORDS_DUAL_WRITE !== "1" || process.env.DUAL_WRITE_PG === "0") return;
  await (await workspacePorts().clientRecords()).mirrorClientRecordRemoval(store, tenant, recordId);
}
export async function readRecords<T>(store: ClientRecordStoreName, tenant: string, redis: () => Promise<T[]>, limit?: number): Promise<T[]> {
  if (!(process.env.STRELVA_CLIENT_RECORDS_READ ?? "").split(",").map((s) => s.trim()).includes(store)) return redis();
  return (await workspacePorts().clientRecords()).readThroughFlag(store, tenant, redis, (rows) => rows.slice(0, limit).map((row) => row.payload as T));
}
export async function readRecord<T>(store: ClientRecordStoreName, tenant: string, id: string, redis: () => Promise<T | null>): Promise<T | null> {
  if (!(process.env.STRELVA_CLIENT_RECORDS_READ ?? "").split(",").map((s) => s.trim()).includes(store)) return redis();
  return (await workspacePorts().clientRecords()).readThroughFlag(store, tenant, redis, (rows) => {
    const row = rows.find((r) => r.recordId === id);
    return row ? row.payload as T : null;
  });
}
export async function readSetting<T>(tenant: string, id: string, redis: () => Promise<T>, fallback: T): Promise<T> {
  if (!(process.env.STRELVA_CLIENT_RECORDS_READ ?? "").split(",").map((s) => s.trim()).includes("tenant_settings")) return redis();
  return (await workspacePorts().clientRecords()).readThroughFlag("tenant_settings", tenant, redis, (rows) => (rows.find((r) => r.recordId === id)?.payload.value as T) ?? fallback);
}

/** Nonsecret account/location metadata. Secrets belong to provider_connections. */
export async function readProviderMetadata<T>(tenant: string, provider: string, redis: () => Promise<T | null>): Promise<T | null> {
  const row = await readRecord<{ value: T }>("provider_metadata", tenant, provider, async () => { const value = await redis(); return value === null ? null : { value }; });
  return row?.value ?? null;
}
