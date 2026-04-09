/**
 * KV-backed rewards member repository (REB-owned).
 *
 * Mirrors the Redis hash layout GLDF has today, but tenant-scoped under
 * reb:rewards:{tenant}:*. Every function is async and throws
 * KvNotConfiguredError when Upstash env vars are unset — rewardsProxy.ts
 * catches that and falls through to the legacy GLDF call.
 */

import { getKv, keys, KvNotConfiguredError } from "./kv";
import type {
  Badge,
  Member,
  StarsTransaction,
  TransactionType,
} from "./types";

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
}

export async function getMember(
  tenant: string,
  email: string
): Promise<Member | null> {
  const kv = assertKv();
  const data = await kv.hgetall<Record<string, unknown>>(keys.member(tenant, email));
  if (!data) return null;
  return hashToMember(data);
}

export async function listMembers(tenant: string): Promise<Member[]> {
  const kv = assertKv();
  const emails = await kv.smembers(keys.membersSet(tenant));
  if (!emails || emails.length === 0) return [];

  const out: Member[] = [];
  for (const email of emails) {
    const data = await kv.hgetall<Record<string, unknown>>(
      keys.member(tenant, String(email))
    );
    if (!data) continue;
    const m = hashToMember(data);
    if (m) out.push(m);
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
  return txn;
}

export async function getTransactions(
  tenant: string,
  email: string,
  limit = 50
): Promise<StarsTransaction[]> {
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
