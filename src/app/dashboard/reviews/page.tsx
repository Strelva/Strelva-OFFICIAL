import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasTenantAccess } from "@/lib/auth";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import { getReviews } from "@/lib/reviews";
import { ReviewsPanel } from "@/components/dashboard/ReviewsPanel";

export default async function ReviewsPage() {
  const clientFallbackRoot = getClientFallbackRoot(await headers());
  const tenant = await getTenantFromHeaders();
  const hasAccess = await hasTenantAccess(tenant);

  if (!hasAccess) {
    redirect(withClientFallbackRoot(clientFallbackRoot, "/no-access"));
  }

  // Degrade to the empty state on a transient backend error rather than
  // escalating a recoverable failure into the full error boundary.
  const reviews = await getReviews(tenant).catch(() => []);

  return <ReviewsPanel reviews={reviews} />;
}
