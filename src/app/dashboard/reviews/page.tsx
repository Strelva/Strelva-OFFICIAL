import { requireDashboardView } from "@/lib/dashboard-auth";
import { getReviews } from "@/lib/reviews";
import { getTenantConfig } from "@/lib/tenants";
import { getConnection } from "@/lib/connections";
import { getReplyVoice, defaultReplyVoice } from "@/lib/reviews/reply-voice";
import { getEvents } from "@/lib/events";
import { ReviewsPanel, type PreDraft } from "@/components/dashboard/ReviewsPanel";

export default async function ReviewsPage() {
  const { tenant } = await requireDashboardView();

  // Degrade to the empty state on a transient backend error rather than
  // escalating a recoverable failure into the full error boundary.
  const [reviews, config, googleConnection, voice, pending] = await Promise.all([
    getReviews(tenant).catch(() => []),
    getTenantConfig(tenant).catch(() => null),
    getConnection(tenant, "google").catch(() => null),
    getReplyVoice(tenant).catch(() => defaultReplyVoice()),
    getEvents(tenant, { status: "pending", limit: 200 }).catch(() => []),
  ]);

  // The AI-drafted reply already waiting for each review, keyed by review id, so
  // the page shows "here's your reply" instead of a "draft one" to-do.
  const preDrafts: Record<string, PreDraft> = {};
  for (const e of pending) {
    if (e.metadata?.kind !== "review_reply_draft") continue;
    const rid = typeof e.metadata?.reviewId === "string" ? e.metadata.reviewId : null;
    const reply = typeof e.metadata?.draftedReply === "string" ? e.metadata.draftedReply : null;
    if (!rid || !reply) continue;
    preDrafts[rid] = {
      reply,
      autoPostAt: typeof e.metadata?.autoPostAt === "string" ? e.metadata.autoPostAt : null,
    };
  }

  return (
    <ReviewsPanel
      reviews={reviews}
      googlePlaceId={config?.reviewsConfig?.googlePlaceId}
      gbpConnected={googleConnection?.status === "connected"}
      voice={voice}
      preDrafts={preDrafts}
    />
  );
}
