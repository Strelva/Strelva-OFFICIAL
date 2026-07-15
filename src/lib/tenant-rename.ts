/**
 * Rename a tenant's subdomain slug (#6 CONTRACT, pragmatic path).
 *
 * The slug is `tenants.id` (the PK) and, via `ON UPDATE CASCADE` on all 35 slug
 * FKs (migration 20260715160000), a single `UPDATE tenants SET id=new` propagates
 * to every child table atomically. This orchestrates that DB rename PLUS the Redis
 * catch-up: the slug is ALSO embedded in Redis keys, and some of those stores are
 * Redis-AUTHORITATIVE (no Postgres to regenerate from) — a missed prefix there is
 * silent data loss, so the registry below is derived directly from
 * docs/persistence-boundaries.md and is the completeness-critical surface.
 *
 * Ordering: DB first (identity source of truth), then Redis best-effort catch-up.
 * A partial Redis failure leaves the DB renamed + some stale Redis keys — recover
 * by re-running `rekeyTenantRedis(old, new)` (idempotent). Caches are NOT rekeyed
 * (they rebuild from Postgres); only `reb:tenants:all` is busted.
 */
import { getRedis } from "./redis";
import { getSupabase } from "./db/client";
import { RESERVED_SUBDOMAINS } from "./tenant-host";
import type { UnifiedEvent } from "./types";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,40})$/;

/**
 * Redis-AUTHORITATIVE stores keyed on the tenant slug (docs/persistence-boundaries.md).
 * Each is a SCAN match pattern; `{t}` is the slug. `events` is handled separately
 * (zset index + id-keyed blobs). CACHES (content/page-config/analytics/google-meta/
 * briefs/domain-map) are intentionally omitted — they regenerate from Postgres.
 */
const authoritativePatterns = (t: string): string[] => [
  `connections:${t}:*`, // OAuth tokens / provider secrets — the critical one
  `crm:${t}`,
  `reb:crm-lock:${t}`,
  `leads:${t}`,
  `lead:${t}:*`,
  `orders:${t}`,
  `order:${t}:*`,
  `reb:reply-voice:${t}`,
  `reb:rewards:${t}:*`,
  `reb:booking:config:${t}`,
  `reb:booking:overrides:${t}`,
  `reb:booking:slot:${t}:*`,
  `reb:content-autonomy:${t}`,
  `reb:engagement:${t}:*`,
  `threads:${t}:*`,
];

export type RenameResult = {
  ok: boolean;
  reason?: string;
  movedKeys: number;
  rewrittenBlobs: number;
  redisErrors: string[];
};

/** Replace the slug where it appears as a whole `:`-delimited segment — anchored,
 *  so a slug of "gld" never rewrites a "gldf" segment. Exported for the anchoring
 *  unit test (the safety-critical bit). */
export function rekeySegments(key: string, oldSlug: string, newSlug: string): string {
  return key
    .split(":")
    .map((seg) => (seg === oldSlug ? newSlug : seg))
    .join(":");
}

/** Rewrite a top-level `tenant`/`tenantId` field equal to oldSlug (a no-op when
 *  absent). Only touches the identity field, never other data. */
function rewriteBlobTenant(value: unknown, oldSlug: string, newSlug: string): { value: unknown; changed: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { value, changed: false };
  const rec = value as Record<string, unknown>;
  let changed = false;
  if (rec.tenantId === oldSlug) { rec.tenantId = newSlug; changed = true; }
  if (rec.tenant === oldSlug) { rec.tenant = newSlug; changed = true; }
  return { value: rec, changed };
}

/**
 * Move every Redis-authoritative key for a tenant from oldSlug to newSlug. Safe to
 * re-run: a source key that no longer exists is simply skipped. Returns counts +
 * any per-key errors (never throws — the DB rename already committed).
 */
export async function rekeyTenantRedis(oldSlug: string, newSlug: string): Promise<Pick<RenameResult, "movedKeys" | "rewrittenBlobs" | "redisErrors">> {
  const redis = getRedis();
  const out = { movedKeys: 0, rewrittenBlobs: 0, redisErrors: [] as string[] };
  if (!redis) return out;

  // 1) Event queue: rename the tenant zset, then rewrite each event blob's tenantId
  //    (getEvent/resolveEventAction compare event.tenantId, so a stale slug there
  //    would make the whole queue read as "wrong_tenant"). Blobs are keyed by id
  //    (they don't move); only their embedded tenantId changes.
  try {
    const members = (await redis.zrange<string[]>(`events:${oldSlug}`, 0, -1, { withScores: true })) ?? [];
    // withScores → [member, score, member, score, ...]
    for (let i = 0; i < members.length; i += 2) {
      const rawId = members[i];
      const score = Number(members[i + 1]);
      const id = typeof rawId === "string" ? rawId : String(rawId);
      await redis.zadd(`events:${newSlug}`, { score, member: id });
      const blob = await redis.get<UnifiedEvent>(`event:${id}`);
      if (blob && blob.tenantId === oldSlug) {
        await redis.set(`event:${id}`, { ...blob, tenantId: newSlug });
        out.rewrittenBlobs++;
      }
    }
    if (members.length) {
      await redis.del(`events:${oldSlug}`);
      out.movedKeys++;
    }
  } catch (err) {
    out.redisErrors.push(`events: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2) Generic authoritative prefixes: SCAN → copy value (rewriting an embedded
  //    tenant field) to the rekeyed key → delete the old key.
  for (const pattern of authoritativePatterns(oldSlug)) {
    try {
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, { match: pattern, count: 250 });
        cursor = next;
        for (const key of keys) {
          const newKey = rekeySegments(key, oldSlug, newSlug);
          if (newKey === key) continue;
          const value = await redis.get(key);
          if (value === null || value === undefined) continue;
          const { value: rewritten, changed } = rewriteBlobTenant(value, oldSlug, newSlug);
          await redis.set(newKey, rewritten);
          await redis.del(key);
          out.movedKeys++;
          if (changed) out.rewrittenBlobs++;
        }
      } while (cursor !== "0");
    } catch (err) {
      out.redisErrors.push(`${pattern}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3) Bust the tenant-list cache so the renamed slug is picked up on next read.
  try { await redis.del("reb:tenants:all"); } catch { /* cache; ignore */ }

  return out;
}

/**
 * Rename a tenant subdomain slug end to end: validate → DB rename (cascades to all
 * child tables) → Redis catch-up. Returns a detailed result; the DB rename is the
 * commit point, Redis is best-effort catch-up (re-runnable via rekeyTenantRedis).
 */
export async function renameTenantSlug(oldSlug: string, newSlug: string): Promise<RenameResult> {
  const base = { movedKeys: 0, rewrittenBlobs: 0, redisErrors: [] as string[] };
  if (oldSlug === newSlug) return { ok: false, reason: "same_slug", ...base };
  if (!SLUG_RE.test(newSlug) || RESERVED_SUBDOMAINS.has(newSlug)) return { ok: false, reason: "invalid_new_slug", ...base };

  const db = getSupabase();
  if (!db) return { ok: false, reason: "no_db", ...base };

  const { data: taken } = await db.from("tenants").select("id").eq("id", newSlug).maybeSingle();
  if (taken) return { ok: false, reason: "new_slug_taken", ...base };
  const { data: exists } = await db.from("tenants").select("id").eq("id", oldSlug).maybeSingle();
  if (!exists) return { ok: false, reason: "tenant_not_found", ...base };

  // DB rename — ON UPDATE CASCADE fans out to all 35 child tables in one statement.
  const { error } = await db.from("tenants").update({ id: newSlug }).eq("id", oldSlug);
  if (error) return { ok: false, reason: `db_rename_failed: ${error.message}`, ...base };

  const redis = await rekeyTenantRedis(oldSlug, newSlug);
  return { ok: true, ...redis };
}
