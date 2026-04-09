/**
 * Server-side proxy client for rewards members.
 *
 * Phase 15a (shadow): if REB's own Upstash KV is configured, read from it
 * directly. Otherwise fall through to the Phase 10 signed-secret call into
 * GLDF. This lets REB stand up the KV-backed path without credentials or
 * data migration — flip env vars, the dashboard silently switches sources.
 *
 * Phase 15b will retire the fall-through once GLDF also reads from REB KV.
 */

import {
  listMembers as kvListMembers,
  getMember as kvGetMember,
  getTransactions as kvGetTransactions,
} from "./rewards/memberRepositoryKv";
import { getKv, KvNotConfiguredError } from "./rewards/kv";

export type Tier = "snapper" | "super-snapper";

export interface Badge {
  slug: string;
  name: string;
  earnedAt: string;
}

export interface RewardsMember {
  email: string;
  starsAvailable: number;
  starsLifetime: number;
  tier: Tier;
  tierOverride: Tier | null;
  displayName: string | null;
  birthday: string | null;
  favoriteFruit: string | null;
  badges: Badge[];
  subscriptionBonusClaimed: boolean;
  createdAt: string;
}

export type TransactionType = "earn" | "redeem" | "admin-credit" | "admin-debit";

export interface StarsTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  reason: string;
  timestamp: string;
}

export type RewardsProxyError =
  | { kind: "unconfigured" }
  | { kind: "unauthorized" }
  | { kind: "not-found" }
  | { kind: "network"; message: string };

export type RewardsProxyResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: RewardsProxyError };

const TENANT_BASE_URLS: Record<string, string | undefined> = {
  gldf: process.env.GLDF_INTERNAL_URL || "https://goodlookingfoods.com",
};

function baseUrlFor(tenant: string): string | null {
  return TENANT_BASE_URLS[tenant] ?? null;
}

function authHeader(): string | null {
  const secret = process.env.REWARDS_PROXY_SECRET;
  return secret ? `Bearer ${secret}` : null;
}

async function call<T>(
  tenant: string,
  path: string
): Promise<RewardsProxyResult<T>> {
  const base = baseUrlFor(tenant);
  if (!base) return { ok: false, error: { kind: "unconfigured" } };

  const auth = authHeader();
  if (!auth) return { ok: false, error: { kind: "unconfigured" } };

  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: auth },
      cache: "no-store",
    });

    if (res.status === 503) return { ok: false, error: { kind: "unconfigured" } };
    if (res.status === 401) return { ok: false, error: { kind: "unauthorized" } };
    if (res.status === 404) return { ok: false, error: { kind: "not-found" } };
    if (!res.ok) {
      return {
        ok: false,
        error: { kind: "network", message: `HTTP ${res.status}` },
      };
    }

    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "network",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/**
 * Try the REB-owned KV path first. Returns null (not a result) when KV is
 * not configured so the caller falls through to the legacy GLDF proxy.
 * Any other error is surfaced as a normal RewardsProxyResult failure.
 */
async function tryDirectKv<T>(
  fn: () => Promise<T>
): Promise<RewardsProxyResult<T> | null> {
  if (!getKv()) return null;
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    if (err instanceof KvNotConfiguredError) return null;
    return {
      ok: false,
      error: {
        kind: "network",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function listRewardsMembers(
  tenant: string
): Promise<RewardsProxyResult<{ members: RewardsMember[] }>> {
  const direct = await tryDirectKv(async () => {
    const members = (await kvListMembers(tenant)) as RewardsMember[];
    return { members };
  });
  if (direct) return direct;

  return call(tenant, "/api/admin/rewards/members");
}

export async function getRewardsMember(
  tenant: string,
  email: string
): Promise<
  RewardsProxyResult<{ member: RewardsMember; transactions: StarsTransaction[] }>
> {
  const direct = await tryDirectKv(async () => {
    const member = (await kvGetMember(tenant, email)) as RewardsMember | null;
    if (!member) throw new Error("not-found");
    const transactions = (await kvGetTransactions(
      tenant,
      email
    )) as StarsTransaction[];
    return { member, transactions };
  });
  if (direct) {
    if (!direct.ok && direct.error.kind === "network" && direct.error.message === "not-found") {
      return { ok: false, error: { kind: "not-found" } };
    }
    return direct;
  }

  return call(
    tenant,
    `/api/admin/rewards/members?email=${encodeURIComponent(email)}`
  );
}
