/**
 * Where lead reads come from (inquiry 1.0 delta, section 6).
 *
 * Three read sources, chosen by STRELVA_LEADS_READ:
 *   redis    (default, unset or anything else) today's reads. No Postgres I/O.
 *   compare  serve Redis, read Postgres beside it, log any lead id present in
 *            one and not the other. The lead-mirror-reconcile cron records one
 *            parity result per tenant per day in the shared parity ledger.
 *   postgres serve `tenant_leads`, but only after 7 consecutive days of parity
 *            (client_record_parity_streak('tenant_leads')). Until then it acts
 *            as compare. Any Postgres failure or miss serves Redis, so a
 *            flipped read never shows less than Redis would.
 * Rollback is setting the switch back: both stores keep receiving every write.
 *
 * Authority (STRELVA_LEADS_AUTHORITY=postgres) is separate and is the last
 * step: capture writes `tenant_leads` first (src/lib/leads.ts).
 */
import { leadMirrorDb, LEAD_MIRROR_TIMEOUT_MS, type LeadMirrorDb } from "./lead-mirror";
import { dualWritePgEnabled } from "@/platform/infra/db/dual-write";
import { alertOnce } from "@/platform/infra/monitoring";
import { getRedis } from "@/platform/infra/redis";

export type LeadReadMode = "redis" | "compare" | "postgres";
export const LEAD_PARITY_STORE = "tenant_leads";
export const LEAD_PARITY_DAYS_REQUIRED = 7;
/** Redis keeps leads 90 days; parity compares that window. */
export const LEAD_REDIS_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const STREAK_CACHE_MS = 5 * 60 * 1000;

/** The shape LeadRecord has; kept structural so this module doesn't import leads.ts. */
export interface StoredLead {
  id: string;
  name: string;
  email?: string;
  message?: string;
  source?: string;
  fields?: Record<string, string>;
  capabilityId?: string;
  capabilityVersion?: number;
  createdAt: string;
}

export function leadReadMode(env: Partial<Record<string, string | undefined>> = process.env): LeadReadMode {
  const value = env.STRELVA_LEADS_READ?.trim();
  return value === "compare" || value === "postgres" ? value : "redis";
}

export function leadAuthorityIsPostgres(env: Partial<Record<string, string | undefined>> = process.env): boolean {
  return env.STRELVA_LEADS_AUTHORITY?.trim() === "postgres" && dualWritePgEnabled();
}

let streakCache: { days: number; at: number } | null = null;
/** Tests reset the cached parity streak between cases. */
export function resetLeadReadCache(): void {
  streakCache = null;
}

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };

async function rpc(db: LeadMirrorDb, name: string, args: Record<string, unknown>, timeoutMs = LEAD_MIRROR_TIMEOUT_MS): Promise<RpcResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const call = db.rpc(name, args);
  const request = typeof call.abortSignal === "function" ? call.abortSignal(controller.signal) : call;
  const timeout = new Promise<RpcResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ data: null, error: { message: "lead_read_timeout" } });
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve(request), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function database(db?: LeadMirrorDb | null): LeadMirrorDb | null {
  if (db !== undefined) return db;
  try {
    return leadMirrorDb();
  } catch {
    return null;
  }
}

/**
 * The read source actually in force. `postgres` is honoured only after the
 * parity streak; before that (or when the streak can't be read) it is
 * `compare`. Without the switch this does no I/O.
 */
export async function leadReadSource(options: { db?: LeadMirrorDb | null; env?: Partial<Record<string, string | undefined>>; now?: number } = {}): Promise<LeadReadMode> {
  const mode = leadReadMode(options.env);
  if (mode !== "postgres") return mode;
  const now = options.now ?? Date.now();
  if (streakCache && now - streakCache.at < STREAK_CACHE_MS) {
    return streakCache.days >= LEAD_PARITY_DAYS_REQUIRED ? "postgres" : "compare";
  }
  const db = database(options.db);
  if (!db) return "redis";
  try {
    const { data, error } = await rpc(db, "client_record_parity_streak", { p_store: LEAD_PARITY_STORE });
    if (error) return "compare";
    const days = Number((data as { days?: unknown } | null)?.days ?? 0);
    streakCache = { days: Number.isFinite(days) ? days : 0, at: now };
    return streakCache.days >= LEAD_PARITY_DAYS_REQUIRED ? "postgres" : "compare";
  } catch {
    return "compare";
  }
}

/** A workspace can read without Redis only after the Postgres cutover has passed parity. */
export async function leadReadStoreReady(): Promise<boolean> {
  return getRedis() !== null || await leadReadSource() === "postgres";
}

type PgLeadItem = {
  leadId?: unknown;
  name?: unknown;
  email?: unknown;
  message?: unknown;
  source?: unknown;
  fields?: unknown;
  capabilityId?: unknown;
  capabilityVersion?: unknown;
  capturedAt?: unknown;
};

/** `tenant_leads` item → LeadRecord: lead_id → id, captured_at → createdAt. Nulls are omitted, as Redis omits them. */
export function leadFromPostgres(item: PgLeadItem): StoredLead | null {
  if (typeof item.leadId !== "string" || typeof item.capturedAt !== "string" || typeof item.name !== "string" || !Number.isFinite(Date.parse(item.capturedAt))) return null;
  const fields = item.fields && typeof item.fields === "object" && !Array.isArray(item.fields)
    ? Object.fromEntries(Object.entries(item.fields as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>
    : undefined;
  const version = Number(item.capabilityVersion);
  return {
    id: item.leadId,
    name: item.name,
    ...(typeof item.email === "string" ? { email: item.email } : {}),
    ...(typeof item.message === "string" ? { message: item.message } : {}),
    ...(typeof item.source === "string" ? { source: item.source } : {}),
    ...(fields && Object.keys(fields).length ? { fields } : {}),
    ...(typeof item.capabilityId === "string" ? { capabilityId: item.capabilityId } : {}),
    ...(item.capabilityVersion !== null && item.capabilityVersion !== undefined && Number.isSafeInteger(version) && version >= 1 ? { capabilityVersion: version } : {}),
    createdAt: item.capturedAt,
  };
}

/** Newest first. Throws on any failure; callers fall back to Redis. */
export async function readPostgresLeads(tenant: string, limit: number, db?: LeadMirrorDb | null, before: string | null = null): Promise<StoredLead[]> {
  const client = database(db);
  if (!client) throw new Error("lead_read_unconfigured");
  const { data, error } = await rpc(client, "read_tenant_leads", { p_tenant_id: tenant, p_limit: Math.max(1, Math.min(limit, 500)), p_before: before });
  if (error) throw new Error(`lead_read_failed: ${error.message ?? error.code ?? "error"}`);
  if (!Array.isArray(data)) throw new Error("lead_read_malformed");
  const leads = data.map((row) => leadFromPostgres(row as PgLeadItem));
  if (leads.some((lead) => lead === null)) throw new Error("lead_read_malformed");
  return leads as StoredLead[];
}

/** Exact durable page: the lead id breaks ties between submissions captured together. */
export async function readPostgresLeadPage(tenant: string, limit: number, before: string | null = null, beforeId: string | null = null, db?: LeadMirrorDb | null): Promise<StoredLead[]> {
  const client = database(db);
  if (!client) throw new Error("lead_read_unconfigured");
  const { data, error } = await rpc(client, "read_tenant_leads_page", {
    p_tenant_id: tenant, p_limit: Math.max(1, Math.min(limit, 500)), p_before: before, p_before_id: beforeId,
  });
  if (error) throw new Error(`lead_read_failed: ${error.message ?? error.code ?? "error"}`);
  if (!Array.isArray(data)) throw new Error("lead_read_malformed");
  const leads = data.map((row) => leadFromPostgres(row as PgLeadItem));
  if (leads.some((lead) => lead === null)) throw new Error("lead_read_malformed");
  return leads as StoredLead[];
}

/** One lead by id, or null when Postgres has none. Throws on failure. */
export async function readPostgresLead(tenant: string, id: string, db?: LeadMirrorDb | null): Promise<StoredLead | null> {
  const client = database(db);
  if (!client) throw new Error("lead_read_unconfigured");
  const { data, error } = await rpc(client, "read_tenant_lead", { p_tenant_id: tenant, p_lead_id: id });
  if (error) throw new Error(`lead_read_failed: ${error.message ?? error.code ?? "error"}`);
  if (data === null || data === undefined) return null;
  const lead = leadFromPostgres(data as PgLeadItem);
  if (!lead) throw new Error("lead_read_malformed");
  return lead;
}

export async function readPostgresLeadSummary(tenant: string, since: string, db?: LeadMirrorDb | null): Promise<{ count: number; recent: StoredLead[] }> {
  const client = database(db);
  if (!client) throw new Error("lead_read_unconfigured");
  const { data, error } = await rpc(client, "read_tenant_lead_summary", { p_tenant_id: tenant, p_since: since });
  if (error) throw new Error(`lead_read_failed: ${error.message ?? error.code ?? "error"}`);
  const summary = data as { count?: unknown; recent?: unknown } | null;
  if (!summary || !Number.isSafeInteger(summary.count) || Number(summary.count) < 0 || !Array.isArray(summary.recent)) throw new Error("lead_read_malformed");
  const recent = summary.recent.map((row) => leadFromPostgres(row as PgLeadItem));
  if (recent.some((lead) => lead === null)) throw new Error("lead_read_malformed");
  return { count: Number(summary.count), recent: recent as StoredLead[] };
}

export interface LeadListDifference {
  /** In Redis, not in Postgres, inside the window both cover. Unexplained. */
  missingFromPostgres: string[];
  /** In Postgres, not in Redis, inside the window both cover. Redis lost or failed a write. */
  missingFromRedis: string[];
  /** In Postgres, older than anything Redis returned. Explained: Redis expired or trimmed it. */
  postgresOlder: number;
  /** Matching ids whose submitted fields differ. */
  mismatched?: string[];
}

/**
 * Compares two newest-first reads of the same tenant. Each read may be cut by
 * its limit, so only the time window both lists cover is compared.
 */
export function compareLeadLists(redis: readonly StoredLead[], postgres: readonly StoredLead[], hash?: (lead: StoredLead) => string, now = Date.now()): LeadListDifference {
  const oldest = (list: readonly StoredLead[]) => list.reduce((min, lead) => Math.min(min, Date.parse(lead.createdAt)), Number.POSITIVE_INFINITY);
  const floor = Math.max(redis.length ? oldest(redis) : now - LEAD_REDIS_WINDOW_MS, postgres.length ? oldest(postgres) : Number.NEGATIVE_INFINITY);
  const redisIds = new Set(redis.map((lead) => lead.id));
  const pgIds = new Set(postgres.map((lead) => lead.id));
  const inWindow = (lead: StoredLead) => Date.parse(lead.createdAt) >= floor;
  return {
    missingFromPostgres: redis.filter((lead) => inWindow(lead) && !pgIds.has(lead.id)).map((lead) => lead.id),
    missingFromRedis: postgres.filter((lead) => inWindow(lead) && !redisIds.has(lead.id)).map((lead) => lead.id),
    postgresOlder: postgres.filter((lead) => !inWindow(lead) && !redisIds.has(lead.id)).length,
    ...(hash ? { mismatched: redis.filter((lead) => {
      const other = postgres.find((row) => row.id === lead.id);
      return other !== undefined && hash(lead) !== hash(other);
    }).map((lead) => lead.id) } : {}),
  };
}

/** Logs a compare-mode difference. Never throws. */
export async function reportLeadReadDifference(tenant: string, reader: "list" | "by_id", difference: LeadListDifference): Promise<void> {
  if (!difference.missingFromPostgres.length && !difference.missingFromRedis.length && !difference.mismatched?.length) return;
  console.warn("[lead-reads] Redis and Postgres differ", {
    tenant,
    reader,
    missingFromPostgres: difference.missingFromPostgres.slice(0, 20),
    missingFromRedis: difference.missingFromRedis.slice(0, 20),
    mismatched: difference.mismatched?.slice(0, 20) ?? [],
  });
  await alertOnce("lead_read_parity_miss", "high", { tenant, reader, missing: difference.missingFromPostgres.length, missingFromRedis: difference.missingFromRedis.length, mismatched: difference.mismatched?.length ?? 0 }, 3600).catch(() => undefined);
}

export interface LeadParityReport {
  tenant: string;
  ok: boolean;
  redisCount: number;
  postgresCount: number;
  /** In Redis, not in Postgres. */
  missing: string[];
  /** Same lead id, different submission hash. */
  mismatched: string[];
  /** In Postgres only, inside the Redis window: Redis lost or trimmed it. Explained. */
  postgresOnly: number;
  recorded: boolean;
}

/**
 * The daily parity check for one tenant: every lead Redis still holds must be
 * in Postgres with the same submission hash. Records the day's result in the
 * shared parity ledger unless `record: false`. Throws when either store can't
 * be read (the day then has no result, which breaks the streak).
 */
export async function checkLeadParity(
  tenant: string,
  options: {
    redisLeads: readonly StoredLead[];
    hash: (lead: StoredLead) => string;
    db?: LeadMirrorDb | null;
    record?: boolean;
    now?: number;
  },
): Promise<LeadParityReport> {
  const db = database(options.db);
  if (!db) throw new Error("lead_parity_unconfigured");
  const since = new Date((options.now ?? Date.now()) - LEAD_REDIS_WINDOW_MS - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await rpc(db, "read_tenant_lead_digests", { p_tenant_id: tenant, p_since: since }, 4000);
  if (error) throw new Error(`lead_parity_digests_failed: ${error.message ?? error.code ?? "error"}`);
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.values(data).some((value) => typeof value !== "string")) throw new Error("lead_parity_malformed");
  const digests = data as Record<string, string>;
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const lead of options.redisLeads) {
    const stored = digests[lead.id];
    if (!stored) missing.push(lead.id);
    else if (stored !== options.hash(lead)) mismatched.push(lead.id);
  }
  const redisIds = new Set(options.redisLeads.map((lead) => lead.id));
  const postgresCount = Object.keys(digests).length;
  const report: LeadParityReport = {
    tenant,
    ok: missing.length === 0 && mismatched.length === 0,
    redisCount: options.redisLeads.length,
    postgresCount,
    missing,
    mismatched,
    postgresOnly: Object.keys(digests).filter((id) => !redisIds.has(id)).length,
    recorded: false,
  };
  if (options.record !== false) {
    const saved = await rpc(db, "record_client_record_parity", {
      p_store: LEAD_PARITY_STORE,
      p_tenant_id: tenant,
      p_redis_count: report.redisCount,
      p_postgres_count: postgresCount,
      p_missing: missing.length,
      p_mismatched: mismatched.length,
    });
    report.recorded = !saved.error;
  }
  return report;
}
