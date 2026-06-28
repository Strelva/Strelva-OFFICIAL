import { ShoppingBag, TrendingUp, Package, Receipt } from "lucide-react";
import type { OrderRecord, OrderSummary } from "@/lib/orders";

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export function StorePanel({ summary, orders }: { summary: OrderSummary | null; orders: OrderRecord[] }) {
  const hasOrders = (summary?.orderCount ?? 0) > 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
        <ShoppingBag className="h-3.5 w-3.5" strokeWidth={1.7} />
        Store
      </div>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-[28px] font-normal leading-tight text-warm-black">
        {hasOrders ? "Your store this month" : "Your store"}
      </h1>
      <p className="mt-2 max-w-[560px] text-[14px] leading-relaxed text-gray-muted">
        {hasOrders
          ? "Orders and revenue from your storefront — the last 30 days."
          : "Once your storefront takes orders, your revenue, recent orders, and best sellers show up here."}
      </p>

      {/* Headline metrics */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-glass-border bg-glass p-4">
          <div className="mb-2 flex items-center gap-2 text-gray-muted">
            <TrendingUp className="h-4 w-4" strokeWidth={1.5} />
            <span className="text-[11px] font-medium uppercase tracking-[0.12em]">Revenue · 30 days</span>
          </div>
          <p className="text-[26px] font-semibold leading-none text-warm-black">
            {money(summary?.revenueCents ?? 0, summary?.currency ?? "USD")}
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

      {/* Recent orders */}
      <section className="mt-4 rounded-xl border border-glass-border bg-surface-raised p-5">
        <h2 className="text-[14px] font-medium text-warm-black">Recent orders</h2>
        {orders.length ? (
          <ul className="mt-3 divide-y divide-gray-border/60">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2.5 text-[13px]">
                <div className="min-w-0">
                  <span className="font-medium text-warm-black">{money(o.amountCents, o.currency)}</span>
                  {o.itemCount > 0 && (
                    <span className="ml-2 text-gray-muted">{o.itemCount} {o.itemCount === 1 ? "item" : "items"}</span>
                  )}
                </div>
                <span className="shrink-0 text-[11px] text-gray-faint">{new Date(o.createdAt).toLocaleDateString()}</span>
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
