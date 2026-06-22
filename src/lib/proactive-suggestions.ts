import { addSuggestion } from "./suggestions";
import { getReviews } from "./reviews";
import { getOwnerRetentionSignals } from "./retention";
import { getBlogPostsForSite } from "./cms/blog-public";

const STALE_SITE_DAYS = 21;

function hasReply(reply: string | undefined | null): boolean {
  return typeof reply === "string" && reply.trim().length > 0;
}

/**
 * Proactive nudges. Checks a few already-cheap signals and turns each one into a
 * pending suggestion when a condition is met. addSuggestion dedupes by
 * (tenant, type, section) for pending suggestions, so this is idempotent and safe
 * to re-run on every dashboard open. Never throws; each signal is isolated so a
 * single failing data source can't suppress the others.
 */
export async function generateProactiveSuggestions(tenant: string): Promise<void> {
  await Promise.allSettled([
    suggestUnrepliedReview(tenant),
    suggestStaleSite(tenant),
    suggestFirstPost(tenant),
  ]);
}

async function suggestUnrepliedReview(tenant: string): Promise<void> {
  // getReviews returns newest-first, so the first unreplied one is the most recent.
  const reviews = await getReviews(tenant);
  const unreplied = reviews.find((review) => !hasReply(review.reply));
  if (!unreplied) return;

  const author = unreplied.author?.trim() || "a customer";
  await addSuggestion({
    tenantId: tenant,
    type: "growth",
    title: "Reply to a recent review",
    description: `You have an unreplied review from ${author}. Want me to draft a reply that thanks them and sounds like you?`,
    action: "prompt:Draft a reply to my most recent unreplied review.",
  });
}

async function suggestStaleSite(tenant: string): Promise<void> {
  const signals = await getOwnerRetentionSignals(tenant);
  if (signals.noAiUsageDays === null || signals.noAiUsageDays < STALE_SITE_DAYS) return;

  await addSuggestion({
    tenantId: tenant,
    type: "stale",
    title: "Your site is due for a fresh update",
    description:
      "Your site hasn't changed in a few weeks. Want a fresh update or a quick post? A small change keeps it current for customers and search.",
    action: "prompt:Suggest one small, useful update for my site and make it after I approve.",
  });
}

async function suggestFirstPost(tenant: string): Promise<void> {
  const posts = await getBlogPostsForSite(tenant, { limit: 1 });
  if (posts.length > 0) return;

  await addSuggestion({
    tenantId: tenant,
    type: "missing",
    title: "Add a short update post",
    description:
      "A short update post helps customers and search find you. Want me to draft one about what's new with your business?",
    action: "prompt:Draft a short update post for my site about what's new with my business.",
  });
}
