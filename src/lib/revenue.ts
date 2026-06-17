/**
 * Read the build-payment money trail. The Stripe webhook writes a durable,
 * never-expiring record per completed payment (`reb:build-payment:{sessionId}`)
 * but nothing reads it back. This summarizes collected one-time build/managed
 * payments for Mission Control and the operator agent.
 *
 * Note: scans `reb:build-payment:*` (no index set is maintained on write). Fine
 * at current volume; if payments grow large, add an index set on write.
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

export async function listBuildPayments(limit = 200): Promise<BuildPayment[]> {
  const redis = getRedis();
  if (!redis) return [];
  const keys = await redis.keys("reb:build-payment:*");
  if (!keys.length) return [];
  const records = await redis.mget<(BuildPayment | null)[]>(...keys);
  return records
    .filter((r): r is BuildPayment => Boolean(r))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, limit);
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
