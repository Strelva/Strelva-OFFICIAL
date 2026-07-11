/**
 * Storefront order capture for the Store dashboard pillar.
 *
 * Client repos own checkout (Stripe); on a completed purchase they fire an
 * `order` beacon to /api/v1/track/[tenant]. This is a VISIBILITY layer — the
 * client's Stripe remains the financial source of truth — so a Redis-backed
 * 90-day window is the right durability: it answers "how's my store doing this
 * week/month" without trying to be the accounting system.
 *
 * Idempotent on the provider order id so a retried beacon can't double-count.
 */
import { getRedis } from "./redis";

const ORDER_TTL_SECONDS = 90 * 24 * 60 * 60;
const ORDER_KEEP = 500;

export interface OrderLineItem {
  name: string;
  quantity: number;
}

export interface OrderRecord {
  id: string;
  externalId?: string;
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
      detail: "Your storefront is connected and ready — orders show up here the moment a customer checks out.",
    };
  }
  const revenue = formatMoney(summary.revenueCents, summary.currency);
  const orderWord = count === 1 ? "order" : "orders";
  const headline = `You've earned ${revenue} from ${count} ${orderWord} this month.`;
  const best = summary.topProducts[0];
  const detail = best ? `${best.name} is your best seller — ${best.quantity} sold.` : null;
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

/** Record a completed storefront order. Idempotent on externalId (required —
 *  the idempotency key); returns null on dedup/no-redis. */
export async function recordOrder(
  tenant: string,
  input: { amountCents: number; currency: string; items: OrderLineItem[]; externalId: string },
): Promise<OrderRecord | null> {
  const redis = getRedis();
  if (!redis) return null;

  const dedupKey = `order-ext:${tenant}:${input.externalId}`;
  const fresh = await redis.set(dedupKey, "1", { nx: true, ex: ORDER_TTL_SECONDS });
  if (!fresh) return null; // already captured this provider order

  const order: OrderRecord = {
    id: newOrderId(),
    externalId: input.externalId,
    amountCents: input.amountCents,
    currency: input.currency,
    itemCount: input.items.reduce((sum, it) => sum + it.quantity, 0) || input.items.length,
    items: input.items,
    createdAt: new Date().toISOString(),
  };

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
  return order;
}

/** Most recent orders, newest first. */
export async function getOrders(tenant: string, limit = 50): Promise<OrderRecord[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids = await redis.zrange<string[]>(ordersKey(tenant), 0, limit - 1, { rev: true });
  if (!ids.length) return [];
  const rows = await redis.mget<OrderRecord[]>(...ids.map((id) => orderKey(tenant, id)));
  return rows.filter((o): o is OrderRecord => Boolean(o));
}

/** Order count + revenue + top products over the trailing window. */
export async function getOrderSummary(tenant: string, sinceDays = 30): Promise<OrderSummary> {
  const orders = await getOrders(tenant, ORDER_KEEP);
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const recent = orders.filter((o) => new Date(o.createdAt).getTime() >= cutoff);

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
