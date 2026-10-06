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

import { getConnection, saveConnection } from "./connections";
import { addEvent } from "./events";
import { sendSlackNotification } from "./slack";
import { getRedis } from "./redis";
import { refreshAccessToken } from "./google-token";
import { recordOutsideWrite, reviewReplyWrite } from "@/platform/operator-queue/receipts";

// The GBP write scope. New connections via /api/oauth/google already request
// business.manage; this constant is used for detection only.
export const GBP_WRITE_SCOPE = "https://www.googleapis.com/auth/business.manage";

// ─── Token helpers ────────────────────────────────────────────────────────────

async function getValidToken(tenantId: string): Promise<string | null> {
  const connection = await getConnection(tenantId, "google");
  if (!connection || connection.status !== "connected") return null;

  if (connection.expiresAt) {
    const buf = 5 * 60 * 1000;
    if (Date.now() + buf > new Date(connection.expiresAt).getTime()) {
      if (!connection.refreshToken) return null;
      const newToken = await refreshAccessToken(connection.refreshToken);
      if (newToken) {
        // Persist the refreshed token so subsequent operations within the
        // same connection's lifetime reuse it instead of re-refreshing.
        await saveConnection({
          ...connection,
          accessToken: newToken,
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        }).catch(() => {});
      }
      return newToken;
    }
  }
  return connection.accessToken;
}

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

async function fetchGBPMeta(
  tenantId: string
): Promise<{ accountId: string; locationId: string } | null> {
  const redis = getRedis();
  if (!redis) return null;
  const meta = await redis.get<{ accountId?: string; locationId?: string }>(
    `google-meta:${tenantId}`
  );
  if (!meta?.accountId || !meta?.locationId) return null;
  return { accountId: meta.accountId, locationId: meta.locationId };
}

function reviewReplyUrl(
  accountId: string,
  locationId: string,
  reviewId: string
): string {
  // GBP API v4 reviews.updateReply
  return `https://mybusiness.googleapis.com/v4/${accountId}/locations/${locationId}/reviews/${reviewId}/reply`;
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
 *
 * Every reply sent to Google leaves one outside-write receipt (accepted with
 * its read-back, rejected, or unknown). Checks that stop before the write
 * send nothing, so they leave no receipt. A failed receipt save is logged; it
 * never changes the result or re-sends the reply.
 */
export async function publishReviewReply(
  tenantId: string,
  reviewId: string,
  replyText: string,
  options: { actor?: string } = {}
): Promise<PublishReplyResult> {
  const actor = options.actor ?? "strelva";
  const checkedAt = new Date().toISOString();

  // ── Scope check ────────────────────────────────────────────────────────────
  const connection = await getConnection(tenantId, "google");
  if (!connection || connection.status !== "connected") {
    const evidence = `tenant=${tenantId} reviewId=${reviewId} error=no_connected_google_account`;
    await _emitFailure(tenantId, reviewId, evidence, checkedAt);
    return { published: false, verified: false, evidence };
  }

  if (!connectionHasWriteScope(connection.scopes)) {
    const evidence = `tenant=${tenantId} reviewId=${reviewId} error=missing_gbp_write_scope scope=${GBP_WRITE_SCOPE} requires_reconnect=true`;
    await _emitFailure(tenantId, reviewId, evidence, checkedAt);
    sendSlackNotification({
      text: `GBP reply BLOCKED for *${tenantId}* — connection is missing the \`business.manage\` write scope. The owner needs to reconnect Google in their dashboard.`,
    }).catch(() => {});
    return { published: false, verified: false, evidence };
  }

  // ── Fetch tokens + metadata ────────────────────────────────────────────────
  const accessToken = await getValidToken(tenantId);
  if (!accessToken) {
    const evidence = `tenant=${tenantId} reviewId=${reviewId} error=token_refresh_failed`;
    await _emitFailure(tenantId, reviewId, evidence, checkedAt);
    return { published: false, verified: false, evidence };
  }

  const meta = await fetchGBPMeta(tenantId);
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
    // The request may have reached Google: acceptance is unknown, not rejected.
    await recordOutsideWrite(reviewReplyWrite({ tenantId, reviewId, replyText, actor, outcome: { kind: "unknown", detail: "No response from Google (network error)." } }));
    return { published: false, verified: false, evidence };
  }

  if (!publishResult.ok) {
    const evidence = `tenant=${tenantId} reviewId=${reviewId} error=publish_api_error status=${publishResult.status} body=${publishResult.body.slice(0, 200)}`;
    await _emitFailure(tenantId, reviewId, evidence, checkedAt);
    await recordOutsideWrite(reviewReplyWrite({ tenantId, reviewId, replyText, actor, outcome: { kind: "rejected", detail: `Google answered ${publishResult.status}.` } }));
    return { published: false, verified: false, evidence };
  }

  // ── Read-back verification ─────────────────────────────────────────────────
  let verified = false;
  let evidence: string;
  let readbackError: string | undefined;

  try {
    const live = await getReply(accessToken, replyUrl);
    if (live?.comment) {
      // Normalise whitespace for comparison
      const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
      verified = normalize(live.comment) === normalize(replyText);
    } else {
      // Nothing came back: the reply can't be confirmed, which is a failed
      // read-back, not a mismatch.
      readbackError = "Google accepted the reply, but reading it back returned nothing.";
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
    readbackError = "Google accepted the reply but it could not be read back.";
    await _emitFailure(tenantId, reviewId, evidence, checkedAt);
  }

  await recordOutsideWrite(reviewReplyWrite({ tenantId, reviewId, replyText, actor, outcome: { kind: "accepted", verified, readbackError } }));

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
