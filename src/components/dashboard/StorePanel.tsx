import { XaRow, XaRows, XaSystemTile } from "@/components/ui/strelva/Xa";
import { DashPage, DashSection } from "./xa/DashboardXa";
import { formatMoney, buildStoreVerdict, type OrderRecord, type OrderSummary } from "@/lib/orders";
import { sanitizePromptValue } from "@/lib/capabilities";
import type { Product } from "@/lib/products";
import { StoreChatButton } from "./StoreChatButton";
import { Sparkline } from "./Sparkline";

/** Daily revenue (in dollars) across the span the recent orders cover, gap-filled
 *  so the sparkline reads as a real timeline. Anchored to the orders' own date
 *  range — no "today" read — so it stays a pure server-render. Capped to the last
 *  30 days to match the tile's window; returns [] under two active days (the
 *  Sparkline then self-suppresses). */
function dailyRevenueSeries(orders: OrderRecord[]): number[] {
  const byDay = new Map<string, number>();
  for (const o of orders) {
    const day = o.createdAt.slice(0, 10);
    if (day) byDay.set(day, (byDay.get(day) ?? 0) + o.amountCents);
  }
  if (byDay.size < 2) return [];
  const days = [...byDay.keys()].sort();
  const out: number[] = [];
  for (
    let d = new Date(days[0] + "T00:00:00Z");
    d <= new Date(days[days.length - 1] + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push((byDay.get(d.toISOString().slice(0, 10)) ?? 0) / 100);
  }
  return out.slice(-30);
}

// Owner-initiated review request, routed through the governed agent chat — we
// hold no customer PII on an order (just items/amount/date), so the ask is
// honest about that and hands the owner a message + their review link to send.
function reviewPrompt(order: OrderRecord): string {
  // Item names come from the order beacon (untrusted). Sanitize before they enter
  // the governed agent prompt so a crafted name can't inject instructions.
  const names = order.items.map((i) => sanitizePromptValue(i.name)).filter(Boolean).slice(0, 2);
  const label = names.length ? names.join(" and ") : `${formatMoney(order.amountCents, order.currency)} order`;
  const date = new Date(order.createdAt).toLocaleDateString();
  return `Help me ask the customer who bought ${label} on ${date} for a Google review. Write a short, friendly message I can send them and include my review link.`;
}

const PRODUCT_PROMPT =
  "I'd like to add or change a product in my store. Here's what I need:";

export function StorePanel({
  summary,
  orders,
  products = [],
}: {
  summary: OrderSummary | null;
  orders: OrderRecord[];
  products?: Product[];
}) {
  const verdict = buildStoreVerdict(summary);
  const revenueSeries = dailyRevenueSeries(orders);
  const revenue = formatMoney(summary?.revenueCents ?? 0, summary?.currency ?? "USD");
  const orderCount = summary?.orderCount ?? 0;

  return (
    <DashPage
      title={verdict.headline}
      quiet={verdict.detail || undefined}
      lead={<XaSystemTile kind="payments" size={48} label="Store" />}
      label="Store"
    >
      {revenueSeries.length > 1 ? (
        <figure className="m-0 flex max-w-[560px] flex-col gap-2" aria-label={`Money from orders by day, last 30 days: ${revenue} in all`}>
          <figcaption className="text-[13px] font-medium text-[var(--st-text-3)]">Money from orders by day, last 30 days</figcaption>
          <Sparkline series={revenueSeries} className="h-16" />
        </figure>
      ) : orderCount === 0 ? null : <p className="m-0 text-[15px] text-[var(--st-text-2)]"><span className="tabular-nums">{revenue}</span> from <span className="tabular-nums">{orderCount}</span> {orderCount === 1 ? "order" : "orders"} in the last 30 days.</p>}

      {summary && summary.topProducts.length > 0 && (
        <DashSection label="Best sellers">
          <XaRows label="Best sellers">
            {summary.topProducts.map((p) => <XaRow key={p.name} title={p.name} meta={`${p.quantity} sold`} />)}
          </XaRows>
        </DashSection>
      )}

      <DashSection label={products.length ? `Products · ${products.length}` : "Products"} aside={<StoreChatButton prompt={PRODUCT_PROMPT} label="Ask to add or change one" />}>
        {products.length > 0 ? (
          <XaRows label="Products">
            {products.map((p, i) => (
              <XaRow key={`${p.name}-${i}`} title={p.name} detail={p.inStock ? undefined : "Sold out"} tone={p.inStock ? undefined : "waits"}
                meta={p.priceCents != null ? formatMoney(p.priceCents, p.currency) : "No price yet"} />
            ))}
          </XaRows>
        ) : (
          <p className="m-0 text-[15px] text-[var(--st-text-2)]">No products listed yet. Strelva manages them for you; ask to add one.</p>
        )}
      </DashSection>

      <DashSection label="Recent orders">
        {orders.length ? (
          <XaRows label="Recent orders">
            {orders.map((o) => (
              <XaRow key={o.id}
                title={formatMoney(o.amountCents, o.currency)}
                detail={`${o.itemCount > 0 ? `${o.itemCount} ${o.itemCount === 1 ? "item" : "items"} · ` : ""}${new Date(o.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                action={<StoreChatButton prompt={reviewPrompt(o)} label="Ask for a review" />} />
            ))}
          </XaRows>
        ) : (
          <p className="m-0 text-[15px] text-[var(--st-text-2)]">No orders yet. They appear here as customers check out.</p>
        )}
      </DashSection>
    </DashPage>
  );
}
