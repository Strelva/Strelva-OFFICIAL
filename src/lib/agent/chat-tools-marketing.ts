import { z } from "zod";
import { tool } from "ai";
import type { ChatToolDeps, ChatToolEntries } from "./chat-tool-deps";

// Tenant chat tools for newsletters, Google Business drafts, social posts and
// reviews. Part of buildTenantChatTools (./chat-tools.ts).

/** Newsletter, Google Business drafts, subscribers, social posts, reviews. */
export function marketingChatTools(deps: ChatToolDeps): ChatToolEntries {
  const { tenant, recordActionResult, gbpTools } = deps;
  return {
    draft_newsletter: {
      capability: "draft_newsletter",
      def: tool({
        description: "Draft an email newsletter. Creates a draft that must be approved before sending. Use this instead of sending newsletters directly.",
        inputSchema: z.object({
          subject: z.string(),
          body: z.string().describe("The email content in plain text or simple HTML"),
        }),
        execute: async ({ subject, body }) => {
          try {
            const { getSubscribers, logActivity } = await import("@/lib/storage");
            const { addEvent } = await import("@/lib/events");
            const subscribers = await getSubscribers(tenant);
            const active = subscribers.filter((s) => s.status === "active");
            if (active.length === 0) {
              recordActionResult({ status: "blocked", message: "No active subscribers" });
              return { success: false, error: "No active subscribers", agentResultStatus: "blocked" as const };
            }

            const event = await addEvent({
              tenantId: tenant,
              source: "ai",
              type: "newsletter_draft",
              title: `Newsletter draft: "${subject}"`,
              body: `To ${active.length} subscribers.\n\n${body.slice(0, 500)}${body.length > 500 ? "..." : ""}`,
              status: "pending",
              metadata: {
                kind: "newsletter_approval",
                subject,
                body,
                subscriberCount: active.length,
              },
            });
            recordActionResult({
              status: "queued",
              eventIds: [event.id],
              message: `Newsletter draft "${subject}" queued for review.`,
              sourceProof: "Source: Subscriber list stored in dashboard",
            });

            await logActivity({
              text: `AI drafted newsletter: "${subject}" for ${active.length} subscribers (pending approval)`,
              time: new Date().toISOString(),
              type: "newsletter",
              actor: "ai",
            }, tenant);

            return {
              success: true,
              drafted: true,
              eventId: event.id,
              eventIds: [event.id],
              agentResultStatus: "queued" as const,
              subscriberCount: active.length,
              message: `I've drafted the newsletter "${subject}" for ${active.length} subscribers. It's in the review queue for approval before sending.`,
              sourceProof: "Source: Subscriber list stored in dashboard",
            };
          } catch (err) {
            const error = err instanceof Error ? err.message : "Failed to draft";
            recordActionResult({ status: "failed", error });
            return { success: false, error, agentResultStatus: "failed" as const };
          }
        },
      }),
    },
    // GBP write tools share their definitions with the executor (buildGbpTools).
    create_gbp_post: { capability: "create_gbp_post", def: gbpTools.create_gbp_post },
    update_business_hours: { capability: "update_business_hours", def: gbpTools.update_business_hours },
    upload_gbp_photo: { capability: "upload_gbp_photo", def: gbpTools.upload_gbp_photo },
    list_subscribers: {
      capability: "list_subscribers",
      def: tool({
        description: "List all newsletter subscribers and their count",
        inputSchema: z.object({}),
        execute: async () => {
          const { getSubscribers } = await import("@/lib/storage");
          const subscribers = await getSubscribers(tenant);
          return {
            count: subscribers.length,
            subscribers: subscribers.map((s: { email: string; name?: string; subscribedAt: string }) => ({
              email: s.email,
              name: s.name,
              subscribedAt: s.subscribedAt,
            })),
          };
        },
      }),
    },
    draft_social_post: {
      capability: "draft_social_post",
      def: tool({
        description: "Draft a social media post. Creates it as a draft that the owner can review and publish.",
        inputSchema: z.object({
          platform: z.enum(["instagram", "facebook", "x"]).describe("Target social platform"),
          content: z.string().describe("The post content/caption"),
          imageUrl: z.string().optional().describe("Optional image URL to attach"),
        }),
        execute: async ({ platform, content, imageUrl }) => {
          try {
            const { getSocialPosts, setSocialPosts } = await import("@/lib/storage");
            const post = {
              id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              platform,
              content,
              imageUrl: imageUrl || undefined,
              status: "draft" as const,
              createdAt: new Date().toISOString(),
            };
            const posts = await getSocialPosts(tenant);
            posts.unshift(post);
            await setSocialPosts(tenant, posts);
            recordActionResult({
              status: "drafted",
              message: `Social post draft saved for ${platform}.`,
              sourceProof: "Source: Social drafts stored in dashboard",
            });
            return {
              success: true,
              post,
              agentResultStatus: "drafted" as const,
              sourceProof: "Source: Social drafts stored in dashboard",
            };
          } catch (err) {
            const error = err instanceof Error ? err.message : "Failed to create post";
            recordActionResult({ status: "failed", error });
            return { success: false, error, agentResultStatus: "failed" as const };
          }
        },
      }),
    },
    list_social_posts: {
      capability: "list_social_posts",
      def: tool({
        description: "List recent social media posts with their status (draft, scheduled, published)",
        inputSchema: z.object({
          status: z.enum(["draft", "scheduled", "published"]).optional().describe("Filter by status"),
        }),
        execute: async ({ status }) => {
          try {
            const { getSocialPosts } = await import("@/lib/storage");
            let posts = await getSocialPosts(tenant);
            if (status) posts = posts.filter((p) => p.status === status);
            return {
              count: posts.length,
              posts: posts.slice(0, 20).map((p) => ({
                id: p.id,
                platform: p.platform,
                content: p.content.slice(0, 100) + (p.content.length > 100 ? "..." : ""),
                status: p.status,
                scheduledFor: p.scheduledFor,
                publishedAt: p.publishedAt,
                createdAt: p.createdAt,
              })),
            };
          } catch (err) {
            return { error: err instanceof Error ? err.message : "Failed to list posts" };
          }
        },
      }),
    },
    get_reviews: {
      capability: "get_reviews",
      def: tool({
        description: "Get all customer reviews across platforms (Google, Yelp, manual)",
        inputSchema: z.object({}),
        execute: async () => {
          try {
            const { getReviews } = await import("@/lib/reviews");
            const reviews = await getReviews(tenant);
            const avg = reviews.length > 0
              ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
              : 0;
            return {
              reviews: reviews.slice(0, 20),
              total: reviews.length,
              averageRating: Math.round(avg * 10) / 10,
              unreplied: reviews.filter((r) => !r.reply).length,
              sourceProof: "Source: Reviews stored in dashboard",
            };
          } catch (err) {
            return { error: `Failed to get reviews: ${err instanceof Error ? err.message : "Unknown error"}` };
          }
        },
      }),
    },
  };
}

/** Drafting a review reply (Google replies queue for owner approval). */
export function reviewReplyChatTools(deps: ChatToolDeps): ChatToolEntries {
  const { tenant, recordActionResult } = deps;
  return {
    reply_to_review: {
      capability: "respond_review",
      def: tool({
        description:
          "Draft a reply to a customer review by ID. Google review replies are queued for the owner to APPROVE before publishing to Google — never posted directly. Replies on other platforms are saved in the dashboard only. Use get_reviews first to find the review ID.",
        inputSchema: z.object({
          reviewId: z.string().min(1).max(200).describe("The review ID to reply to"),
          replyText: z.string().min(1).max(4096).describe("The reply text"),
        }),
        execute: async ({ reviewId, replyText }) => {
          try {
            const { getReviews } = await import("@/lib/reviews");
            const reviews = await getReviews(tenant);
            const review = reviews.find((r) => r.id === reviewId);
            if (!review) {
              return { success: false, error: "Review not found" };
            }

            // Google reviews with a connected Google account go through the
            // governed path: queue a review_reply_draft the owner must APPROVE
            // before it publishes to Google (same pattern as create_gbp_post;
            // the actual write happens in event-actions via publishReviewReply).
            if (review.source === "google" && review.externalId) {
              const { getConnection } = await import("@/lib/connections");
              const connection = await getConnection(tenant, "google");
              if (connection?.status === "connected") {
                const { addEvent } = await import("@/lib/events");
                const event = await addEvent({
                  tenantId: tenant,
                  source: "ai",
                  type: "review",
                  title: `Drafted reply for ${review.author}'s ${review.rating}-star review`,
                  body: replyText,
                  status: "pending",
                  metadata: {
                    kind: "review_reply_draft",
                    reviewId: review.externalId,
                    rating: review.rating,
                    author: review.author,
                    draftedReply: replyText,
                    reviewCreatedAt: review.date,
                  },
                });
                recordActionResult({
                  status: "queued",
                  eventIds: [event.id],
                  message: `Reply to ${review.author}'s review drafted — approve it to publish to Google.`,
                });
                return {
                  success: true,
                  eventId: event.id,
                  eventIds: [event.id],
                  agentResultStatus: "queued" as const,
                  message: `I've drafted a reply to ${review.author}'s review and queued it for your approval. It won't appear on Google until you approve it in the dashboard.`,
                };
              }
            }

            // No publish path (Yelp/manual, or Google without a connected
            // account): save the reply in the dashboard and say so honestly.
            const { replyToReview } = await import("@/lib/reviews");
            const updated = await replyToReview(tenant, reviewId, replyText);
            if (!updated) {
              return { success: false, error: "Review not found" };
            }

            try {
              const { logActivity } = await import("@/lib/storage");
              await logActivity({
                text: `AI saved a reply to ${updated.author}'s ${updated.rating}-star review (dashboard only)`,
                time: new Date().toISOString(),
                type: "review-reply",
                actor: "ai",
              }, tenant);
            } catch {}

            const platform = updated.source === "google" ? "Google" : updated.source === "yelp" ? "Yelp" : null;
            recordActionResult({
              status: "drafted",
              message: `Reply to ${updated.author}'s review saved in the dashboard.`,
            });
            return {
              success: true,
              review: updated,
              agentResultStatus: "drafted" as const,
              message: platform
                ? `I saved the reply to ${updated.author}'s review in your dashboard. I can't publish replies to ${platform} from here, so you'll need to post it on ${platform} yourself.`
                : `I saved the reply to ${updated.author}'s review in your dashboard.`,
            };
          } catch (err) {
            const error = `Failed to reply: ${err instanceof Error ? err.message : "Unknown error"}`;
            recordActionResult({ status: "failed", error });
            return { success: false, error, agentResultStatus: "failed" as const };
          }
        },
      }),
    },
  };
}
