/**
 * Verified-live receipt module.
 *
 * After Strelva publishes a change to a section, `verifyContentLive` re-reads
 * the content via the same path the public v1 route uses (bypassing the Redis
 * cache so we hit the source of truth), compares a stable fingerprint against
 * the expected payload, and returns a structured result.
 *
 * `scheduleVerification` is the fire-and-forget entry point called by write
 * paths (the authenticated PUT route and the agent's update_section tool).
 * It always emits one of two events: `change_verified` or `change_verify_failed`.
 * Failures also trigger a Slack ping so Jacob can see them immediately.
 */

import type { ContentSection } from "./types";
import { getContent } from "./storage/content-store";
import { addEvent } from "./events";
import { sendSlackNotification } from "./slack";

export interface VerifyLiveResult {
  verified: boolean;
  checkedAt: string;
  /** Human-readable description of what was checked. */
  evidence: string;
}

/**
 * Re-fetch the section from the source of truth (bypasses Redis cache via
 * `invalidateCachedContent` so the next `getContent` call reads Sanity / dev
 * file directly) and compare a stable fingerprint.
 *
 * The fingerprint is a JSON serialisation of the saved payload. Deep equality
 * is the most reliable signal because we don't have a per-write version counter
 * exposed on the public path — `updatedAt` / `_rev` live inside Sanity and are
 * stripped by `transformSanityImages`. The full payload comparison is bounded:
 * sections are small (hero, services, contact, etc.) and we only stringify once.
 */
export async function verifyContentLive(
  tenantId: string,
  section: ContentSection,
  expected: Record<string, unknown>
): Promise<VerifyLiveResult> {
  const checkedAt = new Date().toISOString();

  try {
    // Invalidate the Redis cache for this section so getContent reads straight
    // from the source of truth on the next call.
    const { invalidateCachedContent } = await import("./storage/content-cache");
    await invalidateCachedContent(section, tenantId);

    const live = await getContent(section, tenantId);

    const expectedJson = stableSerialise(expected);
    const liveJson = stableSerialise(live as unknown as Record<string, unknown>);
    const verified = expectedJson === liveJson;

    return {
      verified,
      checkedAt,
      evidence: `section=${section} tenant=${tenantId} match=${verified}`,
    };
  } catch (err) {
    return {
      verified: false,
      checkedAt,
      evidence: `section=${section} tenant=${tenantId} fetch-error=${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Serialise an object with sorted keys so two payloads with the same data but
 * different insertion-order keys compare equal.
 */
function stableSerialise(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * Fire-and-forget verification. Call this immediately after a successful
 * content write. The callback never throws — errors are captured, an event is
 * emitted either way, and failures get a Slack ping.
 */
export function scheduleVerification(
  tenantId: string,
  section: ContentSection,
  expected: Record<string, unknown>
): void {
  // Deliberately not awaited — the caller's response path is unblocked.
  void runVerification(tenantId, section, expected).catch((err) => {
    // This outer catch should never fire (runVerification swallows its own
    // errors), but belt-and-suspenders: log rather than crash.
    console.error("[verify-live] unexpected outer error", tenantId, section, err);
  });
}

async function runVerification(
  tenantId: string,
  section: ContentSection,
  expected: Record<string, unknown>
): Promise<void> {
  let result: VerifyLiveResult;
  try {
    result = await verifyContentLive(tenantId, section, expected);
  } catch (err) {
    result = {
      verified: false,
      checkedAt: new Date().toISOString(),
      evidence: `section=${section} tenant=${tenantId} runner-error=${err instanceof Error ? err.message : String(err)}`,
    };
  }

  try {
    if (result.verified) {
      await addEvent({
        tenantId,
        source: "ai",
        type: "change_verified",
        title: `${section} update verified live`,
        body: result.evidence,
        status: "auto_approved",
        metadata: {
          section,
          checkedAt: result.checkedAt,
          evidence: result.evidence,
        },
      });
    } else {
      await addEvent({
        tenantId,
        source: "ai",
        type: "change_verify_failed",
        title: `${section} update could not be confirmed live`,
        body: result.evidence,
        status: "pending",
        metadata: {
          section,
          checkedAt: result.checkedAt,
          evidence: result.evidence,
        },
      });

      // Surface failures to Jacob immediately via Slack.
      sendSlackNotification({
        text: `Verify-live FAILED for *${section}* (${tenantId}) — ${result.evidence}`,
      }).catch(() => {});
    }
  } catch (err) {
    // Event persistence errors must not propagate and crash caller code.
    console.error("[verify-live] event emission failed", tenantId, section, err);
  }
}
