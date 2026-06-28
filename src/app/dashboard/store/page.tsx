import { requireDashboardView } from "@/lib/dashboard-auth";
import { getOrderSummary, getOrders } from "@/lib/orders";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { StorePanel } from "@/components/dashboard/StorePanel";

export default async function StorePage() {
  const { tenant } = await requireDashboardView();

  const [summary, orders] = await Promise.all([
    getOrderSummary(tenant, 30).catch(() => null),
    getOrders(tenant, 20).catch(() => []),
  ]);

  return (
    <>
      <EngagementTracker event="store-view" />
      <StorePanel summary={summary} orders={orders} />
    </>
  );
}
