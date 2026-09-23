/**
 * Spam pit — where caught form spam goes instead of anyone's inbox.
 *
 * Every client-site form filter (the v1 leads route, and hand-rolled Studio
 * site functions like CoCard's `api/contact.js`) drops suspected spam here:
 * no email, no notification, but kept for 30 days so a false positive can be
 * found and recovered. Read it with `GET /api/v1/spam-pit/{tenant}` (bearer
 * `SPAM_PIT_KEY`) or `pnpm tsx scripts/spam-pit.ts {tenant}`.
 *
 * Same shape as the leads store: one KV record per item with a TTL, plus a
 * score-ordered index trimmed to the newest SPAM_KEEP.
 */
import { getRedis } from "./redis";

const SPAM_TTL_SECONDS = 30 * 24 * 60 * 60;
const SPAM_KEEP = 1000;

export interface SpamRecord {
  id: string;
  /** Why it was caught, e.g. "honeypot", "turnstile", "canned-message,email-name-mismatch". */
  reason: string;
  /** Where it came from, e.g. "contact-form", "v1-leads". */
  source?: string;
  name?: string;
  email?: string;
  message?: string;
  /** Every other submitted field, bounded. */
  fields?: Record<string, string>;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

export interface RecordSpamInput {
  reason: string;
  source?: string;
  name?: string;
  email?: string;
  message?: string;
  fields?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

function indexKey(tenant: string): string {
  return `reb:spam-pit:${tenant}`;
}
function itemKey(tenant: string, id: string): string {
  return `reb:spam-pit:item:${tenant}:${id}`;
}

function clip(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

function normalizeFields(fields: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!fields) return undefined;
  const entries = Object.entries(fields)
    .filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== "")
    .slice(0, 30)
    .map(([k, v]) => [k.slice(0, 80), v.trim().slice(0, 2000)] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function newSpamId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `spam_${crypto.randomUUID()}`;
  return `spam_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Store one caught submission. Returns null when Redis is not configured. */
export async function recordSpam(tenant: string, input: RecordSpamInput): Promise<SpamRecord | null> {
  const redis = getRedis();
  if (!redis) return null;
  const fields = normalizeFields(input.fields);
  const record: SpamRecord = {
    id: newSpamId(),
    reason: clip(input.reason, 200) ?? "unspecified",
    source: clip(input.source, 80),
    name: clip(input.name, 200),
    email: clip(input.email, 320),
    message: clip(input.message, 5000),
    ...(fields ? { fields } : {}),
    ip: clip(input.ip, 64),
    userAgent: clip(input.userAgent, 300),
    createdAt: new Date().toISOString(),
  };
  await redis.set(itemKey(tenant, record.id), JSON.stringify(record), { ex: SPAM_TTL_SECONDS });
  await redis.zadd(indexKey(tenant), { score: Date.now(), member: record.id });
  await redis.zremrangebyrank(indexKey(tenant), 0, -(SPAM_KEEP + 1));
  return record;
}

/** Newest first. Items past their 30-day TTL drop out of the result. */
export async function getSpam(tenant: string, limit = 100): Promise<SpamRecord[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids = await redis.zrange<string[]>(indexKey(tenant), 0, Math.max(0, limit - 1), { rev: true });
  if (!ids.length) return [];
  const raw = await redis.mget<unknown[]>(...ids.map((id) => itemKey(tenant, id)));
  const out: SpamRecord[] = [];
  for (const r of raw) {
    if (!r) continue;
    try {
      out.push((typeof r === "string" ? JSON.parse(r) : r) as SpamRecord);
    } catch {
      // A corrupt record is skipped, never allowed to break the read.
    }
  }
  return out;
}
