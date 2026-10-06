/**
 * Google Business Profile reply publishing and read-back verification.
 *
 * Uses the GBP reviews.updateReply API to write an approved reply, then
 * immediately re-reads the reply from the API to confirm it is live.
 * Silent GBP rejections are the primary failure mode this guards against.
 *
 * Required OAuth scope: https://www.googleapis.com/auth/business.manage
 * (already requested by /api/oauth/google). For existing connections that
 * pre-date this requirement the scope will be absent; we detect and surface
 * that as an error event + Slack ping rather than silently failing.
 */

import { addEvent } from "./events";
import { sendSlackNotification } from "./slack";
import { getGoogleGrant, getGoogleLocation, getValidGoogleAccessToken } from "./google-access";

// The GBP write scope. New connections via /api/oauth/google already request
// business.manage; this constant is used for detection only.
export const GBP_WRITE_SCOPE = "https://www.googleapis.com/auth/business.manage";

// ─── Scope detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the stored connection has the GBP write scope.
 * Connections that pre-date scope tracking (scopes field absent) are treated
 * as "scope unknown" — we attempt the call and let the API reject it rather
 * than blocking prematurely.
 */
export function connectionHasWriteScope(
  scopes: string[] | undefined
): boolean {
  if (!scopes) return true; // unknown: attempt the call
  return scopes.includes(GBP_WRITE_SCOPE);
}

// ─── GBP API helpers ──────────────────────────────────────────────────────────

interface GBPReply {
  comment: string;
  updateTime?: string;
}

function reviewReplyUrl(
  accountId: string,
  locationId: string,
  reviewId: string
): string {
  // GBP API v4 reviews.updateReply. google-meta stores "accounts/123"; accept a bare id too.
  const account = accountId.startsWith("accounts/") ? accountId : `accounts/${accountId}`;
  return `https://mybusiness.googleapis.com/v4/${account}/locations/${locationId}/reviews/${reviewId}/reply`;
}

async function putReply(
  accessToken: string,
  url: string,
  text: string
): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ comment: text }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

async function getReply(
  accessToken: string,
  url: string
): Promise<GBPReply | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    // The reply is nested: data.reviewReply.comment
    if (data?.reviewReply?.comment) {
      return data.reviewReply as GBPReply;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface PublishReplyResult {
  published: boolean;
  verified: boolean;
  evidence: string;
}

/**
 * Publish an approved reply to a Google review via the GBP API and
 * immediately read it back to confirm it is live.
 *
 * On success, emits `change_verified` event.
 * On mismatch or missing scope, emits `change_verify_failed` + Slack ping.
 *
 * Never throws — errors are captured, surfaced as events, and returned
 * in the result so the caller can respond appropriately.
 */
export async function publishReviewReply(
  tenantId: string,
  reviewId: string,
  replyText: string
): Promise<PublishReplyResult> {
  const checkedAt = new Date().toISOString();

  // ── Scope check ────────────────────────────────────────────────────────────
  const grant = await getGoogleGrant(tenantId);
  if (!grant || grant.status !== "connected") {
    const evidence = `tenant=${tenantId} reviewId=${reviewId} error=no_connected_google_account`;
    await _emitFailure(tenantId, reviewId, evidence, checkedAt);
    return { published: false, verified: false, evidence };
  }

  if (!connectionHasWriteScope(grant.scopes)) {
    const evidence = `tenant=${tenantId} reviewId=${reviewId} error=missing_gbp_write_scope scope=${GBP_WRITE_SCOPE} requires_reconnect=true`;
    await _emitFailure(tenantId, reviewId, evidence, checkedAt);
    sendSlackNotification({
      text: `GBP reply BLOCKED for *${tenantId}* — connection is missing the \`business.manage\` write scope. The owner needs to reconnect Google in their dashboard.`,
    }).catch(() => {});
    return { published: false, verified: false, evidence };
  }

  // ── Fetch tokens + metadata ────────────────────────────────────────────────
  const accessToken = await getValidGoogleAccessToken(grant);
  if (!accessToken) {
    const evidence = `tenant=${tenantId} reviewId=${reviewId} error=token_refresh_failed`;
    await _emitFailure(tenantId, reviewId, evidence, checkedAt);
    return { published: false, verified: false, evidence };
  }

  const meta = await getGoogleLocation(tenantId, grant);
  if (!meta) {
    const evidence = `tenant=${tenantId} reviewId=${reviewId} error=missing_account_location_meta`;
    await _emitFailure(tenantId, reviewId, evidence, checkedAt);
    return { published: false, verified: false, evidence };
  }

  const replyUrl = reviewReplyUrl(meta.accountId, meta.locationId, reviewId);

  // ── Publish ────────────────────────────────────────────────────────────────
  let publishResult: { ok: boolean; status: number; body: string };
  try {
    publishResult = await putReply(accessToken, replyUrl, replyText);
  } catch (err) {
    const evidence = `tenant=${tenantId} reviewId=${reviewId} error=publish_network_error msg=${err instanceof Error ? err.message : String(err)}`;
    await _emitFailure(tenantId, reviewId, evidence, checkedAt);
    return { published: false, verified: false, evidence };
  }

  if (!publishResult.ok) {
    const evidence = `tenant=${tenantId} reviewId=${reviewId} error=publish_api_error status=${publishResult.status} body=${publishResult.body.slice(0, 200)}`;
    await _emitFailure(tenantId, reviewId, evidence, checkedAt);
    return { published: false, verified: false, evidence };
  }

  // ── Read-back verification ─────────────────────────────────────────────────
  let verified = false;
  let evidence: string;

  try {
    const live = await getReply(accessToken, replyUrl);
    if (live?.comment) {
      // Normalise whitespace for comparison
      const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
      verified = normalize(live.comment) === normalize(replyText);
    }

    evidence = `tenant=${tenantId} reviewId=${reviewId} published=true verified=${verified} checkedAt=${checkedAt}`;

    if (verified) {
      await addEvent({
        tenantId,
        source: "ai",
        type: "change_verified",
        title: `Review reply published and confirmed live`,
        body: evidence,
        status: "auto_approved",
        metadata: {
          kind: "review_reply_verified",
          reviewId,
          checkedAt,
          evidence,
        },
      });
    } else {
      await _emitFailure(tenantId, reviewId, evidence, checkedAt);
    }
  } catch (err) {
    evidence = `tenant=${tenantId} reviewId=${reviewId} published=true verified=false readback_error=${err instanceof Error ? err.message : String(err)}`;
    await _emitFailure(tenantId, reviewId, evidence, checkedAt);
  }

  return { published: true, verified, evidence };
}

async function _emitFailure(
  tenantId: string,
  reviewId: string,
  evidence: string,
  checkedAt: string
): Promise<void> {
  try {
    await addEvent({
      tenantId,
      source: "ai",
      type: "change_verify_failed",
      title: `Review reply publish or verification failed`,
      body: evidence,
      status: "pending",
      metadata: {
        kind: "review_reply_verify_failed",
        reviewAudience: "operator",
        reviewId,
        checkedAt,
        evidence,
      },
    });

    sendSlackNotification({
      text: `Review reply FAILED for *${tenantId}* (reviewId=${reviewId}) — ${evidence}`,
    }).catch(() => {});
  } catch {
    // Event emission errors must not propagate.
  }
}
