/**
 * Portfolio opportunities — the PROACTIVE layer above the pending-approval queue.
 *
 * The approval queue (portfolio-actions.ts) only shows work that already exists as
 * a draft. This layer scans every active client for actionable-but-not-yet-drafted
 * opportunities — unreplied reviews, sites gone stale, health that has slipped —
 * and groups them so one operator sees the whole portfolio's LATENT work at a
 * glance and can queue it in a single pass.
 *
 * "Draft these" never publishes anything. It routes each tenant through an EXISTING
 * governed draft path:
 *   • unreplied reviews → `draftReviewReply` + a pending `review_reply_draft` event
 *     (the exact path the review poller uses) → lands in the approvable queue below,
 *   • stale sites / low health → `generateProactiveSuggestions` → pending suggestion
 *     cards in each client's own "Needs you" queue.
 * Both land in each client's PENDING queue for owner/operator approval — never
 * auto-published. Every scan read and every draft is per-tenant isolated: one
 * client failing degrades that client, never the whole pass.
 *
 * Pure of auth/HTTP (like portfolio-actions.ts): the page reads the scan, the
 * server action gates super-admin then calls the draft dispatcher.
 */
import { getAllTenants, isActiveTenant, getTenantConfig } from "@/lib/tenants";
import { getReviews } from "@/lib/reviews";
import { getOwnerRetentionSignals } from "@/lib/retention";
import { getScanSummaries, type ScanSummary } from "@/lib/scan-store";
import { generateProactiveSuggestions } from "@/lib/proactive-suggestions";
import { draftReviewReply } from "@/lib/review-replies";
import { storeRecentReply } from "@/lib/review-replies";
import { addEvent, getEvents } from "@/lib/events";
import type { UnifiedEvent } from "@/lib/types";

/** A site with no owner AI activity for this many days is "stale" on the operator surface. */
const STALE_SITE_DAYS = 30;
/** Health grades that read as "slipping" and worth a proactive nudge. */
const LOW_HEALTH_GRADES = new Set<ScanSummary["grade"]>(["D", "F"]);

export type OpportunityKind = "unreplied_reviews" | "stale_sites" | "low_health";

export interface OpportunityClient {
  tenantId: string;
  siteName: string;
  /** One plain-language line on why this client is in the group. */
  detail: string;
}

export interface OpportunityGroup {
  kind: OpportunityKind;
  /** Section heading, e.g. "Clients with unreplied reviews". */
  title: string;
  /** One-line roll-up, e.g. "6 clients have reviews waiting for a reply". */
  summary: string;
  /** The "Draft these" button label for this kind. */
  actionLabel: string;
  clients: OpportunityClient[];
}

export interface PortfolioOpportunitiesSnapshot {
  groups: OpportunityGroup[];
  /** Total client-opportunities across every group. */
  totalOpportunities: number;
}

function hasReply(reply: string | undefined | null): boolean {
  return typeof reply === "string" && reply.trim().length > 0;
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}

/** Per-tenant signals the scan collects once, then buckets into opportunity groups. */
interface TenantSignals {
  tenantId: string;
  siteName: string;
  unrepliedReviews: number;
  staleDays: number | null;
  lowGrade: ScanSummary["grade"] | null;
}

async function collectSignals(
  tenant: { id: string; siteName?: string },
  scan: ScanSummary | null,
): Promise<TenantSignals> {
  const [reviews, retention] = await Promise.all([
    getReviews(tenant.id).catch(() => []),
    getOwnerRetentionSignals(tenant.id).catch(() => null),
  ]);

  const unrepliedReviews = reviews.filter((r) => !hasReply(r.reply)).length;
  const staleDays =
    retention && retention.noAiUsageDays !== null && retention.noAiUsageDays >= STALE_SITE_DAYS
      ? retention.noAiUsageDays
      : null;
  const lowGrade = scan && LOW_HEALTH_GRADES.has(scan.grade) ? scan.grade : null;

  return {
    tenantId: tenant.id,
    siteName: tenant.siteName || tenant.id,
    unrepliedReviews,
    staleDays,
    lowGrade,
  };
}

/**
 * Scan every active client for latent, not-yet-drafted work and group it by
 * opportunity kind. Each per-tenant read degrades to "no signal" rather than
 * failing the whole snapshot, so a transient backend blip can never 500 the
 * overview. Empty groups are dropped; groups are ordered by how many clients
 * they touch (biggest lever first).
 */
export async function scanPortfolioOpportunities(): Promise<PortfolioOpportunitiesSnapshot> {
  const tenants = (await getAllTenants().catch(() => [])).filter(isActiveTenant);
  if (tenants.length === 0) return { groups: [], totalOpportunities: 0 };

  // One MGET for every tenant's latest health grade, then per-tenant signal reads.
  const scans = await getScanSummaries(tenants.map((t) => t.id)).catch(
    () => ({}) as Record<string, ScanSummary | null>,
  );
  const signals = await Promise.all(
    tenants.map((t) => collectSignals(t, scans[t.id] ?? null)),
  );

  const unreplied = signals.filter((s) => s.unrepliedReviews > 0);
  const stale = signals.filter((s) => s.staleDays !== null);
  const lowHealth = signals.filter((s) => s.lowGrade !== null);

  const groups: OpportunityGroup[] = [];

  if (unreplied.length > 0) {
    groups.push({
      kind: "unreplied_reviews",
      title: "Clients with unreplied reviews",
      summary: `${unreplied.length} client${plural(unreplied.length)} ${
        unreplied.length === 1 ? "has" : "have"
      } reviews waiting for a reply`,
      actionLabel: "Draft replies",
      clients: unreplied.map((s) => ({
        tenantId: s.tenantId,
        siteName: s.siteName,
        detail: `${s.unrepliedReviews} review${plural(s.unrepliedReviews)} awaiting a reply`,
      })),
    });
  }

  if (stale.length > 0) {
    groups.push({
      kind: "stale_sites",
      title: "Sites gone quiet",
      summary: `${stale.length} client${plural(stale.length)} ${
        stale.length === 1 ? "hasn't" : "haven't"
      } had a site update in ${STALE_SITE_DAYS}+ days`,
      actionLabel: "Draft updates",
      clients: stale.map((s) => ({
        tenantId: s.tenantId,
        siteName: s.siteName,
        detail: `No site update in ${s.staleDays} days`,
      })),
    });
  }

  if (lowHealth.length > 0) {
    groups.push({
      kind: "low_health",
      title: "Site health slipping",
      summary: `${lowHealth.length} client${plural(lowHealth.length)} ${
        lowHealth.length === 1 ? "has" : "have"
      } a site-health grade of D or F`,
      actionLabel: "Draft fixes",
      clients: lowHealth.map((s) => ({
        tenantId: s.tenantId,
        siteName: s.siteName,
        detail: `Site-health grade ${s.lowGrade}`,
      })),
    });
  }

  groups.sort((a, b) => b.clients.length - a.clients.length);
  const totalOpportunities = groups.reduce((sum, g) => sum + g.clients.length, 0);
  return { groups, totalOpportunities };
}

export interface OpportunityDraftResult {
  tenantId: string;
  /** True when a governed draft actually landed in this client's PENDING queue. */
  drafted: boolean;
  /** Why nothing was drafted (honest partial failure), when drafted is false. */
  reason?: string;
}

/** Whether a pending review_reply_draft already exists for this review id. */
function alreadyDrafted(pending: UnifiedEvent[], reviewId: string): boolean {
  return pending.some(
    (e) =>
      e.type === "review" &&
      e.metadata?.kind === "review_reply_draft" &&
      e.metadata?.reviewId === reviewId,
  );
}

/**
 * Draft a filter-safe reply to a client's most-recent unreplied review and queue
 * it as a pending `review_reply_draft` — the SAME governed path the review poller
 * uses (drafted, linted, never auto-published; the owner/operator approves it in
 * the queue below). Idempotent: skips a review that already has a pending draft.
 */
async function draftReviewReplyForTenant(tenantId: string): Promise<OpportunityDraftResult> {
  const tenant = await getTenantConfig(tenantId).catch(() => null);
  if (!tenant) return { tenantId, drafted: false, reason: "tenant_not_found" };

  const reviews = await getReviews(tenantId).catch(() => []);
  // getReviews is newest-first, so the first unreplied one is the most recent.
  const review = reviews.find((r) => !hasReply(r.reply));
  if (!review) return { tenantId, drafted: false, reason: "no_unreplied_review" };

  const reviewId = review.externalId ?? review.id;
  const pending = await getEvents(tenantId, { status: "pending", limit: 200 }).catch(
    () => [] as UnifiedEvent[],
  );
  if (alreadyDrafted(pending, reviewId)) {
    return { tenantId, drafted: false, reason: "already_drafted" };
  }

  const draftedReply = await draftReviewReply(
    {
      reviewId,
      reviewerName: review.author,
      rating: review.rating,
      comment: review.text,
    },
    tenant,
  );

  await addEvent({
    tenantId,
    source: "ai",
    type: "review",
    title: `Drafted reply for ${review.author}'s ${review.rating}-star review`,
    body: draftedReply,
    // Always pending — a human must approve before it publishes to Google.
    status: "pending",
    metadata: {
      kind: "review_reply_draft",
      reviewId,
      rating: review.rating,
      author: review.author,
      draftedReply,
    },
  });
  await storeRecentReply(tenantId, draftedReply).catch(() => {});

  return { tenantId, drafted: true };
}

/**
 * Fan a "Draft these" click across the selected clients, routing each through the
 * governed draft path for the opportunity kind. Sequential so concurrent Gemini
 * calls don't stampede (the batch is a handful of clients). Per-tenant isolation:
 * one client throwing is reported as `drafted:false` and never aborts the rest.
 *
 *   • unreplied_reviews → a pending review_reply_draft (approvable in the queue),
 *   • stale_sites / low_health → generateProactiveSuggestions (suggestion cards in
 *     the client's own queue). It returns the REAL count of suggestions queued —
 *     a client offered in the group but producing 0 (e.g. a stale one-pager with
 *     no content engine and no unreplied review) is reported honestly as
 *     `drafted:false, reason:"nothing_to_draft"`, never as a phantom "drafted".
 */
export async function draftOpportunityForClients(
  kind: OpportunityKind,
  tenantIds: string[],
): Promise<OpportunityDraftResult[]> {
  const results: OpportunityDraftResult[] = [];
  for (const tenantId of tenantIds) {
    try {
      if (kind === "unreplied_reviews") {
        results.push(await draftReviewReplyForTenant(tenantId));
      } else {
        // stale_sites + low_health both clear through the governed proactive
        // generator, which queues pending suggestion cards for approval.
        const drafted = await generateProactiveSuggestions(tenantId);
        results.push(
          drafted > 0
            ? { tenantId, drafted: true }
            : { tenantId, drafted: false, reason: "nothing_to_draft" },
        );
      }
    } catch (err) {
      results.push({
        tenantId,
        drafted: false,
        reason: err instanceof Error ? err.message : "error",
      });
    }
  }
  return results;
}
