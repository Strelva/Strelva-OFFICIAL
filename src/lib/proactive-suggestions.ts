import { addSuggestion, dedupePendingSuggestionEvents } from "./suggestions";
import { getReviews } from "./reviews";
import { getOwnerRetentionSignals } from "./retention";
import { getBlogPostsForSite } from "./cms/blog-public";
import { getTenantConfig } from "./tenants";

const STALE_SITE_DAYS = 21;

/** Titles of the suggestions that only make sense for sites with a content engine. */
export const STALE_SITE_SUGGESTION_TITLE = "Your site is due for a fresh update";
export const FIRST_POST_SUGGESTION_TITLE = "Add a short update post";
export const CONTENT_SUGGESTION_TITLES = [STALE_SITE_SUGGESTION_TITLE, FIRST_POST_SUGGESTION_TITLE];

function hasReply(reply: string | undefined | null): boolean {
  return typeof reply === "string" && reply.trim().length > 0;
}

/** Does this site have a blog/content engine? Only then do "post" nudges apply. */
export async function tenantHasContentEngine(tenant: string): Promise<boolean> {
  const config = await getTenantConfig(tenant).catch(() => null);
  return new Set(config?.features ?? []).has("blog");
}

/**
 * Proactive nudges. Checks a few already-cheap signals and turns each one into a
 * pending suggestion when a condition is met. addSuggestion dedupes by
 * (tenant, type, section) for pending suggestions, so this is idempotent and safe
 * to re-run on every dashboard open. Never throws; each signal is isolated so a
 * single failing data source can't suppress the others.
 *
 * The "fresh update" / "add a post" nudges only fire for sites with a content
 * engine (a blog) — a static one-pager has nothing to keep fresh, so nagging it
 * just floods the approval queue.
 *
 * Returns how many suggestions were actually queued for this tenant (0 when no
 * signal applied). Callers that route a client through here for a "draft these"
 * pass rely on this count to report the HONEST outcome — a stale one-pager with
 * no content engine and no unreplied review produces 0, and must not be reported
 * as "drafted". The dedupe-cleanup pass is not a draft, so it never counts.
 */
export async function generateProactiveSuggestions(tenant: string): Promise<number> {
  const hasContent = await tenantHasContentEngine(tenant);
  const tasks: Promise<number>[] = [
    suggestUnrepliedReview(tenant),
    // Sites without a content engine: don't add blog nudges, AND dismiss any that
    // were queued before this gating existed (or while the site still had a blog).
    ...(hasContent
      ? [suggestStaleSite(tenant), suggestFirstPost(tenant)]
      : [
          dedupePendingSuggestionEvents(tenant, {
            invalidTitles: CONTENT_SUGGESTION_TITLES,
          }).then(() => 0),
        ]),
  ];
  const results = await Promise.allSettled(tasks);
  return results.reduce((sum, r) => (r.status === "fulfilled" ? sum + r.value : sum), 0);
}

async function suggestUnrepliedReview(tenant: string): Promise<number> {
  // getReviews returns newest-first, so the first unreplied one is the most recent.
  const reviews = await getReviews(tenant);
  const unreplied = reviews.find((review) => !hasReply(review.reply));
  if (!unreplied) return 0;

  const author = unreplied.author?.trim() || "a customer";
  await addSuggestion({
    tenantId: tenant,
    type: "growth",
    title: "Reply to a recent review",
    description: `You have an unreplied review from ${author}. Want me to draft a reply that thanks them and sounds like you?`,
    action: "prompt:Draft a reply to my most recent unreplied review.",
  });
  return 1;
}

async function suggestStaleSite(tenant: string): Promise<number> {
  const signals = await getOwnerRetentionSignals(tenant);
  if (signals.noAiUsageDays === null || signals.noAiUsageDays < STALE_SITE_DAYS) return 0;

  await addSuggestion({
    tenantId: tenant,
    type: "stale",
    title: STALE_SITE_SUGGESTION_TITLE,
    description:
      "Your site hasn't changed in a few weeks. Want a fresh update or a quick post? A small change keeps it current for customers and search.",
    action: "prompt:Suggest one small, useful update for my site and make it after I approve.",
  });
  return 1;
}

async function suggestFirstPost(tenant: string): Promise<number> {
  const posts = await getBlogPostsForSite(tenant, { limit: 1 });
  if (posts.length > 0) return 0;

  await addSuggestion({
    tenantId: tenant,
    type: "missing",
    title: FIRST_POST_SUGGESTION_TITLE,
    description:
      "A short update post helps customers and search find you. Want me to draft one about what's new with your business?",
    action: "prompt:Draft a short update post for my site about what's new with my business.",
  });
  return 1;
}
