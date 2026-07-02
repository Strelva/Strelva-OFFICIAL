import { requireDashboardView } from "@/lib/dashboard-auth";
import { getReviews } from "@/lib/reviews";
import { getTenantConfig } from "@/lib/tenants";
import { getConnection } from "@/lib/connections";
import { ReviewsPanel } from "@/components/dashboard/ReviewsPanel";

export default async function ReviewsPage() {
  const { tenant } = await requireDashboardView();

  // Degrade to the empty state on a transient backend error rather than
  // escalating a recoverable failure into the full error boundary.
  const [reviews, config, googleConnection] = await Promise.all([
    getReviews(tenant).catch(() => []),
    getTenantConfig(tenant).catch(() => null),
    getConnection(tenant, "google").catch(() => null),
  ]);

  return (
    <ReviewsPanel
      reviews={reviews}
      googlePlaceId={config?.reviewsConfig?.googlePlaceId}
      gbpConnected={googleConnection?.status === "connected"}
    />
  );
}
