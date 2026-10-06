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
 * and never failing the capture, so leads outlive the Redis window. Reads stay
 * on Redis until cutover.
 */
import { getRedis } from "./redis";
import { getTenantConfig } from "./tenants";
import { getTenantDashboardUrl } from "./tenant-urls";
import { sendNewLeadEmail } from "./delivery-email";
import { mirrorLead } from "./lead-mirror";

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
    if (duplicate) await mirrorLead(tenant, duplicate, hash);
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
    mirrorLead(tenant, lead, hash),
    options.notifyOwner !== false ? notifyOwnerOfLead(tenant, lead) : Promise.resolve(),
  ]);
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
    const config = await getTenantConfig(tenant);
    if (!config?.ownerEmail) return;
    await sendNewLeadEmail({
      tenantId: tenant,
      email: config.ownerEmail,
      siteName: config.siteName,
      lead: { name: lead.name, email: lead.email, message: lead.message },
      dashboardUrl: getTenantDashboardUrl(config, "/dashboard"),
      logPrefix: "[leads]",
    });
  } catch (err) {
    console.error(`[leads] Owner notification failed for tenant ${tenant}:`, err);
  }
}

/** Most recent leads, newest first. */
export async function getLeads(tenant: string, limit = 50): Promise<LeadRecord[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids = await redis.zrange<string[]>(leadsKey(tenant), 0, limit - 1, { rev: true });
  if (!ids.length) return [];
  const rows = await redis.mget<LeadRecord[]>(...ids.map((id) => leadKey(tenant, id)));
  return rows.filter((l): l is LeadRecord => Boolean(l));
}

/** Read one captured lead by its durable id for reconciliation workers. */
export async function getLeadById(tenant: string, id: string): Promise<LeadRecord | null> {
  const redis = getRedis();
  if (!redis || !tenant.trim() || !id.trim()) return null;
  return redis.get<LeadRecord>(leadKey(tenant, id));
}

/** Count of leads in the window + the most recent few, for the Today feed. */
export async function getLeadSummary(tenant: string, sinceDays = 30): Promise<LeadSummary> {
  const leads = await getLeads(tenant, LEAD_KEEP);
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const recent = leads.filter((l) => new Date(l.createdAt).getTime() >= cutoff);
  return { count: recent.length, recent: recent.slice(0, 5) };
}
