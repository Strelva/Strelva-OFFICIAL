/**
 * Storefront order capture for the Store dashboard pillar.
 *
 * Client repos own checkout (Stripe); on a completed purchase they fire an
 * `order` beacon to /api/v1/track/[tenant]. This is a VISIBILITY layer — the
 * client's Stripe remains the financial source of truth. Before qualified
 * cutover, Redis retains a 90-day compatibility window. After cutover,
 * Postgres owns complete order visibility and Redis is a rollback mirror.
 *
 * Idempotent on the provider order id so a retried beacon can't double-count.
 */
import { createHash } from "node:crypto";
import { mirrorRecord, readRecords, durableRecordAuthority, writeDurableRecord } from "./client-records";
import { getRedis } from "@/platform/infra/redis";

const ORDER_TTL_SECONDS = 90 * 24 * 60 * 60;
const ORDER_KEEP = 500;

export interface OrderLineItem {
  name: string;
  quantity: number;
}

export interface OrderRecord {
  id: string;
  externalId?: string;
  /** Only site-signature orders enter Store outcome totals and receipts. */
  verification: "site-signature";
  amountCents: number;
  currency: string;
  itemCount: number;
  items: OrderLineItem[];
  createdAt: string;
}

export interface OrderSummary {
  orderCount: number;
  revenueCents: number;
  currency: string;
  topProducts: OrderLineItem[];
}

/** Format cents as a currency string; falls back to a plain "$" on a bad code. */
export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export interface StoreVerdict {
  headline: string;
  detail: string | null;
}

/**
 * Verdict-first read of the store summary — the one honest sentence the owner
 * should see before any metric grid. Empty state never shames ("connected and
 * ready"); a live store leads with earnings + the best seller.
 */
export function buildStoreVerdict(summary: OrderSummary | null): StoreVerdict {
  const count = summary?.orderCount ?? 0;
  if (!summary || count === 0) {
    return {
      headline: "No orders yet",
      detail: "Your storefront is connected and ready. Orders show up here the moment a customer checks out.",
    };
  }
  const revenue = formatMoney(summary.revenueCents, summary.currency);
  const orderWord = count === 1 ? "order" : "orders";
  const headline = `You've earned ${revenue} from ${count} ${orderWord} this month.`;
  const best = summary.topProducts[0];
  const detail = best ? `${best.name} is your best seller: ${best.quantity} sold.` : null;
  return { headline, detail };
}

function ordersKey(tenant: string): string {
  return `orders:${tenant}`;
}
function orderKey(tenant: string, id: string): string {
  return `order:${tenant}:${id}`;
}

function newOrderId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `ord_${crypto.randomUUID()}`;
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Record a site-verified storefront order. Idempotent on externalId (required). */
export async function recordOrder(
  tenant: string,
  input: {
    amountCents: number;
    currency: string;
    items: OrderLineItem[];
    externalId: string;
    verification: "site-signature";
  },
): Promise<OrderRecord | null> {
  const redis = getRedis();
  const durable = await durableRecordAuthority("orders");
  if (!durable && !redis) throw new Error("Order storage is unavailable");

  const dedupKey = `order-ext:${tenant}:${input.externalId}`;
  const fresh = durable ? true : await redis!.set(dedupKey, "1", { nx: true, ex: ORDER_TTL_SECONDS });
  if (!fresh) return null; // already captured this provider order

  const order: OrderRecord = {
    id: durable ? `ord_${createHash("sha256").update(input.externalId).digest("hex")}` : newOrderId(),
    externalId: input.externalId,
    verification: input.verification,
    amountCents: input.amountCents,
    currency: input.currency,
    itemCount: input.items.reduce((sum, it) => sum + it.quantity, 0) || input.items.length,
    items: input.items,
    createdAt: new Date().toISOString(),
  };

  if (durable) {
    // The tenant-scoped deterministic identity and keep_first RPC arbitrate
    // concurrent/restarted beacons without Redis locks or TTLs.
    const status = await writeDurableRecord("orders", tenant, order.id, order, order.createdAt, "keep_first");
    if (status === "kept" || status === "unchanged") return null;
    if (redis) {
      try {
        await redis.set(orderKey(tenant, order.id), order, { ex: ORDER_TTL_SECONDS });
        await redis.zadd(ordersKey(tenant), { score: Date.now(), member: order.id });
        await redis.set(dedupKey, "1", { ex: ORDER_TTL_SECONDS });
      } catch { /* Postgres has committed; Redis remains a rollback mirror. */ }
    }
    return order;
  }
  if (!redis) throw new Error("Order storage is unavailable");

  // If a write fails after the externalId dedup lock is set, release it — else a
  // retry of the same provider order is silently dropped while the record sits
  // orphaned (set but never indexed → invisible to getOrders).
  try {
    await redis.set(orderKey(tenant, order.id), order, { ex: ORDER_TTL_SECONDS });
    await redis.zadd(ordersKey(tenant), { score: Date.now(), member: order.id });
    // Cap the index so it can't grow unbounded (the per-order keys TTL out anyway).
    await redis.zremrangebyrank(ordersKey(tenant), 0, -(ORDER_KEEP + 1));
  } catch (err) {
    await redis.del(dedupKey).catch(() => {});
    throw err;
  }
  await mirrorRecord("orders", tenant, order.id, order, order.createdAt);
  return order;
}

/** Most recent orders, newest first. */
export async function getOrders(tenant: string, limit = 50): Promise<OrderRecord[]> {
  return (await readRecords<OrderRecord>("orders", tenant, () => getRedisOrders(tenant, limit), limit)).filter(order => order.verification === "site-signature");
}

async function getRedisOrders(tenant: string, limit: number): Promise<OrderRecord[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids = await redis.zrange<string[]>(ordersKey(tenant), 0, limit - 1, { rev: true });
  if (!ids.length) return [];
  const rows = await redis.mget<OrderRecord[]>(...ids.map((id) => orderKey(tenant, id)));
  // Old records predate the site-signature boundary. Keep them out of order
  // visibility and every derived outcome total; their source cannot be proven.
  return rows.filter((o): o is OrderRecord => Boolean(o) && o.verification === "site-signature");
}

/** Order count + revenue + top products over the trailing window. */
export async function getOrderSummary(tenant: string, sinceDays = 30): Promise<OrderSummary> {
  const orders = await readRecords<OrderRecord>("orders", tenant, () => getRedisOrders(tenant, ORDER_KEEP));
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const recent = orders.filter((o) => o.verification === "site-signature" && new Date(o.createdAt).getTime() >= cutoff);

  const revenueCents = recent.reduce((sum, o) => sum + o.amountCents, 0);
  const counts = new Map<string, number>();
  for (const o of recent) {
    for (const it of o.items) counts.set(it.name, (counts.get(it.name) ?? 0) + it.quantity);
  }
  const topProducts = [...counts.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  return { orderCount: recent.length, revenueCents, currency: recent[0]?.currency ?? "USD", topProducts };
}
