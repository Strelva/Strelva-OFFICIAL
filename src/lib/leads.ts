/**
 * Lead capture — the honest version of "who reached out".
 *
 * Analytics can only ever show anonymous clicks because the contact/booking form
 * lives in a third-party tool. When a Strelva-native form submits, we capture the
 * actual submission here (name + what they asked) so Today/Analytics can show real
 * people, not proxies. Because it's the customer's own submission, showing the
 * name is honest — not fabricated from click data.
 *
 * Redis-backed 90-day window (recent activity, not a CRM); idempotent on a
 * submission hash so a double-submit doesn't double-count. Every captured lead
 * is also copied to Postgres `tenant_leads` (src/lib/lead-mirror.ts), bounded
 * and never failing the capture, so leads outlive the Redis window.
 *
 * Cutover (inquiry 1.0 delta, section 6), all off by default:
 *   STRELVA_LEADS_READ=compare|postgres   where getLeads / getLeadById /
 *     getLeadSummary read from (src/lib/lead-reads.ts). Signatures unchanged.
 *   STRELVA_LEADS_AUTHORITY=postgres      capture writes `tenant_leads` first;
 *     Redis becomes the cache. A Postgres failure keeps the lead in Redis and
 *     the mirror's pending queue, and the visitor still succeeds.
 */
import { ownerNoticeEmail } from "./owner-recipient";
import { workspacePorts } from "./workspace-ports";
import { getRedis } from "@/platform/infra/redis";
import { getTenantConfig } from "./tenants";
import { getTenantDashboardUrl } from "./tenant-urls";
import { sendNewLeadEmail } from "./delivery-email";
import { mirrorLead, clearLeadMirrorPending, type LeadMirrorResult } from "./lead-mirror";
import { followUpLeadCapture } from "./inquiry-records";
import {
  compareLeadLists,
  leadAuthorityIsPostgres,
  leadReadSource,
  readPostgresLead,
  readPostgresLeads,
  readPostgresLeadPage,
  readPostgresLeadSummary,
  reportLeadReadDifference,
} from "./lead-reads";

export { leadReadSource, leadReadStoreReady } from "./lead-reads";

const LEAD_TTL_SECONDS = 90 * 24 * 60 * 60;
const LEAD_KEEP = 500;

export interface LeadRecord {
  id: string;
  name: string;
  email?: string;
  message?: string;
  /** Where it came from, e.g. "contact-form", "quote". */
  source?: string;
  /** Structured fields from a published inquiry capability, when applicable. */
  fields?: Record<string, string>;
  capabilityId?: string;
  capabilityVersion?: number;
  createdAt: string;
}

export interface LeadSummary {
  count: number;
  recent: LeadRecord[];
}

/** Optional behavior for callers that add their own governed delivery path.
 * Existing callers keep the owner notification by default. A capability that
 * routes the same submission through its own explicit policy can disable this
 * legacy notice so the owner does not receive two messages. */
export interface RecordLeadOptions {
  notifyOwner?: boolean;
}

export interface RecordLeadInput {
  name: string;
  email?: string;
  message?: string;
  source?: string;
  fields?: Record<string, string>;
  capabilityId?: string;
  capabilityVersion?: number;
}

export type RecordLeadResult =
  | { status: "captured"; lead: LeadRecord }
  | { status: "duplicate"; lead?: LeadRecord }
  /** `mirrored` is true only when the Postgres copy confirmed the lead. */
  | { status: "unavailable"; mirrored?: boolean };

function leadsKey(tenant: string): string {
  return `leads:${tenant}`;
}
function leadKey(tenant: string, id: string): string {
  return `lead:${tenant}:${id}`;
}

function newLeadId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `lead_${crypto.randomUUID()}`;
  return `lead_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** A short, stable hash for double-submit dedup (no crypto dep needed). */
function normalizeFields(fields: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return undefined;
  const entries = Object.entries(fields)
    .filter(([key, value]) => /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key) && typeof value === "string")
    .slice(0, 30)
    .map(([key, value]) => [key, value.trim().slice(0, 5000)] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function dedupHash(input: RecordLeadInput, fields?: Record<string, string>): string {
  const serializedFields = fields
    ? Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("&")
    : "";
  const s = `${input.name}|${input.email ?? ""}|${input.message ?? ""}|${input.capabilityId ?? ""}|${input.capabilityVersion ?? ""}|${serializedFields}`.toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** The double-submit hash of a stored lead, as computed when it was captured. */
export function leadSubmissionHash(lead: LeadRecord): string {
  const fields = normalizeFields(lead.fields);
  return dedupHash(
    {
      name: lead.name,
      email: lead.email,
      message: lead.message,
      capabilityId: lead.capabilityId,
      capabilityVersion: lead.capabilityVersion,
      fields,
    },
    fields,
  );
}

/** Capture a form submission. Idempotent over a short window; returns null on dedup/no-redis. */
export async function recordLead(
  tenant: string,
  input: RecordLeadInput,
  options: RecordLeadOptions = {},
): Promise<LeadRecord | null> {
  const result = await captureLead(tenant, input, options);
  return result.status === "captured" ? result.lead : null;
}

/**
 * Capture a lead while exposing the persistence outcome to new capability
 * routes. Legacy callers retain `recordLead`'s nullable return behavior.
 */
export async function captureLead(
  tenant: string,
  input: RecordLeadInput,
  options: RecordLeadOptions = {},
): Promise<RecordLeadResult> {
  const redis = getRedis();
  const fields = normalizeFields(input.fields);

  const lead: LeadRecord = {
    id: newLeadId(),
    name: input.name,
    email: input.email,
    message: input.message,
    source: input.source,
    ...(fields ? { fields } : {}),
    ...(input.capabilityId ? { capabilityId: input.capabilityId } : {}),
    ...(Number.isSafeInteger(input.capabilityVersion) && (input.capabilityVersion ?? 0) >= 1
      ? { capabilityVersion: input.capabilityVersion }
      : {}),
    createdAt: new Date().toISOString(),
  };

  const hash = dedupHash(input, fields);
  if (leadAuthorityIsPostgres()) {
    const first = await capturePostgresFirst(tenant, lead, hash, options);
    if (first) return first;
  }
  // Without Redis the lead still reaches Postgres; callers see "unavailable"
  // exactly as before.
  if (!redis) {
    const mirrored = await mirrorLead(tenant, lead, hash);
    return { status: "unavailable", mirrored: mirrored.status === "recorded" || mirrored.status === "exists" || mirrored.status === "duplicate" };
  }

  // Best-effort double-submit guard (a refresh/double-click), 5-minute window.
  const dedupKey = `lead-dedup:${tenant}:${hash}`;
  let fresh: unknown;
  try {
    fresh = await redis.set(dedupKey, lead.id, { nx: true, ex: 300 });
  } catch (err) {
    // Redis is down: keep the submission in Postgres, then fail as before.
    await mirrorLead(tenant, lead, hash);
    throw err;
  }
  if (!fresh) {
    // The marker contains the accepted lead id, so a retry can repair a
    // missing canonical receipt without creating a second Redis record.
    const duplicateId = await redis.get<string>(dedupKey).catch(() => null);
    const duplicate = duplicateId && duplicateId !== "1"
      ? await redis.get<LeadRecord>(leadKey(tenant, duplicateId)).catch(() => null)
      : null;
    // A retry also repairs a Postgres copy the first attempt couldn't write;
    // the store treats the same lead id as a no-op.
    if (duplicate) {
      await mirrorLead(tenant, duplicate, hash);
      // A failed Postgres-first attempt may have queued the generated retry
      // id before Redis identified the accepted original submission.
      if (leadAuthorityIsPostgres()) await clearLeadMirrorPending(tenant, lead.id);
    }
    return duplicate ? { status: "duplicate", lead: duplicate } : { status: "duplicate" };
  }

  // The dedup lock is held before the writes; if a write fails we must release
  // it, or a retry of the same submission is swallowed by the 5-minute guard
  // while the record sits orphaned (set but never indexed → invisible to
  // getLeads). Releasing lets the beacon's retry capture the lead cleanly.
  try {
    await redis.set(leadKey(tenant, lead.id), lead, { ex: LEAD_TTL_SECONDS });
    await redis.zadd(leadsKey(tenant), { score: Date.now(), member: lead.id });
    await redis.zremrangebyrank(leadsKey(tenant), 0, -(LEAD_KEEP + 1));
  } catch (err) {
    await redis.del(dedupKey).catch(() => {});
    // Keep the submission in Postgres even though Redis failed; the visitor's
    // retry is recognized there as the same submission.
    await mirrorLead(tenant, lead, hash);
    throw err;
  }

  // Copy to Postgres and notify the owner side by side. Both are bounded and
  // never throw; the email goes only for genuinely new leads (the dedup guard
  // above already returned on a re-submission).
  await Promise.all([
    mirrorLead(tenant, lead, hash).then((kept) => followUpKept(tenant, lead.id, kept)),
    options.notifyOwner !== false ? notifyOwnerOfLead(tenant, lead) : Promise.resolve(),
  ]);
  return { status: "captured", lead };
}

/**
 * Once Postgres holds a new lead: its `captured` event and, in a converted
 * business, the sender as a contact (inquiry 1.0 delta, C9). Off unless
 * STRELVA_INQUIRY_RECORDS=1; bounded and never throws.
 */
async function followUpKept(tenant: string, leadId: string, kept: LeadMirrorResult): Promise<void> {
  if (kept.status === "recorded" || kept.status === "exists") await followUpLeadCapture(tenant, leadId);
}

function mirrorKept(result: LeadMirrorResult): boolean {
  return result.status === "recorded" || result.status === "exists" || result.status === "duplicate";
}

/**
 * Capture with Postgres as the record (step 4 of the cutover). `tenant_leads`
 * is written first and decides duplicates. Redis is then written as the cache
 * that the 90-day window and the reconcile cron use; once Postgres has the
 * lead, a Redis failure no longer fails the visitor. If Postgres refuses or
 * times out, mirrorLead has already queued the lead in
 * `reb:lead-mirror:pending`, and the Redis copy is what the reconcile cron
 * replays. Only when both stores fail does the visitor see today's error.
 *
 * Returns null when Postgres isn't configured here: authority can't move, so
 * the caller captures exactly as today.
 */
async function capturePostgresFirst(
  tenant: string,
  lead: LeadRecord,
  hash: string,
  options: RecordLeadOptions,
): Promise<RecordLeadResult | null> {
  const kept = await mirrorLead(tenant, lead, hash);
  // Redis retains its NX double-submit guard while Postgres cannot decide.
  if (kept.status === "skipped" || kept.status === "failed") return null;
  const redis = getRedis();
  if (kept.status === "duplicate") {
    const marker = kept.leadId ?? (redis ? await redis.get<string>(`lead-dedup:${tenant}:${hash}`).catch(() => null) : null);
    const existing = marker && marker !== "1" ? await readPostgresLead(tenant, marker).catch(() => null) : null;
    return existing ? { status: "duplicate", lead: existing } : { status: "duplicate" };
  }

  const pgKept = mirrorKept(kept);
  await followUpKept(tenant, lead.id, kept);
  let cached = false;
  if (redis) {
    try {
      // Postgres decided this is new, so the double-submit marker names it.
      await redis.set(`lead-dedup:${tenant}:${hash}`, lead.id, { ex: 300 });
      await redis.set(leadKey(tenant, lead.id), lead, { ex: LEAD_TTL_SECONDS });
      await redis.zadd(leadsKey(tenant), { score: Date.now(), member: lead.id });
      await redis.zremrangebyrank(leadsKey(tenant), 0, -(LEAD_KEEP + 1));
      cached = true;
    } catch (err) {
      console.error(`[leads] Redis cache write failed for tenant ${tenant}${pgKept ? " (lead kept in Postgres)" : ""}:`, err);
      if (!pgKept) throw err;
    }
  }
  // Neither store holds it (no Redis configured and Postgres refused): the
  // pending queue can't replay it either, so say so as today's no-Redis path does.
  if (!pgKept && !cached) return { status: "unavailable", mirrored: false };
  if (options.notifyOwner !== false) await notifyOwnerOfLead(tenant, lead);
  return { status: "captured", lead };
}

/**
 * Email the tenant's owner that someone reached out. Resolves owner + dashboard
 * the same way the weekly-report cron does. Fully swallowed-but-logged: the
 * lead is already captured, so notification failure can never surface to the
 * caller. Resend errors are counted (logged), not silently dropped.
 */
async function notifyOwnerOfLead(tenant: string, lead: LeadRecord): Promise<void> {
  try {
    if (process.env.STRELVA_INQUIRY_OWNER_NOTICES?.trim() === "1") {
      await (await workspacePorts().inquiries()).notifyInquiryOwner({ tenantId: tenant, lead });
      return;
    }
    const config = await getTenantConfig(tenant);
    if (!config) return;
    // One owner-recipient rule for every owner notice (src/lib/owner-recipient.ts).
    const email = await ownerNoticeEmail(config);
    if (!email) return;
    await sendNewLeadEmail({
      tenantId: tenant,
      email,
      siteName: config.siteName,
      lead: { name: lead.name, email: lead.email, message: lead.message },
      dashboardUrl: getTenantDashboardUrl(config, "/dashboard"),
      logPrefix: "[leads]",
    });
  } catch (err) {
    console.error(`[leads] Owner notification failed for tenant ${tenant}:`, err);
  }
}

/** Most recent leads, newest first, from Redis only. Scripts and the operator
 * merge read Redis on purpose; product readers use getLeads. */
export async function getRedisLeads(tenant: string, limit = 50): Promise<LeadRecord[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids = await redis.zrange<string[]>(leadsKey(tenant), 0, limit - 1, { rev: true });
  if (!ids.length) return [];
  const rows = await redis.mget<LeadRecord[]>(...ids.map((id) => leadKey(tenant, id)));
  return rows.filter((l): l is LeadRecord => Boolean(l));
}

/** One lead from Redis only. */
export async function getRedisLeadById(tenant: string, id: string): Promise<LeadRecord | null> {
  const redis = getRedis();
  if (!redis || !tenant.trim() || !id.trim()) return null;
  return redis.get<LeadRecord>(leadKey(tenant, id));
}

function mergeNewestFirst(primary: LeadRecord[], extra: LeadRecord[], limit: number): LeadRecord[] {
  const seen = new Set(primary.map((lead) => lead.id));
  return [...primary, ...extra.filter((lead) => !seen.has(lead.id))]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .slice(0, limit);
}

/** Most recent leads, newest first, from the read source in force (src/lib/lead-reads.ts). */
export async function getLeads(tenant: string, limit = 50, before: string | null = null, beforeId: string | null = null): Promise<LeadRecord[]> {
  const source = await leadReadSource();
  // The cursor is additive and affects only the opted-in durable read path.
  const redisPage = async () => {
    const leads = await getRedisLeads(tenant, before && source !== "redis" ? LEAD_KEEP : limit);
    return before && source !== "redis" ? leads.filter((lead) => (Date.parse(lead.createdAt) < Date.parse(before) || (beforeId !== null && Date.parse(lead.createdAt) === Date.parse(before) && lead.id < beforeId))).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)).slice(0, limit) : leads;
  };
  if (source === "redis") return redisPage();
  if (source === "compare") {
    const [redisLeads, pgLeads] = await Promise.all([
      redisPage(),
      readPostgresLeads(tenant, limit, undefined, before).catch((err: unknown) => {
        console.warn(`[lead-reads] compare read failed for ${tenant}:`, err instanceof Error ? err.message : err);
        return null;
      }),
    ]);
    if (pgLeads) await reportLeadReadDifference(tenant, "list", compareLeadLists(redisLeads, pgLeads, leadSubmissionHash));
    return redisLeads;
  }
  // Postgres serves. Redis is read beside it so a lead whose Postgres copy is
  // still pending is never hidden, and a Redis outage no longer fails the read.
  const [pgLeads, redisLeads] = await Promise.all([
    readPostgresLeadPage(tenant, limit, before, beforeId).catch((err: unknown) => {
      console.error(`[lead-reads] Postgres read failed for ${tenant}; serving Redis:`, err instanceof Error ? err.message : err);
      return null;
    }),
    getRedis() ? redisPage().catch(() => null) : Promise.resolve(null),
  ]);
  if (!pgLeads) {
    if (redisLeads) return redisLeads;
    throw new Error("lead_read_unavailable");
  }
  return mergeNewestFirst(pgLeads, redisLeads ?? [], limit);
}

/** Read one captured lead by its durable id, from the read source in force. */
export async function getLeadById(tenant: string, id: string): Promise<LeadRecord | null> {
  if (!tenant.trim() || !id.trim()) return null;
  const source = await leadReadSource();
  if (source === "redis") return getRedisLeadById(tenant, id);
  if (source === "compare") {
    const [redisLead, pgLead] = await Promise.all([
      getRedisLeadById(tenant, id),
      readPostgresLead(tenant, id).catch(() => undefined),
    ]);
    if (pgLead !== undefined) {
      await reportLeadReadDifference(tenant, "by_id", compareLeadLists(redisLead ? [redisLead] : [], pgLead ? [pgLead] : [], leadSubmissionHash));
    }
    return redisLead;
  }
  const pgLead = await readPostgresLead(tenant, id).catch((err: unknown) => {
    console.error(`[lead-reads] Postgres read failed for ${tenant}/${id}; serving Redis:`, err instanceof Error ? err.message : err);
    return null;
  });
  return pgLead ?? getRedisLeadById(tenant, id);
}

/** Count of leads in the window + the most recent few, for the Today feed. */
export async function getLeadSummary(tenant: string, sinceDays = 30): Promise<LeadSummary> {
  if (await leadReadSource() === "postgres") {
    try {
      return await readPostgresLeadSummary(tenant, new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString());
    } catch (error) {
      console.error(`[lead-reads] Postgres summary failed for ${tenant}; serving cached records:`, error instanceof Error ? error.message : error);
    }
  }
  const leads = await getLeads(tenant, LEAD_KEEP);
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const recent = leads.filter((l) => new Date(l.createdAt).getTime() >= cutoff);
  return { count: recent.length, recent: recent.slice(0, 5) };
}
