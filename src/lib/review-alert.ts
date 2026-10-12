/**
 * Owner alert for a genuinely-new review — shared by the Google + Yelp poll
 * crons so both dedupe and gate identically.
 *
 * Fires at most once per review (a persistent `reb:review-alert-sent:*` marker,
 * set NX before the send). The marker is rolled back when the send is suppressed
 * (client email pause) or fails, so the alert reaches the owner the day client
 * email is switched on rather than being lost forever — the same "only stamp on a
 * real send" discipline the review-nudge cron uses.
 *
 * Converted review links bind the current trusted recipient, workspace and
 * authority version. Missing or inconsistent authority suppresses the buttons.
 * Unconverted sites retain their existing tenant links.
 */
import { resolveOwnerNoticeRecipient } from "./owner-recipient";
import { getRedis } from "@/platform/infra/redis";
import { sendReviewNeedsReplyEmail } from "./delivery-email";
import type { TenantConfig } from "./types";
import { readReviewApprovalAuthority } from "./review-approval-authority";
import { buildReviewApproveUrl } from "./approve-link";
import { getTenantDashboardUrl } from "./tenant-urls";

/** Keep the per-review marker well past the poll window so a re-seen review can't
 *  re-alert. `reb:` persistent-key prefix per AGENTS.md. */
const ALERT_TTL_SECONDS = 60 * 24 * 60 * 60;

export function reviewAlertSentKey(tenantId: string, reviewId: string): string {
  return `reb:review-alert-sent:${tenantId}:${reviewId}`;
}

export async function maybeAlertNewReview(params: {
  tenant: TenantConfig;
  reviewId: string;
  review: { author: string; rating: number; text?: string };
  reviewsUrl: string;
  draftedReply?: string;
  approveUrl?: string;
  notYetUrl?: string;
  reviewEventId?: string;
  logPrefix?: string;
}): Promise<boolean> {
  const recipient = await resolveOwnerNoticeRecipient(params.tenant);
  if (!recipient) return false;
  const { email } = recipient;
  let links: { approveUrl?: string; notYetUrl?: string } = recipient.workspaceId === null
    ? { approveUrl: params.approveUrl, notYetUrl: params.notYetUrl } : {};
  if (recipient.workspaceId !== null && params.reviewEventId && params.draftedReply) {
    const authority = await readReviewApprovalAuthority(params.tenant.id);
    if (authority?.workspaceId === recipient.workspaceId && authority.recipient === email) {
      const origin = getTenantDashboardUrl(params.tenant, "/");
      const claims = { tenantId: params.tenant.id, eventId: params.reviewEventId, workspaceId: authority.workspaceId,
        recipient: authority.recipient, authorityVersion: authority.version };
      links = { approveUrl: buildReviewApproveUrl(origin, { ...claims, action: "approve" }),
        notYetUrl: buildReviewApproveUrl(origin, { ...claims, action: "not-yet" }) };
    }
  }

  const redis = getRedis();
  // No dedup store → don't risk re-alerting the same review on every poll.
  if (!redis) return false;

  const key = reviewAlertSentKey(params.tenant.id, params.reviewId);
  const fresh = await redis.set(key, "1", { nx: true, ex: ALERT_TTL_SECONDS }).catch(() => null);
  if (!fresh) return false; // already alerted for this review

  const ok = await sendReviewNeedsReplyEmail({
    email,
    businessName: params.tenant.siteName,
    ownerName: params.tenant.ownerName?.trim() || undefined,
    review: params.review,
    reviewsUrl: params.reviewsUrl,
    draftedReply: params.draftedReply,
    ...links,
    tenantId: params.tenant.id,
    logPrefix: params.logPrefix,
  });

  // Suppressed (client pause) or failed — release the marker so a later poll
  // retries once email is live.
  if (!ok) await redis.del(key).catch(() => {});
  return ok;
}
