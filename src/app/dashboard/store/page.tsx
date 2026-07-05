import { requireDashboardView } from "@/lib/dashboard-auth";
import { getOrderSummary, getOrders } from "@/lib/orders";
import { getProducts } from "@/lib/products";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { StorePanel } from "@/components/dashboard/StorePanel";

// Store is a sub-section inside Website (the shared Website sub-nav switches
// Site <-> Store). Reaching this route means the tenant has a store.
export default async function StorePage() {
  const { tenant } = await requireDashboardView();

  const [summary, orders, products] = await Promise.all([
    getOrderSummary(tenant, 30).catch(() => null),
    getOrders(tenant, 20).catch(() => []),
    getProducts(tenant).catch(() => []),
  ]);

  return (
    <div className="flex h-full flex-col">
      <EngagementTracker event="store-view" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <StorePanel summary={summary} orders={orders} products={products} />
      </div>
    </div>
  );
}
