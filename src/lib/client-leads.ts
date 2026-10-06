/**
 * Client leads for Strelva operators: what visitors submitted on client sites
 * through `/api/v1/leads/[tenant]` (and other captureLead callers). Not
 * Strelva's own prospects, which live at /admin/leads.
 *
 * Reads Postgres `tenant_leads` first and merges the Redis window, so a lead
 * that hasn't reached Postgres yet (before the backfill, or after a failed
 * copy) still shows, marked as Redis-only with the date Redis drops it.
 * Callers must already have checked super-admin.
 */
import { getAllTenants } from "./tenants";
import { getLeadById, getLeads, leadSubmissionHash, type LeadRecord } from "./leads";
import {
  clearLeadMirrorPending,
  getLeadMirrorHealth,
  leadMirrorDb,
  listLeadMirrorPending,
  mirrorLead,
  type LeadMirrorHealth,
} from "./lead-mirror";
import { dualWritePgEnabled } from "./db/dual-write";
import { getRedis } from "./redis";

const REDIS_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const READ_TIMEOUT_MS = 4000;

export interface OperatorClientLead {
  key: string;
  tenantId: string;
  siteName: string;
  leadId: string;
  name: string;
  email?: string;
  message?: string;
  source?: string;
  fields?: Record<string, string>;
  capturedAt: string;
  stored: "postgres" | "redis_only";
  /** Redis-only leads: when the 90-day window drops them. */
  expiresAt?: string;
  workspaceId?: string | null;
}

export type StoreState = "ok" | "unconfigured" | "unavailable";

export interface OperatorClientLeads {
  leads: OperatorClientLead[];
  postgres: StoreState;
  redis: StoreState;
  health: LeadMirrorHealth;
}

type PgLeadRow = {
  tenantId: string;
  siteName: string | null;
  leadId: string;
  name: string;
  email: string | null;
  message: string | null;
  source: string | null;
  fields: Record<string, string> | null;
  capturedAt: string;
  workspaceId: string | null;
};

function isPgRow(value: unknown): value is PgLeadRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.tenantId === "string" && typeof row.leadId === "string" && typeof row.name === "string" && typeof row.capturedAt === "string";
}

async function readPostgres(tenant: string | null, limit: number): Promise<{ state: StoreState; rows: PgLeadRow[] }> {
  let db;
  try {
    db = leadMirrorDb();
  } catch {
    db = null;
  }
  if (!db) return { state: "unconfigured", rows: [] };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const call = db.rpc("read_tenant_leads", { p_tenant_id: tenant, p_limit: limit, p_before: null });
    const request = typeof call.abortSignal === "function" ? call.abortSignal(controller.signal) : call;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve("timeout");
      }, READ_TIMEOUT_MS);
    });
    const outcome = await Promise.race([Promise.resolve(request), timeout]);
    if (outcome === "timeout" || outcome.error || !Array.isArray(outcome.data)) {
      if (outcome !== "timeout" && outcome.error) console.error("[client-leads] Postgres read failed", outcome.error.message);
      return { state: "unavailable", rows: [] };
    }
    return { state: "ok", rows: outcome.data.filter(isPgRow) };
  } catch (err) {
    console.error("[client-leads] Postgres read failed", err);
    return { state: "unavailable", rows: [] };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readRedis(tenantIds: string[], limit: number): Promise<{ state: StoreState; rows: { tenantId: string; lead: LeadRecord }[] }> {
  if (!getRedis()) return { state: "unconfigured", rows: [] };
  try {
    const perTenant = await Promise.all(
      tenantIds.map(async (tenantId) => (await getLeads(tenantId, limit)).map((lead) => ({ tenantId, lead }))),
    );
    return { state: "ok", rows: perTenant.flat() };
  } catch (err) {
    console.error("[client-leads] Redis read failed", err);
    return { state: "unavailable", rows: [] };
  }
}

/** Newest first, at most `limit`, optionally for one tenant. */
export async function getClientLeadsForOperator(
  options: { tenant?: string | null; limit?: number } = {},
): Promise<OperatorClientLeads> {
  const tenant = options.tenant ?? null;
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const tenants = await getAllTenants().catch(() => []);
  const siteNames = new Map(tenants.map((t) => [t.id, t.siteName]));
  const tenantIds = tenant ? [tenant] : tenants.map((t) => t.id);

  const [pg, redis, health] = await Promise.all([
    readPostgres(tenant, limit),
    readRedis(tenantIds, Math.min(limit, 100)),
    getLeadMirrorHealth(),
  ]);

  const merged = new Map<string, OperatorClientLead>();
  for (const row of pg.rows) {
    const key = `${row.tenantId}:${row.leadId}`;
    merged.set(key, {
      key,
      tenantId: row.tenantId,
      siteName: row.siteName ?? siteNames.get(row.tenantId) ?? row.tenantId,
      leadId: row.leadId,
      name: row.name,
      ...(row.email ? { email: row.email } : {}),
      ...(row.message ? { message: row.message } : {}),
      ...(row.source ? { source: row.source } : {}),
      ...(row.fields ? { fields: row.fields } : {}),
      capturedAt: row.capturedAt,
      stored: "postgres",
      workspaceId: row.workspaceId,
    });
  }
  for (const { tenantId, lead } of redis.rows) {
    const key = `${tenantId}:${lead.id}`;
    if (merged.has(key)) continue;
    const captured = Date.parse(lead.createdAt);
    merged.set(key, {
      key,
      tenantId,
      siteName: siteNames.get(tenantId) ?? tenantId,
      leadId: lead.id,
      name: lead.name,
      ...(lead.email ? { email: lead.email } : {}),
      ...(lead.message ? { message: lead.message } : {}),
      ...(lead.source ? { source: lead.source } : {}),
      ...(lead.fields ? { fields: lead.fields } : {}),
      capturedAt: lead.createdAt,
      stored: "redis_only",
      ...(Number.isFinite(captured) ? { expiresAt: new Date(captured + REDIS_WINDOW_MS).toISOString() } : {}),
    });
  }
  const leads = [...merged.values()]
    .sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : a.capturedAt > b.capturedAt ? -1 : a.key < b.key ? 1 : -1))
    .slice(0, limit);
  return { leads, postgres: pg.state, redis: redis.state, health };
}

export interface LeadMirrorReconcileResult {
  checked: number;
  repaired: number;
  failed: number;
  /** Pending entries whose lead is no longer in Redis (expired, or the tenant was renamed). */
  missing: number;
  remaining: number;
  skipped?: "disabled" | "unconfigured";
  /**
   * Postgres has no `tenant_leads` / `record_tenant_lead` yet. The run stopped
   * at the first sign of it instead of failing every pending lead; the one
   * page went out when it was first seen (src/lib/lead-mirror.ts).
   */
  schemaMissing?: true;
}

/**
 * Retry leads whose Postgres copy failed, oldest first, until `limit` or the
 * deadline. A lead that is copied, or already there, leaves the pending set.
 */
export async function reconcileLeadMirror(
  options: { limit?: number; deadlineMs?: number } = {},
): Promise<LeadMirrorReconcileResult> {
  const result: LeadMirrorReconcileResult = { checked: 0, repaired: 0, failed: 0, missing: 0, remaining: 0 };
  if (!dualWritePgEnabled()) return { ...result, skipped: "disabled" };
  if (!leadMirrorDb()) return { ...result, skipped: "unconfigured" };
  const deadline = Date.now() + (options.deadlineMs ?? 60_000);
  const pending = await listLeadMirrorPending(options.limit ?? 100);
  for (const item of pending) {
    if (Date.now() > deadline) break;
    result.checked++;
    const lead = await getLeadById(item.tenant, item.leadId).catch(() => null);
    if (!lead) {
      result.missing++;
      console.error("[lead-mirror] pending lead no longer in Redis; run the backfill to check", item);
      await clearLeadMirrorPending(item.tenant, item.leadId);
      continue;
    }
    const outcome = await mirrorLead(item.tenant, lead, leadSubmissionHash(lead), { via: "repair" });
    if ((outcome.status === "skipped" || outcome.status === "failed") && outcome.reason === "schema_missing") {
      result.checked--;
      result.schemaMissing = true;
      break;
    }
    if (outcome.status === "recorded" || outcome.status === "exists" || outcome.status === "duplicate") {
      result.repaired++;
      await clearLeadMirrorPending(item.tenant, item.leadId);
    } else {
      result.failed++;
    }
  }
  result.remaining = (await getLeadMirrorHealth()).pending;
  return result;
}
