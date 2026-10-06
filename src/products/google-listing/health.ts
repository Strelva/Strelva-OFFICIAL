import type { Observation } from "@/platform/system-health/contracts";
import type { AccountBinding } from "@/platform/account-bindings/contracts";
import type { ListingHealth, ListingReceipt } from "./contracts";

/**
 * Listing health, separate from lifecycle (spec section 4). A disconnected
 * grant changes health, never the lifecycle: drafts stay, nothing posts.
 */

export const GBP_MANAGE_SCOPE = "https://www.googleapis.com/auth/business.manage";
export const LISTING_STALE_MS = 48 * 60 * 60 * 1000;
const ACCESS_PENDING = "Google API access is still pending";

const MESSAGES: Record<ListingHealth, string> = {
  ok: "Google listing read recently.",
  google_disconnected: "Google disconnected. Reconnect Google so replies and changes can go out.",
  scope_missing: "Reconnect Google to let Strelva post.",
  api_access_pending: "Google access pending. Replies and changes wait until Google approves.",
  edits_pending: "Google is reviewing a change.",
  profile_suspended: "Google suspended this profile.",
  stale: "Strelva hasn't read this listing from Google in 48 hours.",
};

export interface ListingHealthInput {
  binding: Pick<AccountBinding, "status" | "scopes" | "lastCheckedAt">;
  /** Newest first. */
  receipts: readonly Pick<ListingReceipt, "status" | "error" | "createdAt">[];
  suspended?: boolean;
  now?: number;
}

export function listingHealth(input: ListingHealthInput): { health: ListingHealth; message: string } {
  const now = input.now ?? Date.now();
  const pick = (health: ListingHealth) => ({ health, message: MESSAGES[health] });
  if (input.binding.status === "needs_reauth" || input.binding.status === "revoked") return pick("google_disconnected");
  if (input.suspended) return pick("profile_suspended");
  // Null scopes: connected before scope tracking. Attempt, don't block.
  if (input.binding.scopes && !input.binding.scopes.includes(GBP_MANAGE_SCOPE)) return pick("scope_missing");
  const latest = input.receipts[0];
  if (latest?.status === "failed" && latest.error?.startsWith(ACCESS_PENDING)) return pick("api_access_pending");
  if (input.receipts.some((receipt) => receipt.status === "held_by_google")) return pick("edits_pending");
  const checked = input.binding.lastCheckedAt ? Date.parse(input.binding.lastCheckedAt) : NaN;
  if (input.binding.status === "error" || !Number.isFinite(checked) || now - checked > LISTING_STALE_MS) return pick("stale");
  return pick("ok");
}

/** The same verdict as health evidence for the System health graph. */
export function listingObservation(subjectId: string, input: ListingHealthInput): Observation {
  const { health, message } = listingHealth(input);
  const base = { subjectId, signal: "google.listing", source: "integration-connection" as const, maxAgeSeconds: LISTING_STALE_MS / 1000, message };
  const observedAt = input.binding.lastCheckedAt;
  switch (health) {
    case "ok": return { ...base, outcome: "pass", observedAt };
    case "google_disconnected":
    case "scope_missing":
    case "profile_suspended":
      return { ...base, outcome: "fail", impact: "blocking", observedAt: new Date(input.now ?? Date.now()).toISOString() };
    case "api_access_pending":
    case "edits_pending":
      return { ...base, outcome: "warn", observedAt: observedAt ?? new Date(input.now ?? Date.now()).toISOString() };
    case "stale":
      return { ...base, outcome: "unknown", observedAt };
  }
}
