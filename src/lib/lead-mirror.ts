/**
 * Client lead copy in Postgres (Strelva Reborn section 0).
 *
 * Every captured lead is also written to `public.tenant_leads` through the
 * service-role `record_tenant_lead` RPC. Redis stays the read path for
 * dashboards and the inquiry engine until cutover; this copy is what keeps a
 * lead after Redis's 90-day / 500-per-tenant window drops it.
 *
 * Two rules, enforced here so callers can't get them wrong:
 *  1. Bounded. A write that hasn't answered in LEAD_MIRROR_TIMEOUT_MS is
 *     abandoned (and aborted). Failure reporting has its own short bound,
 *     including Redis writes and alert deduplication.
 *  2. Never throws. A failure is recorded in Redis (`reb:lead-mirror:pending`,
 *     `reb:lead-mirror:last-failure`), paged once an hour per reason, shown in
 *     the operator console, and retried by the lead-mirror-reconcile cron.
 *
 * Kill switch: DUAL_WRITE_PG=0, the same switch as the other Postgres mirrors.
 * Without Supabase env it is a no-op.
 */
import { getSupabase } from "./db/client";
import { dualWritePgEnabled } from "./db/dual-write";
import { getRedis } from "./redis";
import { alertOnce } from "./monitoring";

export const LEAD_MIRROR_TIMEOUT_MS = 1500;
export const LEAD_MIRROR_FAILURE_TIMEOUT_MS = 250;
export const LEAD_MIRROR_PENDING_KEY = "reb:lead-mirror:pending";
export const LEAD_MIRROR_LAST_FAILURE_KEY = "reb:lead-mirror:last-failure";
const PENDING_KEEP = 5000;

export type LeadMirrorVia = "dual_write" | "repair" | "backfill";
export type LeadMirrorFailureReason = "timeout" | "unknown_tenant" | "invalid" | "schema_missing" | "error";

/** The fields of a captured lead the copy stores. Matches LeadRecord. */
export interface LeadMirrorInput {
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

export type LeadMirrorResult =
  | { status: "recorded" | "exists" | "duplicate"; id: string; workspaceId: string | null }
  | { status: "skipped"; reason: "disabled" | "unconfigured" }
  | { status: "failed"; reason: LeadMirrorFailureReason };

export interface LeadMirrorFailure {
  at: string;
  tenant: string;
  leadId: string;
  reason: LeadMirrorFailureReason;
}

export interface LeadMirrorHealth {
  /** False when Redis can't be read, so the counts below are unknown. */
  known: boolean;
  pending: number;
  oldestPendingAt: string | null;
  lastFailure: LeadMirrorFailure | null;
}

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };
type RpcCall = PromiseLike<RpcResult> & { abortSignal?: (signal: AbortSignal) => PromiseLike<RpcResult> };
export type LeadMirrorDb = { rpc(name: string, args: Record<string, unknown>): RpcCall };

let override: { db: LeadMirrorDb | null } | null = null;

/** Tests and scripts may supply their own client (null = unconfigured). */
export function setLeadMirrorDb(db: LeadMirrorDb | null | undefined): void {
  override = db === undefined ? null : { db };
}

export function leadMirrorDb(): LeadMirrorDb | null {
  if (override) return override.db;
  return getSupabase() as unknown as LeadMirrorDb | null;
}

// Postgres text and jsonb reject NUL and unpaired UTF-16 surrogates, which a
// browser or bot can still send. Clean them so one odd byte can't lose a lead.
const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
function clean(value: string, max: number): string {
  return value.replace(/\u0000/g, "").slice(0, max).replace(UNPAIRED_SURROGATE, "�");
}
function optional(value: string | undefined, max: number): string | undefined {
  return typeof value === "string" ? clean(value, max) : undefined;
}

/** The exact payload `record_tenant_lead` accepts, bounded to its limits. */
export function leadMirrorPayload(lead: LeadMirrorInput, submissionHash: string): Record<string, unknown> {
  let fields: Record<string, string> | undefined;
  if (lead.fields && typeof lead.fields === "object") {
    fields = {};
    for (const [key, value] of Object.entries(lead.fields).slice(0, 30)) {
      if (typeof value === "string") fields[clean(key, 64)] = clean(value, 5000);
    }
    if (JSON.stringify(fields).length > 250_000) fields = undefined;
  }
  const version = lead.capabilityVersion;
  return {
    leadId: lead.id,
    submissionHash,
    name: clean(typeof lead.name === "string" ? lead.name : "", 200),
    ...(optional(lead.email, 320) !== undefined ? { email: optional(lead.email, 320) } : {}),
    ...(optional(lead.message, 5000) !== undefined ? { message: optional(lead.message, 5000) } : {}),
    ...(optional(lead.source, 80) !== undefined ? { source: optional(lead.source, 80) } : {}),
    ...(fields && Object.keys(fields).length ? { fields } : {}),
    ...(optional(lead.capabilityId, 200) !== undefined ? { capabilityId: optional(lead.capabilityId, 200) } : {}),
    ...(Number.isSafeInteger(version) && (version ?? 0) >= 1 && (version ?? 0) < 1_000_000_000 ? { capabilityVersion: version } : {}),
    capturedAt: lead.createdAt,
  };
}

function classify(error: { message?: string; code?: string }): LeadMirrorFailureReason {
  const detail = `${error.code ?? ""} ${error.message ?? ""}`;
  if (detail.includes("tenant_lead_unknown_tenant")) return "unknown_tenant";
  if (detail.includes("tenant_lead_invalid")) return "invalid";
  if (/PGRST202|42883|42P01|record_tenant_lead/.test(detail)) return "schema_missing";
  if (/abort/i.test(detail)) return "timeout";
  return "error";
}

function pendingMember(tenant: string, leadId: string): string {
  return `${tenant}:${leadId}`;
}

export function parsePendingMember(member: string): { tenant: string; leadId: string } | null {
  const at = member.lastIndexOf(":");
  if (at <= 0 || at === member.length - 1) return null;
  return { tenant: member.slice(0, at), leadId: member.slice(at + 1) };
}

/** Remember a lead that isn't in Postgres yet, and page (deduped hourly). */
export async function recordLeadMirrorFailure(
  tenant: string,
  leadId: string,
  reason: LeadMirrorFailureReason,
): Promise<void> {
  const failure: LeadMirrorFailure = { at: new Date().toISOString(), tenant, leadId, reason };
  console.error("[lead-mirror] lead not copied to Postgres", failure);
  const redis = getRedis();
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const remember = async () => {
    if (!redis) return;
    try {
      await redis.zadd(LEAD_MIRROR_PENDING_KEY, { nx: true }, { score: Date.now(), member: pendingMember(tenant, leadId) });
      if (expired) return;
      await redis.zremrangebyrank(LEAD_MIRROR_PENDING_KEY, 0, -(PENDING_KEEP + 1));
      if (expired) return;
      await redis.set(LEAD_MIRROR_LAST_FAILURE_KEY, failure);
    } catch (err) {
      console.error("[lead-mirror] could not record the failure", err);
    }
  };
  // Report and remember independently: a stalled queue write must not prevent
  // the operator alert from being attempted. Neither blocks visitor intake.
  try {
    await Promise.race([
      Promise.allSettled([remember(), alertOnce("lead_mirror_failed", "high", { reason }, 3600)]),
      new Promise<void>(resolve => {
        timer = setTimeout(() => { expired = true; resolve(); }, LEAD_MIRROR_FAILURE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function clearLeadMirrorPending(tenant: string, leadId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.zrem(LEAD_MIRROR_PENDING_KEY, pendingMember(tenant, leadId));
  } catch {
    // the reconcile cron will try again
  }
}

/** Oldest first. */
export async function listLeadMirrorPending(limit: number): Promise<{ tenant: string; leadId: string }[]> {
  const redis = getRedis();
  if (!redis) return [];
  const members = await redis.zrange<string[]>(LEAD_MIRROR_PENDING_KEY, 0, Math.max(0, limit - 1));
  return members.map(parsePendingMember).filter((item): item is { tenant: string; leadId: string } => Boolean(item));
}

export async function getLeadMirrorHealth(): Promise<LeadMirrorHealth> {
  const redis = getRedis();
  if (!redis) return { known: false, pending: 0, oldestPendingAt: null, lastFailure: null };
  try {
    const [pending, oldest, lastFailure] = await Promise.all([
      redis.zcard(LEAD_MIRROR_PENDING_KEY),
      redis.zrange<(string | number)[]>(LEAD_MIRROR_PENDING_KEY, 0, 0, { withScores: true }),
      redis.get<LeadMirrorFailure>(LEAD_MIRROR_LAST_FAILURE_KEY),
    ]);
    const score = Array.isArray(oldest) && oldest.length >= 2 ? Number(oldest[1]) : NaN;
    return {
      known: true,
      pending: Number(pending) || 0,
      oldestPendingAt: Number.isFinite(score) ? new Date(score).toISOString() : null,
      lastFailure: lastFailure ?? null,
    };
  } catch {
    return { known: false, pending: 0, oldestPendingAt: null, lastFailure: null };
  }
}

/**
 * Write one lead to Postgres, bounded by `timeoutMs`. Never throws. A failure
 * on the live path (dual_write) or a retry (repair) is recorded for operators;
 * the backfill script reports its own failures.
 */
export async function mirrorLead(
  tenant: string,
  lead: LeadMirrorInput,
  submissionHash: string,
  options: { via?: LeadMirrorVia; timeoutMs?: number } = {},
): Promise<LeadMirrorResult> {
  const via = options.via ?? "dual_write";
  if (!dualWritePgEnabled()) return { status: "skipped", reason: "disabled" };
  let client: LeadMirrorDb | null;
  try {
    client = leadMirrorDb();
  } catch {
    client = null;
  }
  if (!client) return { status: "skipped", reason: "unconfigured" };

  const fail = async (reason: LeadMirrorFailureReason): Promise<LeadMirrorResult> => {
    if (via !== "backfill") await recordLeadMirrorFailure(tenant, lead.id, reason);
    return { status: "failed", reason };
  };

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const call = client.rpc("record_tenant_lead", {
      p_tenant_id: tenant,
      p_lead: leadMirrorPayload(lead, submissionHash),
      p_via: via,
    });
    const request = typeof call.abortSignal === "function" ? call.abortSignal(controller.signal) : call;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve("timeout");
      }, options.timeoutMs ?? LEAD_MIRROR_TIMEOUT_MS);
    });
    const outcome = await Promise.race([Promise.resolve(request), timeout]);
    if (outcome === "timeout") return fail("timeout");
    if (outcome.error) return fail(classify(outcome.error));
    const data = outcome.data as { status?: unknown; id?: unknown; workspaceId?: unknown } | null;
    if (!data || (data.status !== "recorded" && data.status !== "exists" && data.status !== "duplicate") || typeof data.id !== "string") {
      return fail("error");
    }
    return { status: data.status, id: data.id, workspaceId: typeof data.workspaceId === "string" ? data.workspaceId : null };
  } catch (err) {
    return fail(err instanceof Error && err.name === "AbortError" ? "timeout" : "error");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type LeadRetentionPurge =
  | { status: "purged"; purged: number; tenants: number }
  | { status: "unavailable"; reason: string };

/**
 * Delete client lead copies whose stated retention has passed: leads of a
 * deprovisioned tenant that belong to no business, 365 days after the tenant
 * row went (20261007110000_business_ownership.sql). Each purge leaves one
 * receipt per tenant in `tenant_lead_purges`. Never throws: a missing function
 * (migration not applied) or an unconfigured database reports unavailable.
 */
export async function purgeExpiredTenantLeads(limit = 1000): Promise<LeadRetentionPurge> {
  let db: LeadMirrorDb | null;
  try {
    db = leadMirrorDb();
  } catch {
    db = null;
  }
  if (!db) return { status: "unavailable", reason: "unconfigured" };
  try {
    const { data, error } = await db.rpc("purge_expired_tenant_leads", { p_limit: limit });
    if (error) return { status: "unavailable", reason: error.message || "rpc_failed" };
    const row = data as { purged?: unknown; tenants?: unknown } | null;
    const purged = Number(row?.purged ?? NaN);
    const tenants = Number(row?.tenants ?? NaN);
    if (!Number.isInteger(purged) || !Number.isInteger(tenants)) return { status: "unavailable", reason: "malformed_response" };
    return { status: "purged", purged, tenants };
  } catch (err) {
    return { status: "unavailable", reason: err instanceof Error ? err.message : "rpc_failed" };
  }
}
