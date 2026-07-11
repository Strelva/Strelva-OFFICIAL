/**
 * Lightweight operator CRM per tenant — tags, pipeline stage, and a notes log.
 * Redis-backed (Upstash), one JSON blob per tenant at `crm:{tenantId}`, matching
 * how the other operational stores (leads, pay-links) persist. No DB migration:
 * this is internal operator metadata for a handful of clients, not tenant config.
 * Read-modify-write is fine at this scale; everything degrades to a default
 * record when Redis is unconfigured (writes become a no-op that still returns the
 * computed state).
 */
import { getRedis } from "@/lib/redis";

export type CrmStage = "lead" | "building" | "live" | "at_risk" | "churned";

export interface CrmNote {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

export interface CrmContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
}

export type CrmActivityKind = "call" | "email" | "meeting" | "note";

export interface CrmActivity {
  id: string;
  kind: CrmActivityKind;
  summary: string;
  author: string;
  at: string;
}

export interface TenantCrm {
  tenantId: string;
  tags: string[];
  stage: CrmStage | null;
  notes: CrmNote[];
  contacts: CrmContact[];
  activity: CrmActivity[];
  updatedAt: string | null;
}

const MAX_TAGS = 20;
const MAX_TAG_LEN = 40;
const MAX_NOTES = 200;
const MAX_NOTE_LEN = 2000;
const MAX_CONTACTS = 20;
const MAX_CONTACT_FIELD_LEN = 120;
const MAX_ACTIVITY = 200;
const MAX_ACTIVITY_LEN = 500;
const ACTIVITY_KINDS: CrmActivityKind[] = ["call", "email", "meeting", "note"];

function key(tenantId: string): string {
  return `crm:${tenantId}`;
}

function defaultCrm(tenantId: string): TenantCrm {
  return { tenantId, tags: [], stage: null, notes: [], contacts: [], activity: [], updatedAt: null };
}

function isContact(v: unknown): v is CrmContact {
  return typeof v === "object" && v !== null && typeof (v as CrmContact).id === "string";
}

function isActivity(v: unknown): v is CrmActivity {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as CrmActivity).id === "string" &&
    ACTIVITY_KINDS.includes((v as CrmActivity).kind)
  );
}

/** Normalize a raw stored value (object or JSON string) into a full TenantCrm. */
function normalize(tenantId: string, raw: unknown): TenantCrm {
  if (!raw) return defaultCrm(tenantId);
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return defaultCrm(tenantId);
    }
  }
  const r = obj as Partial<TenantCrm>;
  return {
    tenantId,
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
    stage: (r.stage as CrmStage | null) ?? null,
    notes: Array.isArray(r.notes) ? (r.notes as CrmNote[]) : [],
    contacts: Array.isArray(r.contacts) ? r.contacts.filter(isContact) : [],
    activity: Array.isArray(r.activity) ? r.activity.filter(isActivity) : [],
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : null,
  };
}

/** Trim a field to a bounded length; returns undefined when empty after trim. */
function cleanField(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, MAX_CONTACT_FIELD_LEN);
  return t || undefined;
}

function sanitizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().slice(0, MAX_TAG_LEN);
    if (!t) continue;
    const lower = t.toLowerCase();
    if (seen.has(lower)) continue; // case-insensitive dedupe, keep first spelling
    seen.add(lower);
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

export async function getTenantCrm(tenantId: string): Promise<TenantCrm> {
  const redis = getRedis();
  if (!redis) return defaultCrm(tenantId);
  const raw = await redis.get(key(tenantId));
  return normalize(tenantId, raw);
}

export async function getAllTenantCrm(tenantIds: string[]): Promise<Record<string, TenantCrm>> {
  const out: Record<string, TenantCrm> = {};
  const redis = getRedis();
  if (!redis || tenantIds.length === 0) {
    for (const id of tenantIds) out[id] = defaultCrm(id);
    return out;
  }
  const raws = await redis.mget<unknown[]>(...tenantIds.map(key));
  tenantIds.forEach((id, i) => {
    out[id] = normalize(id, raws?.[i]);
  });
  return out;
}

async function persist(crm: TenantCrm): Promise<TenantCrm> {
  const redis = getRedis();
  if (redis) await redis.set(key(crm.tenantId), crm);
  return crm;
}

const LOCK_TTL_SECONDS = 5;
const LOCK_MAX_ATTEMPTS = 5;
const LOCK_RETRY_MS = 40;

/**
 * Run a read-modify-write under a short per-tenant Redis lock so a cron
 * auto-log (`addTenantActivity`) racing an operator's stage/note edit can't
 * last-write-wins one of them away. Mirrors the owner-lock idiom in
 * `auth.ts` / `booking-store.ts`: `set(lockKey, nx, ex)` then `del` in `finally`.
 *
 * The lock only NARROWS the race — a miss must never drop the write or throw. So
 * when Redis is unconfigured (dev) we run directly, and when the lock can't be
 * acquired after a brief bounded retry we proceed anyway (degrading to the prior
 * bare read-modify-write). Only a lock we actually acquired is released.
 */
async function withCrmLock<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  if (!redis) return fn();

  const lockKey = `reb:crm-lock:${tenantId}`;
  let acquired = false;
  for (let attempt = 0; attempt < LOCK_MAX_ATTEMPTS; attempt++) {
    const got: unknown = await redis
      .set(lockKey, "1", { nx: true, ex: LOCK_TTL_SECONDS })
      .catch(() => null);
    if (got !== null && got !== undefined && got !== false) {
      acquired = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
  }

  try {
    return await fn();
  } finally {
    if (acquired) await redis.del(lockKey).catch(() => {});
  }
}

export async function setTenantTags(tenantId: string, tags: string[]): Promise<TenantCrm> {
  return withCrmLock(tenantId, async () => {
    const current = await getTenantCrm(tenantId);
    return persist({ ...current, tags: sanitizeTags(tags), updatedAt: new Date().toISOString() });
  });
}

export async function setTenantStage(tenantId: string, stage: CrmStage): Promise<TenantCrm> {
  return withCrmLock(tenantId, async () => {
    const current = await getTenantCrm(tenantId);
    return persist({ ...current, stage, updatedAt: new Date().toISOString() });
  });
}

export async function addTenantNote(
  tenantId: string,
  text: string,
  author: string,
): Promise<TenantCrm> {
  return withCrmLock(tenantId, async () => {
    const current = await getTenantCrm(tenantId);
    const note: CrmNote = {
      id: crypto.randomUUID(),
      text: text.trim().slice(0, MAX_NOTE_LEN),
      author: author || "operator",
      createdAt: new Date().toISOString(),
    };
    const notes = [note, ...current.notes].slice(0, MAX_NOTES);
    return persist({ ...current, notes, updatedAt: new Date().toISOString() });
  });
}

export async function addTenantContact(
  tenantId: string,
  contact: Omit<CrmContact, "id">,
): Promise<TenantCrm> {
  return withCrmLock(tenantId, async () => {
    const current = await getTenantCrm(tenantId);
    const entry: CrmContact = {
      id: crypto.randomUUID(),
      name: cleanField(contact.name) ?? "Unnamed",
      email: cleanField(contact.email),
      phone: cleanField(contact.phone),
      role: cleanField(contact.role),
    };
    const contacts = [...current.contacts, entry].slice(0, MAX_CONTACTS);
    return persist({ ...current, contacts, updatedAt: new Date().toISOString() });
  });
}

export async function removeTenantContact(
  tenantId: string,
  contactId: string,
): Promise<TenantCrm> {
  return withCrmLock(tenantId, async () => {
    const current = await getTenantCrm(tenantId);
    const contacts = current.contacts.filter((c) => c.id !== contactId);
    return persist({ ...current, contacts, updatedAt: new Date().toISOString() });
  });
}

export async function addTenantActivity(
  tenantId: string,
  entry: { kind: CrmActivityKind; summary: string; author: string },
): Promise<TenantCrm> {
  return withCrmLock(tenantId, async () => {
    const current = await getTenantCrm(tenantId);
    const item: CrmActivity = {
      id: crypto.randomUUID(),
      kind: ACTIVITY_KINDS.includes(entry.kind) ? entry.kind : "note",
      summary: entry.summary.trim().slice(0, MAX_ACTIVITY_LEN),
      author: entry.author || "operator",
      at: new Date().toISOString(),
    };
    const activity = [item, ...current.activity].slice(0, MAX_ACTIVITY);
    return persist({ ...current, activity, updatedAt: new Date().toISOString() });
  });
}
