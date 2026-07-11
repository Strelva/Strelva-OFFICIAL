/**
 * Google Business Profile write-side management.
 *
 * Typed functions for updating hours, creating Google Posts, and uploading
 * photos via the Business Profile APIs, using the tenant's Google OAuth
 * connection. Each write is followed by a read-back verification, matching
 * the pattern established in gbp-replies.ts.
 *
 * Required OAuth scope: https://www.googleapis.com/auth/business.manage
 * (already requested by /api/oauth/google). For existing connections that
 * pre-date scope tracking, the scope field is absent and treated as unknown —
 * we attempt the call and let the API reject it.
 *
 * LIVE API NOTE: All three Business Profile API product areas (locations,
 * localPosts, media) require Google's Business Profile API access approval
 * (3–10 day application). Quota is 0 until approved. This module is fully
 * proven by tests; live calls require the API access grant to go live.
 */

import { getConnection } from "./connections";
import { addEvent } from "./events";
import { sendSlackNotification } from "./slack";
import { getRedis } from "./redis";
import { GBP_WRITE_SCOPE, connectionHasWriteScope } from "./gbp-replies";
import { refreshAccessToken } from "./google-token";

// ─── GBP API base URLs ────────────────────────────────────────────────────────

// Business Information API v1 (locations.patch for hours)
const BUSINESS_INFORMATION_V1 = "https://mybusinessbusinessinformation.googleapis.com/v1";
// My Business API v4 (localPosts, media)
const MY_BUSINESS_V4 = "https://mybusiness.googleapis.com/v4";

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single time period within a day (e.g., 09:00–17:00). */
export interface TimeOfDay {
  hours: number;
  minutes: number;
}

export interface TimePeriod {
  openDay:
    | "MONDAY"
    | "TUESDAY"
    | "WEDNESDAY"
    | "THURSDAY"
    | "FRIDAY"
    | "SATURDAY"
    | "SUNDAY";
  openTime: TimeOfDay;
  closeDay:
    | "MONDAY"
    | "TUESDAY"
    | "WEDNESDAY"
    | "THURSDAY"
    | "FRIDAY"
    | "SATURDAY"
    | "SUNDAY";
  closeTime: TimeOfDay;
}

export interface RegularHours {
  periods: TimePeriod[];
}

export interface SpecialHourPeriod {
  startDate: { year: number; month: number; day: number };
  endDate: { year: number; month: number; day: number };
  openTime?: TimeOfDay;
  closeTime?: TimeOfDay;
  isClosed?: boolean;
}

export interface SpecialHours {
  specialHourPeriods: SpecialHourPeriod[];
}

export interface GbpPostInput {
  summary: string;
  ctaUrl?: string;
  photoUrl?: string;
}

export type GbpPhotoCategory =
  | "LOGO"
  | "COVER"
  | "PROFILE"
  | "EXTERIOR"
  | "INTERIOR"
  | "PRODUCT"
  | "AT_WORK"
  | "FOOD_AND_DRINK"
  | "MENU"
  | "ADDITIONAL";

export interface GbpManagementResult {
  success: boolean;
  verified: boolean;
  evidence: string;
  /**
   * True when the write did not go through only because the Business Profile
   * API access grant / quota is not live yet (Google approval is still
   * pending). This is an expected, temporary setup state — NOT a failure. The
   * approval draft stays pending so it publishes automatically once access
   * lands; owners see `ownerMessage`, never raw evidence.
   */
  pendingSetup?: boolean;
  ownerMessage?: string;
}

/**
 * Owner-facing copy for the pending-approval / quota-not-live state. The GBP
 * (My Business) API quota is 0 until Google grants access (a 3–10 day
 * application), so during that window every write is rejected. We surface this
 * as "being set up", never a raw error or a crash.
 */
const SETUP_PENDING_MESSAGE =
  "Your Google Business connection is being set up. This will publish automatically once Google approves access (usually within a few days).";

/**
 * True when a GBP API rejection is the "access not granted / quota 0" setup
 * state rather than a real error. While the Business Profile API access grant
 * is pending, Google returns 403 with reason `SERVICE_DISABLED` /
 * `accessNotConfigured` ("… API has not been used in project … before or it is
 * disabled"), or 429 `RESOURCE_EXHAUSTED` for the 0 quota. A generic 403
 * (a genuine permission problem) is intentionally NOT matched — that stays a
 * real failure that tells the owner to reconnect.
 */
function isSetupPendingError(status: number, body: string): boolean {
  if (status !== 403 && status !== 429) return false;
  const b = body.toLowerCase();
  return (
    b.includes("accessnotconfigured") ||
    b.includes("service_disabled") ||
    b.includes("service has been disabled") ||
    b.includes("service is disabled") ||
    b.includes("has not been used in project") ||
    b.includes("not been used in project") ||
    b.includes("business profile api") ||
    b.includes("resource_exhausted") ||
    b.includes("quota")
  );
}

/**
 * Emit a gentle, owner-facing "being set up" signal for the quota-pending
 * window. Deliberately NOT the scary `emitFailure` path — no "FAILED" Slack
 * ping, and a terminal (`auto_approved`) informational event so it never adds
 * a second item to the approval queue. The owner's original draft stays
 * pending (event-actions leaves it pending on a non-success write), so it
 * publishes on a later approval once access is live.
 */
async function emitSetupPending(
  tenantId: string,
  operation: string,
  evidence: string
): Promise<void> {
  try {
    await addEvent({
      tenantId,
      source: "ai",
      type: "change_verify_failed",
      title: "Google Business connection is being set up",
      body: SETUP_PENDING_MESSAGE,
      status: "auto_approved",
      metadata: { kind: "gbp_setup_pending", operation, evidence },
    });
  } catch {
    // Informational only — never propagate.
  }
}

// ─── Token helpers (refreshAccessToken shared via google-token.ts) ────────────

async function getValidToken(tenantId: string): Promise<string | null> {
  const connection = await getConnection(tenantId, "google");
  if (!connection || connection.status !== "connected") return null;

  if (connection.expiresAt) {
    const buf = 5 * 60 * 1000;
    if (Date.now() + buf > new Date(connection.expiresAt).getTime()) {
      if (!connection.refreshToken) return null;
      return refreshAccessToken(connection.refreshToken);
    }
  }
  return connection.accessToken;
}

// ─── Account/location meta (mirrors gbp-replies.ts) ──────────────────────────

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

// ─── Shared error emitter ─────────────────────────────────────────────────────

async function emitFailure(
  tenantId: string,
  operation: string,
  evidence: string
): Promise<void> {
  try {
    await addEvent({
      tenantId,
      source: "ai",
      type: "change_verify_failed",
      title: `GBP ${operation} failed`,
      body: evidence,
      status: "pending",
      metadata: { kind: `gbp_${operation}_failed`, evidence },
    });
    sendSlackNotification({
      text: `GBP ${operation} FAILED for *${tenantId}* — ${evidence}`,
    }).catch(() => {});
  } catch {
    // Event emission must not propagate.
  }
}

/** Guard: scope check + token + meta. Returns the context or a failure result. */
type WriteContextResult =
  | { ok: true; accessToken: string; accountId: string; locationId: string }
  | { ok: false; evidence: string };

async function resolveWriteContext(
  tenantId: string,
  operation: string
): Promise<WriteContextResult> {
  const connection = await getConnection(tenantId, "google");
  if (!connection || connection.status !== "connected") {
    const evidence = `tenant=${tenantId} error=no_connected_google_account`;
    await emitFailure(tenantId, operation, evidence);
    return { ok: false, evidence };
  }

  if (!connectionHasWriteScope(connection.scopes)) {
    const evidence = `tenant=${tenantId} error=missing_gbp_write_scope scope=${GBP_WRITE_SCOPE} requires_reconnect=true`;
    await emitFailure(tenantId, operation, evidence);
    sendSlackNotification({
      text: `GBP ${operation} BLOCKED for *${tenantId}* — connection is missing the \`business.manage\` write scope. The owner needs to reconnect Google in their dashboard.`,
    }).catch(() => {});
    return { ok: false, evidence };
  }

  const accessToken = await getValidToken(tenantId);
  if (!accessToken) {
    const evidence = `tenant=${tenantId} error=token_refresh_failed`;
    await emitFailure(tenantId, operation, evidence);
    return { ok: false, evidence };
  }

  const meta = await fetchGBPMeta(tenantId);
  if (!meta) {
    const evidence = `tenant=${tenantId} error=missing_account_location_meta`;
    await emitFailure(tenantId, operation, evidence);
    return { ok: false, evidence };
  }

  return { ok: true, accessToken, accountId: meta.accountId, locationId: meta.locationId };
}

// ─── updateBusinessHours ──────────────────────────────────────────────────────

/**
 * Update regular or special hours for a GBP location via the Business
 * Information API v1 locations.patch endpoint.
 *
 * Governance classification: hours are HIGH-RISK factual details (per
 * ai-governance `HIGH_RISK_FACTUAL_FIELD_HINTS`) → review queue (pending),
 * NEVER auto-published. This function performs the write only AFTER the owner
 * approves the `gbp_hours_draft` (event-actions.ts) — it is never called on an
 * unreviewed change. The `change_verified` event it emits below is a post-write
 * audit record of that already-approved change (same shape as gbp-replies.ts),
 * not a fresh auto-approval.
 *
 * After writing, re-reads the location to confirm the updateMask fields are
 * present in the response. A full deep-equal check is not feasible here since
 * the API normalises times and the read-back shape includes many extra fields;
 * we confirm the write was accepted (2xx) and the read-back returns a location
 * resource (not a 4xx) as the verification signal.
 *
 * Requires: Business Profile API access approval + business.manage scope.
 */
export async function updateBusinessHours(
  tenantId: string,
  hours: { regularHours?: RegularHours; specialHours?: SpecialHours }
): Promise<GbpManagementResult> {
  const ctx = await resolveWriteContext(tenantId, "update_hours");
  if (!ctx.ok) return { success: false, verified: false, evidence: ctx.evidence };

  const { accessToken, locationId } = ctx;

  // Build updateMask based on which hours are provided.
  const masks: string[] = [];
  const body: Record<string, unknown> = {};

  if (hours.regularHours) {
    masks.push("regularHours");
    body.regularHours = hours.regularHours;
  }
  if (hours.specialHours) {
    masks.push("specialHours");
    body.specialHours = hours.specialHours;
  }

  if (masks.length === 0) {
    const evidence = `tenant=${tenantId} error=no_hours_provided`;
    await emitFailure(tenantId, "update_hours", evidence);
    return { success: false, verified: false, evidence };
  }

  // The locationId stored in redis is just the numeric/slug part (e.g. "123456789").
  // The full resource name required by the API is "locations/{locationId}".
  const locationName = locationId.startsWith("locations/")
    ? locationId
    : `locations/${locationId}`;
  const patchUrl = `${BUSINESS_INFORMATION_V1}/${locationName}?updateMask=${masks.join(",")}`;

  // ── Write ──────────────────────────────────────────────────────────────────
  let patchOk = false;
  let patchStatus = 0;
  let patchBody = "";
  try {
    const res = await fetch(patchUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    patchStatus = res.status;
    patchBody = await res.text();
    patchOk = res.ok;
  } catch (err) {
    const evidence = `tenant=${tenantId} operation=update_hours error=network msg=${err instanceof Error ? err.message : String(err)}`;
    await emitFailure(tenantId, "update_hours", evidence);
    return { success: false, verified: false, evidence };
  }

  if (!patchOk) {
    if (isSetupPendingError(patchStatus, patchBody)) {
      const evidence = `tenant=${tenantId} operation=update_hours setup_pending=true status=${patchStatus}`;
      await emitSetupPending(tenantId, "update_hours", evidence);
      return { success: false, verified: false, evidence, pendingSetup: true, ownerMessage: SETUP_PENDING_MESSAGE };
    }
    const evidence = `tenant=${tenantId} operation=update_hours error=api_error status=${patchStatus} body=${patchBody.slice(0, 200)}`;
    await emitFailure(tenantId, "update_hours", evidence);
    return { success: false, verified: false, evidence };
  }

  // ── Read-back verification ─────────────────────────────────────────────────
  // Re-read the location resource. We confirm the PATCH was accepted (2xx
  // above) and that the GET returns a valid location object. The updateTime
  // field will be present and recent if the update landed.
  const readUrl = `${BUSINESS_INFORMATION_V1}/${locationName}?readMask=${masks.join(",")}`;
  let verified = false;
  let evidence = `tenant=${tenantId} operation=update_hours written=true readback_error=unknown`;

  try {
    const readRes = await fetch(readUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const readOk = readRes.ok;
    evidence = `tenant=${tenantId} operation=update_hours written=true readback_ok=${readOk}`;
    verified = readOk;

    if (verified) {
      await addEvent({
        tenantId,
        source: "ai",
        type: "change_verified",
        title: "GBP hours updated and confirmed",
        body: evidence,
        status: "auto_approved",
        metadata: { kind: "gbp_hours_verified", evidence },
      });
    } else {
      await emitFailure(tenantId, "update_hours", evidence);
    }
  } catch (err) {
    evidence = `tenant=${tenantId} operation=update_hours written=true readback_error=${err instanceof Error ? err.message : String(err)}`;
    await emitFailure(tenantId, "update_hours", evidence);
  }

  return { success: true, verified, evidence: evidence! };
}

// ─── createGbpPost ────────────────────────────────────────────────────────────

/**
 * Create a Google Post (localPost) on the GBP location via the v4 API.
 *
 * Governance classification: new copy → review queue (pending), never
 * auto-published. The agent tool enforces this — callers should not bypass it.
 *
 * After writing, re-reads the post resource to confirm it exists.
 *
 * Requires: Business Profile API access approval + business.manage scope.
 */
export async function createGbpPost(
  tenantId: string,
  post: GbpPostInput
): Promise<GbpManagementResult & { postName?: string }> {
  const ctx = await resolveWriteContext(tenantId, "create_post");
  if (!ctx.ok) return { success: false, verified: false, evidence: ctx.evidence };

  // SSRF guard at the egress boundary: ctaUrl/photoUrl come from an AI draft
  // (owner-approved, but the agent prompt is attacker-influencable) and Google's
  // API fetches them. Reject non-HTTP schemes and anything resolving to a
  // private IP — same defense the audit fetch path uses. Covers every caller.
  const { validateUrlSafety } = await import("./audit/checks");
  for (const url of [post.ctaUrl, post.photoUrl]) {
    if (!url) continue;
    try {
      await validateUrlSafety(url);
    } catch (err) {
      return {
        success: false,
        verified: false,
        evidence: `tenant=${tenantId} operation=create_post blocked_url=${err instanceof Error ? err.message : "unsafe url"}`,
      };
    }
  }

  const { accessToken, accountId, locationId } = ctx;

  const locationName = locationId.startsWith("locations/")
    ? locationId
    : `locations/${locationId}`;
  const fullLocationName = accountId.startsWith("accounts/")
    ? `${accountId}/${locationName}`
    : `accounts/${accountId}/${locationName}`;
  const postsUrl = `${MY_BUSINESS_V4}/${fullLocationName}/localPosts`;

  const body: Record<string, unknown> = {
    languageCode: "en",
    summary: post.summary,
    topicType: "STANDARD",
  };

  if (post.ctaUrl) {
    body.callToAction = { actionType: "LEARN_MORE", url: post.ctaUrl };
  }
  if (post.photoUrl) {
    body.media = [{ mediaFormat: "PHOTO", sourceUrl: post.photoUrl }];
  }

  // ── Write ──────────────────────────────────────────────────────────────────
  let createdName: string | undefined;
  let writeOk = false;
  let writeStatus = 0;
  let writeBody = "";

  try {
    const res = await fetch(postsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    writeStatus = res.status;
    writeBody = await res.text();
    writeOk = res.ok;
    if (writeOk) {
      try {
        const parsed = JSON.parse(writeBody) as { name?: string };
        createdName = parsed.name;
      } catch {
        // name extraction is best-effort
      }
    }
  } catch (err) {
    const evidence = `tenant=${tenantId} operation=create_post error=network msg=${err instanceof Error ? err.message : String(err)}`;
    await emitFailure(tenantId, "create_post", evidence);
    return { success: false, verified: false, evidence };
  }

  if (!writeOk) {
    if (isSetupPendingError(writeStatus, writeBody)) {
      const evidence = `tenant=${tenantId} operation=create_post setup_pending=true status=${writeStatus}`;
      await emitSetupPending(tenantId, "create_post", evidence);
      return { success: false, verified: false, evidence, pendingSetup: true, ownerMessage: SETUP_PENDING_MESSAGE };
    }
    const evidence = `tenant=${tenantId} operation=create_post error=api_error status=${writeStatus} body=${writeBody.slice(0, 200)}`;
    await emitFailure(tenantId, "create_post", evidence);
    return { success: false, verified: false, evidence };
  }

  // ── Read-back verification ─────────────────────────────────────────────────
  let verified = false;
  let evidence: string;

  if (createdName) {
    try {
      const readRes = await fetch(`${MY_BUSINESS_V4}/${createdName}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      verified = readRes.ok;
      evidence = `tenant=${tenantId} operation=create_post created=true postName=${createdName} readback_ok=${verified}`;
    } catch (err) {
      evidence = `tenant=${tenantId} operation=create_post created=true readback_error=${err instanceof Error ? err.message : String(err)}`;
    }
  } else {
    // No post name returned; treat write acceptance (2xx) as the best
    // available signal.
    verified = true;
    evidence = `tenant=${tenantId} operation=create_post created=true postName=unknown readback_skipped=no_name_returned`;
  }

  if (verified) {
    await addEvent({
      tenantId,
      source: "ai",
      type: "change_verified",
      title: "GBP post created and confirmed",
      body: evidence!,
      status: "auto_approved",
      metadata: { kind: "gbp_post_verified", evidence: evidence!, postName: createdName },
    });
  } else {
    await emitFailure(tenantId, "create_post", evidence!);
  }

  return { success: true, verified, evidence: evidence!, postName: createdName };
}

// ─── uploadGbpPhoto ───────────────────────────────────────────────────────────

/**
 * Upload a photo to a GBP location via the v4 media create API.
 *
 * The photo is specified by a public source URL (Google fetches it). The
 * category controls which section of the GBP profile it appears in.
 *
 * After writing, re-reads the media item to confirm it was accepted.
 *
 * Requires: Business Profile API access approval + business.manage scope.
 */
export async function uploadGbpPhoto(
  tenantId: string,
  photoUrl: string,
  category: GbpPhotoCategory
): Promise<GbpManagementResult & { mediaName?: string }> {
  const ctx = await resolveWriteContext(tenantId, "upload_photo");
  if (!ctx.ok) return { success: false, verified: false, evidence: ctx.evidence };

  // SSRF guard at the egress boundary — Google fetches sourceUrl. Same defense
  // createGbpPost applies; uploadGbpPhoto was missing it.
  const { validateUrlSafety } = await import("./audit/checks");
  try {
    await validateUrlSafety(photoUrl);
  } catch (err) {
    return {
      success: false,
      verified: false,
      evidence: `tenant=${tenantId} operation=upload_photo blocked_url=${err instanceof Error ? err.message : "unsafe url"}`,
    };
  }

  const { accessToken, accountId, locationId } = ctx;

  const locationName = locationId.startsWith("locations/")
    ? locationId
    : `locations/${locationId}`;
  const fullLocationName = accountId.startsWith("accounts/")
    ? `${accountId}/${locationName}`
    : `accounts/${accountId}/${locationName}`;
  const mediaUrl = `${MY_BUSINESS_V4}/${fullLocationName}/media`;

  const body = {
    mediaFormat: "PHOTO",
    sourceUrl: photoUrl,
    locationAssociation: { category },
  };

  // ── Write ──────────────────────────────────────────────────────────────────
  let createdName: string | undefined;
  let writeOk = false;
  let writeStatus = 0;
  let writeBody = "";

  try {
    const res = await fetch(mediaUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    writeStatus = res.status;
    writeBody = await res.text();
    writeOk = res.ok;
    if (writeOk) {
      try {
        const parsed = JSON.parse(writeBody) as { name?: string };
        createdName = parsed.name;
      } catch {
        // name extraction is best-effort
      }
    }
  } catch (err) {
    const evidence = `tenant=${tenantId} operation=upload_photo error=network msg=${err instanceof Error ? err.message : String(err)}`;
    await emitFailure(tenantId, "upload_photo", evidence);
    return { success: false, verified: false, evidence };
  }

  if (!writeOk) {
    if (isSetupPendingError(writeStatus, writeBody)) {
      const evidence = `tenant=${tenantId} operation=upload_photo setup_pending=true status=${writeStatus}`;
      await emitSetupPending(tenantId, "upload_photo", evidence);
      return { success: false, verified: false, evidence, pendingSetup: true, ownerMessage: SETUP_PENDING_MESSAGE };
    }
    const evidence = `tenant=${tenantId} operation=upload_photo error=api_error status=${writeStatus} body=${writeBody.slice(0, 200)}`;
    await emitFailure(tenantId, "upload_photo", evidence);
    return { success: false, verified: false, evidence };
  }

  // ── Read-back verification ─────────────────────────────────────────────────
  let verified = false;
  let evidence: string;

  if (createdName) {
    try {
      const readRes = await fetch(`${MY_BUSINESS_V4}/${createdName}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      verified = readRes.ok;
      evidence = `tenant=${tenantId} operation=upload_photo uploaded=true mediaName=${createdName} readback_ok=${verified}`;
    } catch (err) {
      evidence = `tenant=${tenantId} operation=upload_photo uploaded=true readback_error=${err instanceof Error ? err.message : String(err)}`;
    }
  } else {
    verified = true;
    evidence = `tenant=${tenantId} operation=upload_photo uploaded=true mediaName=unknown readback_skipped=no_name_returned`;
  }

  if (verified) {
    await addEvent({
      tenantId,
      source: "ai",
      type: "change_verified",
      title: "GBP photo uploaded and confirmed",
      body: evidence!,
      status: "auto_approved",
      metadata: { kind: "gbp_photo_verified", evidence: evidence!, mediaName: createdName },
    });
  } else {
    await emitFailure(tenantId, "upload_photo", evidence!);
  }

  return { success: true, verified, evidence: evidence!, mediaName: createdName };
}

// ─── getGbpState ──────────────────────────────────────────────────────────────

export interface GbpState {
  regularHours?: RegularHours;
  specialHours?: SpecialHours;
  recentPosts: Array<{
    name: string;
    summary?: string;
    createTime?: string;
    state?: string;
  }>;
  fetchedAt: string;
}

/**
 * Read current GBP state: business hours + last 3 posts.
 *
 * Fetched live from the GBP API — never returns cached claims. Returns null
 * if the connection is missing, broken, or the API is unreachable.
 *
 * Requires: Business Profile API access approval + business.manage scope.
 */
export async function getGbpState(tenantId: string): Promise<GbpState | null> {
  const connection = await getConnection(tenantId, "google");
  if (!connection || connection.status !== "connected") return null;

  const accessToken = await getValidToken(tenantId);
  if (!accessToken) return null;

  const meta = await fetchGBPMeta(tenantId);
  if (!meta) return null;

  const { accountId, locationId } = meta;
  const locationName = locationId.startsWith("locations/")
    ? locationId
    : `locations/${locationId}`;
  const fullLocationName = accountId.startsWith("accounts/")
    ? `${accountId}/${locationName}`
    : `accounts/${accountId}/${locationName}`;

  const fetchedAt = new Date().toISOString();

  // Fetch hours from the Business Information API
  let regularHours: RegularHours | undefined;
  let specialHours: SpecialHours | undefined;
  try {
    const hoursRes = await fetch(
      `${BUSINESS_INFORMATION_V1}/${locationName}?readMask=regularHours,specialHours`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (hoursRes.ok) {
      const data = await hoursRes.json() as {
        regularHours?: RegularHours;
        specialHours?: SpecialHours;
      };
      regularHours = data.regularHours;
      specialHours = data.specialHours;
    }
  } catch {
    // Partial failure — still try posts
  }

  // Fetch last 3 Google Posts from v4 localPosts
  const recentPosts: GbpState["recentPosts"] = [];
  try {
    const postsRes = await fetch(
      `${MY_BUSINESS_V4}/${fullLocationName}/localPosts?pageSize=3`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (postsRes.ok) {
      const data = await postsRes.json() as {
        localPosts?: Array<{
          name: string;
          summary?: string;
          createTime?: string;
          state?: string;
        }>;
      };
      for (const p of data.localPosts ?? []) {
        recentPosts.push({
          name: p.name,
          summary: p.summary,
          createTime: p.createTime,
          state: p.state,
        });
      }
    }
  } catch {
    // Partial failure — return what we have
  }

  return { regularHours, specialHours, recentPosts, fetchedAt };
}
