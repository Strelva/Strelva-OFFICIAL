/**
 * Rename a tenant's subdomain slug (#6 CONTRACT, pragmatic path).
 *
 * The slug is `tenants.id` (the PK) and, via `ON UPDATE CASCADE` on all 35 slug
 * FKs (migration 20260715160000), a single `UPDATE tenants SET id=new` propagates
 * to every child table atomically. This orchestrates that DB rename PLUS the Redis
 * catch-up: the slug is ALSO embedded in Redis keys, and some of those stores are
 * Redis-AUTHORITATIVE (no Postgres to regenerate from) — a missed prefix there is
 * silent data loss, so the registry below is derived directly from
 * docs/architecture/persistence-boundaries.md and is the completeness-critical surface.
 *
 * Ordering: DB first (identity source of truth), then Redis best-effort catch-up.
 * A partial Redis failure leaves the DB renamed + some stale Redis keys — recover
 * by re-running `rekeyTenantRedis(old, new)` (idempotent). Caches are NOT rekeyed
 * (they rebuild from Postgres); only `reb:tenants:all` is busted.
 */
import { getRedis } from "@/platform/infra/redis";
import { getSupabase } from "@/platform/infra/db/client";
import { RESERVED_SUBDOMAINS } from "./tenant-host";
import type { UnifiedEvent } from "./types";
import { LEAD_MIRROR_PENDING_KEY, LEAD_MIRROR_LAST_FAILURE_KEY } from "./lead-mirror";

/** Move a pending lead and its queue identity in one transaction. A worker
 * that already read the old member can only remove that old member; the new
 * member always points at a readable lead. RENAME keeps the lead's TTL. */
export const REKEY_LEAD_MIRROR_LUA = `
local rows = redis.call('ZRANGE', KEYS[1], 0, -1, 'WITHSCORES')
local moved = 0
local prefix = ARGV[1] .. ':'
for i = 1, #rows, 2 do
  local member = rows[i]
  if string.sub(member, 1, #prefix) == prefix then
    local id = string.sub(member, #prefix + 1)
    local oldKey = 'lead:' .. ARGV[1] .. ':' .. id
    local newKey = 'lead:' .. ARGV[2] .. ':' .. id
    if redis.call('EXISTS', oldKey) == 1 then redis.call('RENAME', oldKey, newKey) end
    if redis.call('EXISTS', newKey) == 1 then
      local nextMember = ARGV[2] .. ':' .. id
      local nextScore = redis.call('ZSCORE', KEYS[1], nextMember)
      if not nextScore or tonumber(rows[i+1]) < tonumber(nextScore) then
        redis.call('ZADD', KEYS[1], rows[i+1], nextMember)
      end
      redis.call('ZREM', KEYS[1], member)
      moved = moved + 1
    end
  end
end
local rewritten = 0
local diagnostic = redis.call('GET', KEYS[2])
if diagnostic then
  local ok, value = pcall(cjson.decode, diagnostic)
  if ok and type(value) == 'table' and value.tenant == ARGV[1] then
    value.tenant = ARGV[2]
    redis.call('SET', KEYS[2], cjson.encode(value))
    rewritten = 1
  end
end
return {moved, rewritten}
`;

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,40})$/;

/**
 * Redis-AUTHORITATIVE stores keyed on the tenant slug (docs/architecture/persistence-boundaries.md).
 * Each is a SCAN match pattern; `{t}` is the slug. `events` is handled separately
 * (zset index + id-keyed blobs). CACHES (content/page-config/analytics/google-meta/
 * briefs/domain-map) are intentionally omitted — they regenerate from Postgres.
 */
// Exported for the completeness unit test — a Redis-authoritative store missing
// from this registry silently does NOT move on a tenant rename (audit #16/#25).
export const authoritativePatterns = (t: string): string[] => [
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
  // Operator/owner-set state with NO Postgres source to regenerate from — these
  // were silently stranded under the old slug on a rename (audit #16):
  `goal:${t}`, // owner's weekly goal
  `analytics:cfg:${t}`, // GA4/GSC property config (ga4PropertyId has no PG recovery)
  `reb:report-cadence:${t}`, // operator cadence override
  `reb:report-sent:${t}`, // last-report throttle
  `reb:scan:baseline:${t}`, // set-once day-0 health anchor for the 90-day milestone
  // GBP / review keys that are Redis-only (no Postgres recovery path) — audit #15:
  `google-meta:${t}`, // GBP accountId+locationId from OAuth callback (1-yr TTL); sole source for all GBP writes
  `review-replies:recent:${t}`, // near-duplicate detection ring buffer for drafted replies
  `reb:review-nudge-sent:${t}`, // per-tenant nudge-once dedup marker
  `reb:review-alert-sent:${t}:*`, // per-review new-review alert dedup markers
  `reb:order-review-request-sent:${t}:*`, // per-order review-request dedup markers
  `reb:review-reply-declined:${t}:*`, // 180-day per-review decline veto (prevents re-draft after owner dismissal)
  `reb:inquiry-delivery:${t}:*`, // inquiry delivery checkpoint and accepted-write marker
  `reb:inquiry-delivery-claim:${t}:*`, // in-flight delivery claim
  `reb:inquiry-delivery-provider:${t}:*`, // accepted provider id -> inquiry lookup
  `reb:inquiry-delivery-event:${t}:*`, // signed provider-event deduplication
  `reb:inquiry-timeline:${t}:*`, // inquiry delivery evidence timeline
  `reb:inquiry-budget:${t}:*`, // tenant responsibility daily budget reservation
  `reb:inquiry-reply:${t}:*`, // tenant-scoped reply address -> inquiry lookup
  `reb:inquiry-reply-state:${t}:*`, // verified inbound reply state
  `reb:inquiry-capture-repair:${t}`, // durable capture-repair due index
  `reb:inquiry-capture-repair-job:${t}:*`, // capture-repair payloads
  `reb:inquiry-capture-repair-claim:${t}:*`, // capture-repair leases
  // Submissions held as spam, including false positives (30-day TTL):
  `reb:spam-pit:${t}`, // sorted index
  `reb:spam-pit:item:${t}:*`, // one JSON record per held submission
  `reb:client-email:${t}`, // operator's per-client email override
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

/** Moves a non-string key in one atomic step. Returns the key's type, `none`
 *  when the source is gone, or `string` (moved by the caller, which rewrites the
 *  embedded tenant field). A free destination takes RENAME, which keeps the
 *  TTL. An occupied destination (written under the new slug after the database
 *  rename) keeps its own data and TTL: sorted-set members keep the higher
 *  score, hash fields and set members already there win, and list items from
 *  the old key are appended. Exported for the real-Redis test. */
export const MOVE_TENANT_KEY_LUA = `
local kind = redis.call('TYPE', KEYS[1])['ok']
if kind == 'none' or kind == 'string' then return kind end
if redis.call('EXISTS', KEYS[2]) == 0 then
  redis.call('RENAME', KEYS[1], KEYS[2])
  return kind
end
if kind == 'zset' then
  local rows = redis.call('ZRANGE', KEYS[1], 0, -1, 'WITHSCORES')
  for i = 1, #rows, 2 do
    local current = redis.call('ZSCORE', KEYS[2], rows[i])
    if not current or tonumber(current) < tonumber(rows[i + 1]) then
      redis.call('ZADD', KEYS[2], rows[i + 1], rows[i])
    end
  end
elseif kind == 'hash' then
  local rows = redis.call('HGETALL', KEYS[1])
  for i = 1, #rows, 2 do redis.call('HSETNX', KEYS[2], rows[i], rows[i + 1]) end
elseif kind == 'set' then
  local rows = redis.call('SMEMBERS', KEYS[1])
  for i = 1, #rows do redis.call('SADD', KEYS[2], rows[i]) end
elseif kind == 'list' then
  local rows = redis.call('LRANGE', KEYS[1], 0, -1)
  for i = 1, #rows do redis.call('RPUSH', KEYS[2], rows[i]) end
else
  return redis.error_reply('tenant_rename_unsupported_type:' .. kind)
end
redis.call('DEL', KEYS[1])
return 'merged:' .. kind
`;

type RenameRedis = NonNullable<ReturnType<typeof getRedis>>;

async function moveTenantKey(
  redis: RenameRedis,
  key: string,
  newKey: string,
  oldSlug: string,
  newSlug: string,
): Promise<{ moved: boolean; rewritten: boolean }> {
  const kind = String(await redis.eval<[], string>(MOVE_TENANT_KEY_LUA, [key, newKey], []));
  if (kind === "none") return { moved: false, rewritten: false };
  if (kind !== "string") return { moved: true, rewritten: false };
  const value = await redis.get(key);
  if (value === null || value === undefined) return { moved: false, rewritten: false };
  const ttl = Number(await redis.pttl(key));
  const { value: rewritten, changed } = rewriteBlobTenant(value, oldSlug, newSlug);
  if (ttl > 0) await redis.set(newKey, rewritten, { px: ttl });
  else await redis.set(newKey, rewritten);
  await redis.del(key);
  return { moved: true, rewritten: changed };
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

  // Global lead-mirror members embed the slug in their value, rather than
  // their key. Move them before the generic lead-key pass, atomically with
  // their payloads, so interrupted renames remain safe for the repair worker.
  try {
    const [moved, rewritten] = await redis.eval<[string, string], [number, number]>(REKEY_LEAD_MIRROR_LUA,
      [LEAD_MIRROR_PENDING_KEY, LEAD_MIRROR_LAST_FAILURE_KEY], [oldSlug, newSlug]);
    out.movedKeys += Number(moved);
    out.rewrittenBlobs += Number(rewritten);
  } catch (err) {
    out.redisErrors.push(`lead-mirror: ${err instanceof Error ? err.message : String(err)}`);
    // Do not move lead payloads without their queue identities. Recovery can
    // rerun the same rename; every other authoritative family still proceeds.
  }

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

  // Capture repair due work is a sorted-set index, not a JSON string. Move its
  // members explicitly before the generic string-key pass below.
  try {
    const oldRepairIndex = `reb:inquiry-capture-repair:${oldSlug}`;
    const newRepairIndex = `reb:inquiry-capture-repair:${newSlug}`;
    const members = (await redis.zrange<string[]>(oldRepairIndex, 0, -1, { withScores: true })) ?? [];
    for (let i = 0; i < members.length; i += 2) {
      const member = typeof members[i] === "string" ? members[i] : String(members[i]);
      const score = Number(members[i + 1]);
      if (member && Number.isFinite(score)) await redis.zadd(newRepairIndex, { score, member });
    }
    if (members.length) {
      await redis.del(oldRepairIndex);
      out.movedKeys++;
    }
  } catch (err) {
    out.redisErrors.push(`reb:inquiry-capture-repair:*: ${err instanceof Error ? err.message : String(err)}`);
  }

  // The inbound reply reverse index is intentionally keyed by the opaque
  // tracking address so a signed provider event can resolve a tenant without
  // trusting provider supplied tags. Its value is tenant scoped, so rename
  // the embedded identity in place while leaving the address key stable.
  try {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, { match: "reb:inquiry-reply-target:*", count: 250 });
      cursor = next;
      for (const key of keys) {
        const value = await redis.get(key);
        const { value: rewritten, changed } = rewriteBlobTenant(value, oldSlug, newSlug);
        if (!changed) continue;
        await redis.set(key, rewritten);
        out.rewrittenBlobs++;
      }
    } while (cursor !== "0");
  } catch (err) {
    out.redisErrors.push(`reb:inquiry-reply-target:*: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2) Generic authoritative prefixes: SCAN, then move each key by its Redis
  //    type. Strings are JSON blobs whose embedded tenant field is rewritten and
  //    whose TTL is kept. Sorted sets, hashes, sets and lists (leads and orders
  //    indexes, rewards, the spam index) move atomically in Lua: RENAME when the
  //    new key is free (keeps the TTL), otherwise a merge that never overwrites
  //    newer data already under the new slug. `get` on those types is a
  //    WRONGTYPE error, which used to abort the rest of the pattern.
  for (const pattern of authoritativePatterns(oldSlug)) {
    // A failed atomic queue migration must retain its source lead records.
    if (pattern === `lead:${oldSlug}:*` && out.redisErrors.some(error => error.startsWith("lead-mirror:"))) continue;
    let cursor = "0";
    do {
      let keys: string[] = [];
      try {
        const [next, found] = await redis.scan(cursor, { match: pattern, count: 250 });
        cursor = String(next);
        keys = found;
      } catch (err) {
        out.redisErrors.push(`${pattern}: ${err instanceof Error ? err.message : String(err)}`);
        break;
      }
      for (const key of keys) {
        const newKey = rekeySegments(key, oldSlug, newSlug);
        if (newKey === key) continue;
        try {
          const moved = await moveTenantKey(redis, key, newKey, oldSlug, newSlug);
          if (moved.moved) out.movedKeys++;
          if (moved.rewritten) out.rewrittenBlobs++;
        } catch (err) {
          // One bad key is recorded; the rest of the pattern still moves.
          out.redisErrors.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } while (cursor !== "0");
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
