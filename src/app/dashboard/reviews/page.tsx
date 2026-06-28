import { requireDashboardView } from "@/lib/dashboard-auth";
import { getReviews } from "@/lib/reviews";
import { ReviewsPanel } from "@/components/dashboard/ReviewsPanel";

export default async function ReviewsPage() {
  const { tenant } = await requireDashboardView();

  // Degrade to the empty state on a transient backend error rather than
  // escalating a recoverable failure into the full error boundary.
  const reviews = await getReviews(tenant).catch(() => []);

  return <ReviewsPanel reviews={reviews} />;
}
