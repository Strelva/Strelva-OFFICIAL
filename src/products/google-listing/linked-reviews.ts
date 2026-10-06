import { getReviews } from "@/lib/reviews";
import { getConnection } from "@/lib/connections";
import { getEvents } from "@/lib/events";
import { getTenantConfig } from "@/lib/tenants";
import { getReplyVoice, defaultReplyVoice, type ReplyMode } from "@/lib/reviews/reply-voice";
import type { ReviewItem } from "@/lib/types";
import { readLinkedSites, type LinkedSite, type LinkedSites } from "@/platform/owner-entry/linked-sites";
import type { WorkspaceActor } from "@/platform/workspaces/types";

/**
 * Reviews on the Google listing, in the workspace: the home of
 * `/dashboard/reviews` (owner-entry spec §5). The same reads that page makes
 * (tenant review store, Google connection, reply voice, the drafted replies
 * waiting in the tenant's event queue), per linked site.
 */

export interface ReviewView {
  id: string;
  source: ReviewItem["source"];
  author: string;
  rating: number;
  text: string;
  date: string;
  reply: string | null;
  repliedAt: string | null;
  /** A reply Strelva drafted that is waiting, and when it posts by itself (auto mode). */
  draft: { reply: string; autoPostAt: string | null } | null;
}

export interface SiteReviews {
  tenantId: string;
  siteName: string;
  reviews: ReviewView[];
  googleConnected: boolean;
  googlePlaceId: string | null;
  replyMode: ReplyMode;
  unavailable: boolean;
}

export interface WorkspaceReviews {
  sites: SiteReviews[];
  denied: LinkedSite[];
}

export interface ReviewDependencies {
  sites: (actor: WorkspaceActor, workspaceId: string) => Promise<LinkedSites>;
  reviews: (tenantId: string) => Promise<ReviewItem[]>;
  googleConnected: (tenantId: string) => Promise<boolean>;
  placeId: (tenantId: string) => Promise<string | null>;
  replyMode: (tenantId: string) => Promise<ReplyMode>;
  pendingDrafts: (tenantId: string) => Promise<Array<{ metadata?: Record<string, unknown> }>>;
}

const defaults: ReviewDependencies = {
  sites: (actor, workspaceId) => readLinkedSites(actor, workspaceId),
  reviews: (tenantId) => getReviews(tenantId),
  googleConnected: async (tenantId) => (await getConnection(tenantId, "google"))?.status === "connected",
  placeId: async (tenantId) => (await getTenantConfig(tenantId))?.reviewsConfig?.googlePlaceId ?? null,
  replyMode: async (tenantId) => (await getReplyVoice(tenantId).catch(() => defaultReplyVoice())).mode,
  // Same bounded scan as /dashboard/reviews.
  pendingDrafts: (tenantId) => getEvents(tenantId, { status: "pending", limit: 1000 }),
};

export function draftsByReview(events: ReadonlyArray<{ metadata?: Record<string, unknown> }>): Map<string, { reply: string; autoPostAt: string | null }> {
  const drafts = new Map<string, { reply: string; autoPostAt: string | null }>();
  for (const event of events) {
    if (event.metadata?.kind !== "review_reply_draft") continue;
    const reviewId = typeof event.metadata.reviewId === "string" ? event.metadata.reviewId : null;
    const reply = typeof event.metadata.draftedReply === "string" ? event.metadata.draftedReply : null;
    if (!reviewId || !reply || drafts.has(reviewId)) continue;
    drafts.set(reviewId, { reply, autoPostAt: typeof event.metadata.autoPostAt === "string" ? event.metadata.autoPostAt : null });
  }
  return drafts;
}

export function reviewView(review: ReviewItem, drafts: ReadonlyMap<string, { reply: string; autoPostAt: string | null }>): ReviewView {
  // Drafts are keyed by the provider review id (what the poller queues), with the row id as a fallback.
  const draft = review.reply ? null : drafts.get(review.externalId ?? "") ?? drafts.get(review.id) ?? null;
  return {
    id: review.id, source: review.source, author: review.author || "A customer", rating: Math.max(0, Math.min(5, Math.round(review.rating))),
    text: review.text, date: review.date, reply: review.reply ?? null, repliedAt: review.repliedAt ?? null, draft,
  };
}

/** Throws WorkspaceAccessError for anyone who isn't a direct member of this business. */
export async function readWorkspaceReviews(actor: WorkspaceActor, workspaceId: string, dependencies: ReviewDependencies = defaults): Promise<WorkspaceReviews> {
  const { sites, denied } = await dependencies.sites(actor, workspaceId);
  return {
    denied,
    sites: await Promise.all(sites.map(async (site): Promise<SiteReviews> => {
      const [connected, placeId, mode, pending] = await Promise.all([
        dependencies.googleConnected(site.tenantId).catch(() => false),
        dependencies.placeId(site.tenantId).catch(() => null),
        dependencies.replyMode(site.tenantId).catch(() => "approve" as const),
        dependencies.pendingDrafts(site.tenantId).catch(() => []),
      ]);
      const base = { tenantId: site.tenantId, siteName: site.siteName, googleConnected: connected, googlePlaceId: placeId, replyMode: mode };
      try {
        const drafts = draftsByReview(pending);
        const reviews = (await dependencies.reviews(site.tenantId)).map((review) => reviewView(review, drafts)).sort((a, b) => b.date.localeCompare(a.date));
        return { ...base, reviews, unavailable: false };
      } catch (error) {
        console.error("[reviews] review store read failed", { tenantId: site.tenantId, error: error instanceof Error ? error.message : String(error) });
        return { ...base, reviews: [], unavailable: true };
      }
    })),
  };
}
