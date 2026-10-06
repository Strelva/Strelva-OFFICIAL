/**
 * Fictional publishing fixture for the local interface preview: The Mooney
 * Firm's Google listing, its receipts, a blog on the site and a newsletter.
 * It runs the same projection the workspace route runs
 * (addPublishingSystems). Nothing here is real data or a real grant.
 */
import { uuidFromSeed } from "@/platform/business-record/tenant-import";
import type { BusinessSystems } from "@/platform/systems/from-existing";
import type { PublishingSnapshot } from "@/products/publishing/projection";
import type { PreviewScenario } from "./fixture";
import { MOONEY_TENANT } from "./systems-fixture";

/** `on`: connected and working. `pending`: Google API access not granted yet.
 * `disconnected`: the grant is dead. `none`: never connected. */
export type PreviewPublishing = "off" | "on" | "pending" | "disconnected" | "none";

export function previewPublishingMode(value: string | undefined, released: boolean): PreviewPublishing {
  if (value === "on" || value === "off" || value === "pending" || value === "disconnected" || value === "none") return value;
  return released ? "on" : "off";
}

export function previewPublishingSnapshot(listing: BusinessSystems, scenario: PreviewScenario, mode: PreviewPublishing, now: number): PublishingSnapshot {
  const ago = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
  const site = listing.systems.find((item) => item.system.kind === "website" && item.references.tenantId === MOONEY_TENANT);
  const mooney = scenario.startsWith("mooney") && site?.references.tenantStableId;
  const never = mode === "none" || scenario === "mooney-empty" || !mooney;
  const bindingId = uuidFromSeed(`preview-binding:${listing.businessId}`);
  const status = mode === "disconnected" || scenario === "mooney-error" ? "needs_reauth" : "connected";
  return {
    businessId: listing.businessId,
    scope: scenario === "mooney-shared" ? "assigned" : "business",
    bindings: never ? [] : [{
      id: bindingId, workspaceId: listing.businessId, provider: "google", subject: null,
      originTenantStableId: site!.references.tenantStableId, originTenantId: MOONEY_TENANT,
      scopes: ["https://www.googleapis.com/auth/business.manage", "https://www.googleapis.com/auth/webmasters.readonly"],
      tokenExpiresAt: null, status, lastCheckedAt: ago(2), lastError: status === "connected" ? null : "Google refused the refresh token.",
      migratedFrom: "redis", createdAt: ago(24 * 30), updatedAt: ago(2),
      locations: [{ accountId: "accounts/100000000000000000001", locationId: "200000000000000000001", title: "The Mooney Firm", isPrimary: true }],
    }],
    receipts: never ? [] : [
      ...(mode === "pending" ? [{ id: uuidFromSeed("preview-receipt:pending"), bindingId, locationId: "200000000000000000001", action: "reply_post", status: "failed", error: "Google API access is still pending.", createdAt: ago(1), targetRef: "review-2" }] : []),
      { id: uuidFromSeed("preview-receipt:hours"), bindingId, locationId: "200000000000000000001", action: "hours_patch", status: "posted", error: null, createdAt: ago(20), targetRef: null },
      { id: uuidFromSeed("preview-receipt:reply"), bindingId, locationId: "200000000000000000001", action: "reply_post", status: "posted", error: null, createdAt: ago(30), targetRef: "review-1" },
      { id: uuidFromSeed("preview-receipt:post"), bindingId, locationId: "200000000000000000001", action: "post_create", status: "posted_unverified", error: null, createdAt: ago(50), targetRef: null },
    ],
  };
}

export function previewPublishingExtras(scenario: PreviewScenario) {
  if (!scenario.startsWith("mooney") || scenario === "mooney-empty") return { newsletters: [], collections: [] };
  return {
    newsletters: [{ tenantId: MOONEY_TENANT, activeSubscribers: 214 }],
    collections: [{ tenantId: MOONEY_TENANT, types: [{ type: "blog", published: 12, drafts: 1 }, { type: "video", published: 0, drafts: 0 }] }],
  };
}
