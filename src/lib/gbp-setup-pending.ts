/**
 * The Business Profile API quota is 0 until Google grants access (a 3-10 day
 * application). While that is pending every write is rejected, and that must
 * read as "waiting on Google", not as a failure: no Slack FAILED, no error page.
 * Shared by gbp-management (hours, posts, photos) and gbp-replies.
 */
import { addEvent } from "./events";

/**
 * Owner-facing copy for the pending-approval / quota-not-live state. The GBP
 * (My Business) API quota is 0 until Google grants access (a 3–10 day
 * application), so during that window every write is rejected. We surface this
 * as "being set up", never a raw error or a crash.
 */
export const SETUP_PENDING_MESSAGE =
  "Google hasn't approved Strelva's Business Profile access yet, so nothing was posted. The change stays in Needs you; approve it again once Google approves.";

/**
 * True when a GBP API rejection is the "access not granted / quota 0" setup
 * state rather than a real error. While the Business Profile API access grant
 * is pending, Google returns 403 with reason `SERVICE_DISABLED` /
 * `accessNotConfigured` ("… API has not been used in project … before or it is
 * disabled"), or 429 `RESOURCE_EXHAUSTED` for the 0 quota. A generic 403
 * (a genuine permission problem) is intentionally NOT matched — that stays a
 * real failure that tells the owner to reconnect.
 */
export function isSetupPendingError(status: number, body: string): boolean {
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
 * True only when Strelva has been told Google's approval is pending
 * (ADR 0016's STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE=pending), so
 * nothing changes by default. src/lib reads the same variable
 * platform/connections/access.ts does; it cannot import that layer.
 */
export function googleBusinessProfileApprovalPending(env: Record<string, string | undefined> = process.env): boolean {
  return env.STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE === "pending";
}

/**
 * Emit a gentle, owner-facing "being set up" signal for the quota-pending
 * window. Deliberately NOT the scary `emitFailure` path — no "FAILED" Slack
 * ping, and a terminal (`auto_approved`) informational event so it never adds
 * a second item to the approval queue. The owner's original draft stays
 * pending (event-actions leaves it pending on a non-success write), so it
 * publishes on a later approval once access is live.
 */
export async function emitSetupPending(
  tenantId: string,
  operation: string,
  evidence: string
): Promise<void> {
  try {
    await addEvent({
      tenantId,
      source: "ai",
      type: "change_verify_failed",
      title: "Waiting on Google",
      body: SETUP_PENDING_MESSAGE,
      status: "auto_approved",
      metadata: { kind: "gbp_setup_pending", operation, evidence },
    });
  } catch {
    // Informational only — never propagate.
  }
}
