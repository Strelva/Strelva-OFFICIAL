import { notFound } from "next/navigation";
import { requireDashboardView } from "@/lib/dashboard-auth";
import { getTenantConfig } from "@/lib/tenants";
import { tenantHasStore } from "@/lib/dashboard-surfaces";
import { isInspecting } from "@/lib/inspect-mode";
import { getOrderSummary, getOrders } from "@/lib/orders";
import { getProducts } from "@/lib/products";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { StorePanel } from "@/components/dashboard/StorePanel";
import { InspectPreviewBanner } from "@/components/dashboard/InspectPreviewBanner";

// Store is a sub-section inside Website (the shared Website sub-nav switches
// Site <-> Store). It must be reachable EXACTLY when the nav shows the tab, so
// this route gates on the SAME `tenantHasStore` signal the sidebar uses
// (published products OR the commerce feature flag) — NOT the feature flag
// alone. Otherwise a real ecom client with products but no flag (e.g. gldf) gets
// a Store tab that 404s on click. A super-admin inspecting a non-store tenant
// still gets the read-only preview instead of a 404.
export default async function StorePage() {
  const { tenant } = await requireDashboardView();

  const [config, summary, orders, products] = await Promise.all([
    getTenantConfig(tenant).catch(() => null),
    getOrderSummary(tenant, 30).catch(() => null),
    getOrders(tenant, 20).catch(() => []),
    getProducts(tenant).catch(() => []),
  ]);

  const hasStore = tenantHasStore({
    tenantConfig: { features: config?.features },
    hasCommerce: products.length > 0,
  });
  let preview = false;
  if (!hasStore) {
    if (await isInspecting()) preview = true;
    else notFound();
  }

  return (
    <div className="flex h-full flex-col">
      {preview && <InspectPreviewBanner tenant={tenant} featureId="commerce" />}
      <EngagementTracker event="store-view" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <StorePanel summary={summary} orders={orders} products={products} />
      </div>
    </div>
  );
}
