/**
 * Read the build-payment money trail. The Stripe webhook writes a durable,
 * never-expiring record per completed payment (`reb:build-payment:{sessionId}`)
 * and maintains a `reb:build-payment:index` sorted set (score = createdAt epoch
 * ms, member = sessionId) so listing avoids the blocking O(N) KEYS scan.
 *
 * Migration path: the sorted set self-populates over time as new payments are
 * recorded via `addBuildPaymentToIndex`. Existing records written before the
 * index existed are reached via a KEYS fallback that also backfills the index.
 * Once the index covers all records, the fallback becomes a no-op.
 */

import { getRedis } from "./redis";

export interface BuildPayment {
  sessionId: string;
  paySlug?: string;
  leadSlug?: string;
  tenantId?: string | null;
  amountCents: number;
  currency: string;
  customerEmail?: string;
  createdAt: string;
}

export interface RevenueSummary {
  totalCents: number;
  count: number;
  currency: string;
  recent: BuildPayment[];
}

const BUILD_PAYMENT_PREFIX = "reb:build-payment:";
const BUILD_PAYMENT_INDEX_KEY = "reb:build-payment:index";

/**
 * Add a session id to the sorted-set index. Score is the payment's createdAt
 * timestamp in epoch-ms so `zrange` returns members in chronological order.
 * Call this immediately after writing the `reb:build-payment:{sessionId}` record
 * in the Stripe webhook handler.
 */
export async function addBuildPaymentToIndex(sessionId: string, createdAt: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const score = new Date(createdAt).getTime();
  if (!Number.isFinite(score)) return;
  await redis.zadd(BUILD_PAYMENT_INDEX_KEY, { score, member: sessionId }).catch(() => undefined);
}

export async function listBuildPayments(limit = 200): Promise<BuildPayment[]> {
  const redis = getRedis();
  if (!redis) return [];

  // Prefer the sorted-set index (non-blocking, O(log N + M)).
  const indexSize = await redis.zcard(BUILD_PAYMENT_INDEX_KEY).catch(() => 0);
  if (indexSize > 0) {
    // zrange with REV returns newest-first when the score is epoch-ms.
    const sessionIds = await redis
      .zrange(BUILD_PAYMENT_INDEX_KEY, 0, limit - 1, { rev: true })
      .catch(() => [] as string[]);
    if (!sessionIds.length) return [];
    const keys = sessionIds.map((id) => `${BUILD_PAYMENT_PREFIX}${id}`);
    const records = await redis.mget<(BuildPayment | null)[]>(...keys);
    return records.filter((r): r is BuildPayment => Boolean(r));
  }

  // Fallback: blocking KEYS scan for records written before the index existed.
  // Also backfills the index so future calls avoid this path.
  const keys = await redis.keys(`${BUILD_PAYMENT_PREFIX}*`);
  if (!keys.length) return [];
  const records = await redis.mget<(BuildPayment | null)[]>(...keys);
  const payments = records
    .filter((r): r is BuildPayment => Boolean(r))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, limit);

  // Best-effort backfill — does not block the response.
  void Promise.all(
    payments.map((p) => addBuildPaymentToIndex(p.sessionId, p.createdAt))
  );

  return payments;
}

export async function buildRevenueSummary(): Promise<RevenueSummary> {
  const payments = await listBuildPayments(500);
  const totalCents = payments.reduce((sum, p) => sum + (p.amountCents || 0), 0);
  return {
    totalCents,
    count: payments.length,
    currency: payments[0]?.currency ?? "usd",
    recent: payments.slice(0, 20),
  };
}
