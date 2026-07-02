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
 * submission hash so a double-submit doesn't double-count.
 */
import { getRedis } from "./redis";
import { getTenantConfig } from "./tenants";
import { getTenantDashboardUrl } from "./tenant-urls";
import { sendNewLeadEmail } from "./delivery-email";

const LEAD_TTL_SECONDS = 90 * 24 * 60 * 60;
const LEAD_KEEP = 500;

export interface LeadRecord {
  id: string;
  name: string;
  email?: string;
  message?: string;
  /** Where it came from, e.g. "contact-form", "quote". */
  source?: string;
  createdAt: string;
}

export interface LeadSummary {
  count: number;
  recent: LeadRecord[];
}

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
function dedupHash(name: string, email: string, message: string): string {
  const s = `${name}|${email}|${message}`.toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Capture a form submission. Idempotent over a short window; returns null on dedup/no-redis. */
export async function recordLead(
  tenant: string,
  input: { name: string; email?: string; message?: string; source?: string },
): Promise<LeadRecord | null> {
  const redis = getRedis();
  if (!redis) return null;

  // Best-effort double-submit guard (a refresh/double-click), 5-minute window.
  const hash = dedupHash(input.name, input.email ?? "", input.message ?? "");
  const dedupKey = `lead-dedup:${tenant}:${hash}`;
  const fresh = await redis.set(dedupKey, "1", { nx: true, ex: 300 });
  if (!fresh) return null;

  const lead: LeadRecord = {
    id: newLeadId(),
    name: input.name,
    email: input.email,
    message: input.message,
    source: input.source,
    createdAt: new Date().toISOString(),
  };

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
    throw err;
  }

  // Notify the owner a customer reached out — best-effort, only for genuinely
  // new leads (the dedup guard above already returned on a re-submission). A
  // failed email must never fail the capture, so it's isolated and logged.
  await notifyOwnerOfLead(tenant, lead);
  return lead;
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

/** Count of leads in the window + the most recent few, for the Today feed. */
export async function getLeadSummary(tenant: string, sinceDays = 30): Promise<LeadSummary> {
  const leads = await getLeads(tenant, LEAD_KEEP);
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const recent = leads.filter((l) => new Date(l.createdAt).getTime() >= cutoff);
  return { count: recent.length, recent: recent.slice(0, 5) };
}
