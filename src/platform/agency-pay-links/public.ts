import { getRedisPayLink, normalizePayLinkSlug, type PayLinkConfig } from "@/platform/infra/pay-links";
import { readPublicAgencyPayLink, toLegacyPayLinkConfig } from "./index";
import { agencyPayLinksEnabled, payLinkStore } from "./release";
import type { AgencyPayLink } from "./types";

export type PublicPayLink = { kind: "connected"; link: AgencyPayLink } | { kind: "legacy"; config: PayLinkConfig };

/**
 * One lookup for the public page and checkout. Connected links need their switch;
 * legacy links come from Redis until the backfill is verified and the store is switched.
 */
export async function resolvePublicPayLink(rawSlug: string): Promise<PublicPayLink | null> {
  const slug = normalizePayLinkSlug(rawSlug);
  if (!slug || slug === "index") return null;
  if (agencyPayLinksEnabled() || payLinkStore() === "postgres") {
    const row = await readPublicAgencyPayLink(slug).catch(() => null);
    if (row?.rail === "connected_account") return agencyPayLinksEnabled() ? { kind: "connected", link: row } : null;
    if (row?.rail === "platform_legacy" && payLinkStore() === "postgres") return { kind: "legacy", config: toLegacyPayLinkConfig(row) };
  }
  if (payLinkStore() === "redis") {
    const config = await getRedisPayLink(slug);
    if (config) return { kind: "legacy", config };
  }
  return null;
}
