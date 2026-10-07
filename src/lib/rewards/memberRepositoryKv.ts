/**
 * KV-backed rewards member repository (Strelva-owned).
 *
 * Mirrors the Redis hash layout GLDF has today, but tenant-scoped under
 * reb:rewards:{tenant}:*. Every function is async and throws
 * KvNotConfiguredError when Upstash env vars are unset — rewardsProxy.ts
 * catches that and falls through to the legacy GLDF call.
 */

import { mirrorRecord, readRecord, readRecords } from "../client-records";
import { getKv, keys, KvNotConfiguredError } from "./kv";
import { DEFAULT_REWARDS_CONFIG } from "./types";
import type {
  Badge,
  Member,
  RewardsConfig,
  StarsTransaction,
  Tier,
  TransactionType,
} from "./types";

/**
 * Thrown by adjustStars when a debit would drive starsAvailable below zero.
 * The atomic decrement is rolled back before this is raised, so the stored
 * balance is unchanged. Callers should surface this as a 422 (insufficient
 * balance), not a 500.
 */
export class InsufficientStarsError extends Error {
  readonly available: number;
  readonly requested: number;
  constructor(available: number, requested: number) {
    super(
      `insufficient stars: have ${available}, tried to spend ${requested}`
    );
    this.name = "InsufficientStarsError";
    this.available = available;
    this.requested = requested;
  }
}

type MemberHash = Record<string, string>;

function memberToHash(m: Member): MemberHash {
  return {
    email: m.email,
    starsAvailable: String(m.starsAvailable),
    starsLifetime: String(m.starsLifetime),
    tier: m.tier,
    tierOverride: m.tierOverride ?? "",
    displayName: m.displayName ?? "",
    birthday: m.birthday ?? "",
    favoriteFruit: m.favoriteFruit ?? "",
    badges: JSON.stringify(m.badges),
    subscriptionBonusClaimed: String(m.subscriptionBonusClaimed),
    createdAt: m.createdAt,
  };
}

function coerceString(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function hashToMember(h: Record<string, unknown>): Member | null {
  const email = coerceString(h.email);
  if (!email) return null;

  let badges: Badge[] = [];
  const rawBadges = h.badges;
  if (typeof rawBadges === "string" && rawBadges) {
    try {
      badges = JSON.parse(rawBadges) as Badge[];
    } catch {
      badges = [];
    }
  } else if (Array.isArray(rawBadges)) {
    badges = rawBadges as Badge[];
  }

  const tierOverrideRaw = coerceString(h.tierOverride);

  return {
    email,
    starsAvailable: parseInt(coerceString(h.starsAvailable), 10) || 0,
    starsLifetime: parseInt(coerceString(h.starsLifetime), 10) || 0,
    tier: (coerceString(h.tier) as Member["tier"]) || "snapper",
    tierOverride: tierOverrideRaw
      ? (tierOverrideRaw as Member["tier"])
      : null,
    displayName: coerceString(h.displayName) || null,
    birthday: coerceString(h.birthday) || null,
    favoriteFruit: coerceString(h.favoriteFruit) || null,
    badges,
    subscriptionBonusClaimed: coerceString(h.subscriptionBonusClaimed) === "true",
    createdAt: coerceString(h.createdAt) || new Date().toISOString(),
  };
}

function assertKv() {
  const kv = getKv();
  if (!kv) throw new KvNotConfiguredError();
  return kv;
}

export async function saveMember(tenant: string, member: Member): Promise<void> {
  const kv = assertKv();
  const email = member.email.trim().toLowerCase();
  const normalized: Member = { ...member, email };
  await kv.hset(keys.member(tenant, email), memberToHash(normalized));
  await kv.sadd(keys.membersSet(tenant), email);
  await mirrorRecord("reward_members", tenant, email, memberToHash(normalized));
}

export async function getMember(
  tenant: string,
  email: string
): Promise<Member | null> {
  const data = await readRecord<Record<string, unknown>>("reward_members", tenant, email.trim().toLowerCase(), () => assertKv().hgetall<Record<string, unknown>>(keys.member(tenant, email)));
  if (!data) return null;
  return hashToMember(data);
}

/**
 * Resolve a member's effective tier. A manual tierOverride always wins;
 * otherwise the tier is derived from lifetime stars against the configured
 * super threshold. Pure — callers pass the post-mutation lifetime value.
 */
export function resolveTier(
  starsLifetime: number,
  tierOverride: Tier | null,
  config: RewardsConfig = DEFAULT_REWARDS_CONFIG
): Tier {
  if (tierOverride) return tierOverride;
  return starsLifetime >= config.tierThresholdSuper ? "super-snapper" : "snapper";
}

/**
 * Atomically adjust a member's stars and return the refreshed member.
 *
 * This replaces the prior read-modify-write (getMember -> mutate -> saveMember),
 * which lost concurrent updates and could oversell a balance under races. Stars
 * are mutated with HINCRBY so concurrent earn/redeem are serialized by Redis:
 *
 *   - delta > 0 (earn / admin-credit): HINCRBY starsAvailable +delta and
 *     HINCRBY starsLifetime +delta.
 *   - delta < 0 (redeem / admin-debit): HINCRBY starsAvailable +delta first; if
 *     the returned balance is negative the decrement is rolled back (HINCRBY
 *     +amount) and InsufficientStarsError is thrown. starsLifetime is never
 *     reduced.
 *
 * Tier is recomputed from the authoritative post-mutation lifetime value (with
 * tierOverride honored) and persisted. Returns null if the member does not
 * exist. Does NOT log the transaction — the caller owns logTransaction so the
 * existing audit/reason wiring is preserved.
 */
export async function adjustStars(
  tenant: string,
  email: string,
  delta: number,
  config: RewardsConfig = DEFAULT_REWARDS_CONFIG
): Promise<Member | null> {
  if (!Number.isInteger(delta)) throw new Error("delta must be an integer");
  const kv = assertKv();
  const normalizedEmail = email.trim().toLowerCase();
  const memberKey = keys.member(tenant, normalizedEmail);

  // Load the existing member up front so we can (a) 404 on missing members and
  // (b) carry forward non-stars fields (tierOverride, badges, etc.) into the
  // returned object. The HINCRBY results below are the source of truth for the
  // stars fields, so a stale read here cannot corrupt balances.
  const existing = await getMember(tenant, normalizedEmail);
  if (!existing) return null;

  let starsAvailable: number;
  if (delta >= 0) {
    starsAvailable = await kv.hincrby(memberKey, "starsAvailable", delta);
  } else {
    const spend = -delta;
    const after = await kv.hincrby(memberKey, "starsAvailable", delta);
    if (after < 0) {
      // Roll back the overspend, then reject. The rollback restores the exact
      // amount we removed, regardless of other concurrent ops in flight.
      await kv.hincrby(memberKey, "starsAvailable", spend);
      throw new InsufficientStarsError(after + spend, spend);
    }
    starsAvailable = after;
  }

  // starsLifetime only grows, and only on credits.
  const starsLifetime =
    delta > 0
      ? await kv.hincrby(memberKey, "starsLifetime", delta)
      : existing.starsLifetime;

  // Recompute tier from the authoritative lifetime value and persist if it
  // changed, so reads stay consistent without rewriting the whole hash.
  const tier = resolveTier(starsLifetime, existing.tierOverride, config);
  if (tier !== existing.tier) {
    await kv.hset(memberKey, { tier });
  }

  const updated = { ...existing, starsAvailable, starsLifetime, tier };
  // Snapshot the hash after all atomic increments, never overwrite Postgres
  // with an older balance assembled from this request's pre-mutation read.
  if (process.env.STRELVA_CLIENT_RECORDS_DUAL_WRITE === "1" && process.env.DUAL_WRITE_PG !== "0") {
    try {
      const latest = await kv.hgetall<Record<string, unknown>>(memberKey);
      if (latest) {
        const payload = Object.fromEntries(Object.entries(latest).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
        await mirrorRecord("reward_members", tenant, normalizedEmail, payload);
      }
    } catch {
      // The increments already succeeded. A snapshot outage cannot turn them
      // into a retryable balance mutation; parity/backfill repair the copy.
      console.error("[rewards] accepted balance update needs client-record repair", { tenant });
    }
  }
  return updated;
}

export async function listMembers(tenant: string): Promise<Member[]> {
  return (await readRecords<Record<string, unknown>>("reward_members", tenant, () => listRedisMembers(tenant))).map(hashToMember).filter((m): m is Member => m !== null);
}
async function listRedisMembers(tenant: string): Promise<Record<string, unknown>[]> {
  const kv = assertKv();
  const emails = await kv.smembers(keys.membersSet(tenant));
  if (!emails || emails.length === 0) return [];

  const results = await Promise.all(
    emails.map((email) =>
      kv.hgetall<Record<string, unknown>>(keys.member(tenant, String(email)))
    )
  );

  const out: Record<string, unknown>[] = [];
  for (const data of results) {
    if (!data) continue;
    if (hashToMember(data)) out.push(data);
  }
  return out;
}

export async function logTransaction(
  tenant: string,
  email: string,
  type: TransactionType,
  amount: number,
  reason: string
): Promise<StarsTransaction> {
  const kv = assertKv();
  const txn: StarsTransaction = {
    id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    amount,
    reason,
    timestamp: new Date().toISOString(),
  };
  await kv.lpush(keys.txns(tenant, email), JSON.stringify(txn));
  const normalizedEmail = email.trim().toLowerCase();
  await mirrorRecord("reward_transactions", tenant, txn.id, { ...txn, email: normalizedEmail }, txn.timestamp);
  return txn;
}

export async function getTransactions(
  tenant: string,
  email: string,
  limit = 50
): Promise<StarsTransaction[]> {
  const rows = await readRecords<StarsTransaction & { email?: string }>("reward_transactions", tenant, () => getRedisTransactions(tenant, email, limit));
  return rows.filter((t) => t.email === undefined || t.email === email.trim().toLowerCase()).slice(0, limit).map((row) => ({ id: row.id, type: row.type, amount: row.amount, reason: row.reason, timestamp: row.timestamp }));
}
async function getRedisTransactions(tenant: string, email: string, limit: number): Promise<StarsTransaction[]> {
  const kv = assertKv();
  const raw = await kv.lrange(keys.txns(tenant, email), 0, limit - 1);
  if (!raw) return [];
  return raw.map((r) => {
    if (typeof r === "string") return JSON.parse(r) as StarsTransaction;
    // Upstash client sometimes auto-parses JSON strings
    return r as unknown as StarsTransaction;
  });
}

export { KvNotConfiguredError };
