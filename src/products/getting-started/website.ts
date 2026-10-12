import type { BusinessRecord } from "@/platform/business-record/contracts";
import { normalizeWebsiteRebuildUrl } from "@/products/websites/rebuild-url";

/**
 * One website per business: the `website` entry of the business record's
 * `links` fact. Every surface that asks for a website reads it from here;
 * there is no second store.
 */

type Link = { kind: string; url: string; label?: string };

function links(record: Pick<BusinessRecord, "facts">): Link[] {
  const value = record.facts.links?.value;
  return Array.isArray(value) ? value.filter((item): item is Link => Boolean(item) && typeof item === "object" && typeof (item as Link).url === "string" && typeof (item as Link).kind === "string") : [];
}

export function businessWebsite(record: Pick<BusinessRecord, "facts">): string | null {
  return links(record).find(item => item.kind === "website")?.url ?? null;
}

/** A public http(s) address the record accepts, or null. Never throws. */
export function normalizeBusinessWebsite(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = normalizeWebsiteRebuildUrl(raw);
    return url.length >= 8 && url.length <= 2048 && /^https?:\/\/\S+$/.test(url) ? url : null;
  } catch { return null; }
}

/** Same site for reuse: host without `www.`, path without a trailing slash. */
export function sameWebsite(left: string | null, right: string | null): boolean {
  const key = (value: string | null) => {
    const normalized = normalizeBusinessWebsite(value);
    if (!normalized) return null;
    const url = new URL(normalized);
    return `${url.hostname.replace(/^www\./, "").toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  };
  const a = key(left);
  return a !== null && a === key(right);
}

/** The `links` value with this website as the business's one website, or null when already so. */
export function websiteLinks(record: Pick<BusinessRecord, "facts">, raw: string): Link[] | null {
  const url = normalizeBusinessWebsite(raw);
  if (!url) return null;
  const current = links(record);
  if (sameWebsite(businessWebsite(record), url)) return null;
  const others = current.filter(item => item.kind !== "website");
  return [{ kind: "website", url }, ...others].slice(0, 30);
}

/** A readable host for a name the owner can change, e.g. "northside-bakery.com". */
export function websiteHost(raw: string | null): string | null {
  const url = normalizeBusinessWebsite(raw);
  return url ? new URL(url).hostname.replace(/^www\./, "") : null;
}
