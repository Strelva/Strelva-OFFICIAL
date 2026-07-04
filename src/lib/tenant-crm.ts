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

export interface TenantCrm {
  tenantId: string;
  tags: string[];
  stage: CrmStage | null;
  notes: CrmNote[];
  updatedAt: string | null;
}

const MAX_TAGS = 20;
const MAX_TAG_LEN = 40;
const MAX_NOTES = 200;
const MAX_NOTE_LEN = 2000;

function key(tenantId: string): string {
  return `crm:${tenantId}`;
}

function defaultCrm(tenantId: string): TenantCrm {
  return { tenantId, tags: [], stage: null, notes: [], updatedAt: null };
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
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : null,
  };
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

export async function setTenantTags(tenantId: string, tags: string[]): Promise<TenantCrm> {
  const current = await getTenantCrm(tenantId);
  return persist({ ...current, tags: sanitizeTags(tags), updatedAt: new Date().toISOString() });
}

export async function setTenantStage(tenantId: string, stage: CrmStage): Promise<TenantCrm> {
  const current = await getTenantCrm(tenantId);
  return persist({ ...current, stage, updatedAt: new Date().toISOString() });
}

export async function addTenantNote(
  tenantId: string,
  text: string,
  author: string,
): Promise<TenantCrm> {
  const current = await getTenantCrm(tenantId);
  const note: CrmNote = {
    id: crypto.randomUUID(),
    text: text.trim().slice(0, MAX_NOTE_LEN),
    author: author || "operator",
    createdAt: new Date().toISOString(),
  };
  const notes = [note, ...current.notes].slice(0, MAX_NOTES);
  return persist({ ...current, notes, updatedAt: new Date().toISOString() });
}
