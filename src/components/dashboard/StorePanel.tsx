import { ShoppingBag, TrendingUp, Package, Receipt, Tag } from "lucide-react";
import { formatMoney, buildStoreVerdict, type OrderRecord, type OrderSummary } from "@/lib/orders";
import { sanitizePromptValue } from "@/lib/capabilities";
import type { Product } from "@/lib/products";
import { StoreChatButton } from "./StoreChatButton";

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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
        <ShoppingBag className="h-3.5 w-3.5" strokeWidth={1.7} />
        Store
      </div>

      {/* Verdict — the one honest sentence before any metric */}
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-[28px] font-normal leading-tight text-warm-black">
        {verdict.headline}
      </h1>
      {verdict.detail && (
        <p className="mt-2 max-w-[560px] text-[14px] leading-relaxed text-gray-muted">{verdict.detail}</p>
      )}

      {/* Supporting metrics */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-glass-border bg-glass p-4">
          <div className="mb-2 flex items-center gap-2 text-gray-muted">
            <TrendingUp className="h-4 w-4" strokeWidth={1.5} />
            <span className="text-[11px] font-medium uppercase tracking-[0.12em]">Revenue · 30 days</span>
          </div>
          <p className="text-[26px] font-semibold leading-none text-warm-black">
            {formatMoney(summary?.revenueCents ?? 0, summary?.currency ?? "USD")}
          </p>
        </div>
        <div className="rounded-xl border border-glass-border bg-glass p-4">
          <div className="mb-2 flex items-center gap-2 text-gray-muted">
            <Receipt className="h-4 w-4" strokeWidth={1.5} />
            <span className="text-[11px] font-medium uppercase tracking-[0.12em]">Orders · 30 days</span>
          </div>
          <p className="text-[26px] font-semibold leading-none text-warm-black">{summary?.orderCount ?? 0}</p>
        </div>
      </div>

      {/* Best sellers */}
      {summary && summary.topProducts.length > 0 && (
        <section className="mt-4 rounded-xl border border-glass-border bg-surface-raised p-5">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-gray-muted" strokeWidth={1.6} />
            <h2 className="text-[14px] font-medium text-warm-black">Best sellers</h2>
          </div>
          <ul className="mt-3 space-y-1.5">
            {summary.topProducts.map((p) => (
              <li key={p.name} className="flex items-center justify-between text-[13px]">
                <span className="truncate text-warm-black">{p.name}</span>
                <span className="shrink-0 text-gray-muted">{p.quantity} sold</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Products — read-only; Strelva manages them, so say so plainly */}
      <section className="mt-4 rounded-xl border border-glass-border bg-surface-raised p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-gray-muted" strokeWidth={1.6} />
            <h2 className="text-[14px] font-medium text-warm-black">Products</h2>
          </div>
          {products.length > 0 && <span className="text-[12px] text-gray-muted">{products.length}</span>}
        </div>

        {products.length > 0 ? (
          <ul className="mt-3 divide-y divide-gray-border/60">
            {products.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-warm-black">{p.name}</span>
                  {!p.inStock && (
                    <span className="shrink-0 rounded-full border border-gray-border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-faint">
                      Sold out
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-gray-muted">
                  {p.priceCents != null ? formatMoney(p.priceCents, p.currency) : "—"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] leading-relaxed text-gray-muted">
            No products listed yet.
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2.5 border-t border-gray-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] leading-relaxed text-gray-muted">
            Your products are managed by Strelva. Ask in chat to add or change one.
          </p>
          <StoreChatButton prompt={PRODUCT_PROMPT} label="Ask Strelva" />
        </div>
      </section>

      {/* Recent orders — each one turns into a retention action */}
      <section className="mt-4 rounded-xl border border-glass-border bg-surface-raised p-5">
        <h2 className="text-[14px] font-medium text-warm-black">Recent orders</h2>
        {orders.length ? (
          <ul className="mt-3 divide-y divide-gray-border/60">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5 text-[13px]">
                <div className="min-w-0">
                  <span className="font-medium text-warm-black">{formatMoney(o.amountCents, o.currency)}</span>
                  {o.itemCount > 0 && (
                    <span className="ml-2 text-gray-muted">{o.itemCount} {o.itemCount === 1 ? "item" : "items"}</span>
                  )}
                  <span className="ml-2 text-[11px] text-gray-faint">{new Date(o.createdAt).toLocaleDateString()}</span>
                </div>
                <StoreChatButton prompt={reviewPrompt(o)} label="Ask Strelva to request a review" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] leading-relaxed text-gray-muted">
            No orders yet. They&apos;ll appear here in real time as customers check out.
          </p>
        )}
      </section>
    </div>
  );
}
