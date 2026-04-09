/**
 * Server-side proxy client for the GLDF rewards admin endpoint.
 *
 * Phase 10 MVP: instead of migrating Redis members into REB's KV, REB calls
 * a shared-secret endpoint on GLDF to list/fetch members. Single tenant
 * today (GLDF); `tenant` is accepted as a param so the routing layer is
 * ready for a second food-brand tenant without touching callers.
 *
 * Full migration is tracked for Phase 11.
 */

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

export function listRewardsMembers(
  tenant: string
): Promise<RewardsProxyResult<{ members: RewardsMember[] }>> {
  return call(tenant, "/api/admin/rewards/members");
}

export function getRewardsMember(
  tenant: string,
  email: string
): Promise<
  RewardsProxyResult<{ member: RewardsMember; transactions: StarsTransaction[] }>
> {
  return call(
    tenant,
    `/api/admin/rewards/members?email=${encodeURIComponent(email)}`
  );
}
