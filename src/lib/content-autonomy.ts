/**
 * Content autonomy — how much the owner lets Strelva just handle.
 *
 * The client-facing counterpart to the operator-only earned-trust streak
 * (`autoApproveThreshold`). Same shape as the reviews `ReplyVoice` mode: the owner
 * opts in, and it's stored as one JSON blob in Redis (`reb:content-autonomy:{tenant}`).
 *
 * SAFETY: this ONLY governs low-risk COPY on low-risk sections. The rails in
 * `maybeAutoApprove` are unchanged — high-risk facts (booking/payment links, prices,
 * hours, address, phone, email) NEVER auto-publish, on any mode. "auto" buys faster
 * routine copy edits, never money/contact details.
 */
import { getRedis } from "./redis";

export type ContentAutonomy = "auto" | "approve";

/** The safe default: the owner approves changes before they go live. */
export const DEFAULT_CONTENT_AUTONOMY: ContentAutonomy = "approve";

function key(tenantId: string): string {
  return `reb:content-autonomy:${tenantId}`;
}

export async function getContentAutonomy(tenantId: string): Promise<ContentAutonomy> {
  const redis = getRedis();
  if (!redis) return DEFAULT_CONTENT_AUTONOMY;
  try {
    const stored = await redis.get<string>(key(tenantId));
    return stored === "auto" ? "auto" : DEFAULT_CONTENT_AUTONOMY;
  } catch {
    return DEFAULT_CONTENT_AUTONOMY;
  }
}

export async function saveContentAutonomy(tenantId: string, mode: ContentAutonomy): Promise<ContentAutonomy> {
  const value: ContentAutonomy = mode === "auto" ? "auto" : "approve";
  const redis = getRedis();
  if (redis) await redis.set(key(tenantId), value);
  return value;
}
