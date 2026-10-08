import { fetchPinnedPublicText } from "@/lib/pinned-public-text";
export interface HostedWebsiteHealthTarget { workspaceId: string; workId: string; tenantId: string; revision: number; contentHash: string; url: string }
export interface WebsiteHealthReceipt extends HostedWebsiteHealthTarget { checkedAt: string; status: "healthy" | "unreachable" | "hash_missing" | "hash_mismatch"; observedHash?: string }
export async function checkWebsiteHealth(target: HostedWebsiteHealthTarget, dependencies: { fetch?: (url: string) => Promise<string | null>; now?: () => Date } = {}): Promise<WebsiteHealthReceipt> {
  const base = { ...target, checkedAt: (dependencies.now?.() ?? new Date()).toISOString() };
  try {
    const html = await (dependencies.fetch ?? (url => fetchPinnedPublicText(url,{ timeoutMs: 8000, maxBytes: 2_000_000 })))(target.url);
    if (html === null) return { ...base,status: "unreachable" };
    // Renderer emits the authoritative hash on a dedicated meta element.
    const tag = html.match(/<meta\b[^>]*\bname=["']strelva-site-hash["'][^>]*>/i)?.[0];
    const observedHash = tag?.match(/\bcontent=["']([a-f0-9]{64})["']/i)?.[1]?.toLowerCase();
    if (!observedHash) return { ...base,status: "hash_missing" };
    return { ...base,status: observedHash === target.contentHash ? "healthy" : "hash_mismatch",observedHash };
  } catch { return { ...base,status: "unreachable" }; }
}
export async function scanWebsiteHealth(dependencies: { list: () => Promise<HostedWebsiteHealthTarget[]>; save: (receipt: WebsiteHealthReceipt) => Promise<void>; fetch?: (url: string) => Promise<string | null>; alert?: (receipts: WebsiteHealthReceipt[]) => Promise<void> }) {
  const targets = await dependencies.list(); const results: WebsiteHealthReceipt[] = [];
  // Bound network concurrency without dropping sites or hiding storage failures.
  for (let offset = 0; offset < targets.length; offset += 5) {
    const batch = await Promise.all(targets.slice(offset,offset+5).map(target => checkWebsiteHealth(target,{ fetch: dependencies.fetch })));
    for (const receipt of batch) { await dependencies.save(receipt); results.push(receipt); }
  }
  const failed = results.filter(value => value.status !== "healthy");
  if (failed.length && dependencies.alert) await dependencies.alert(failed);
  return { results,processed: results.length,failed: failed.length };
}

import { load } from "cheerio";
type TenantConfig = { productionDomain?: string; siteUrl?: string };

export interface WebsiteContentReadBack {
  ok: boolean;
  status: "verified" | "unreachable" | "mismatch" | "unverified";
  detail: string;
  url: string | null;
  checkedAt: string;
  checkedValues: number;
  /** Field paths only: receipts never copy customer content into diagnostics. */
  missingFields: string[];
}

type Expectation = { path: string; value: string; kind: "text" | "link" | "image" };
const TEXT_FIELDS = new Set([
  "headline", "subheadline", "tagline", "ctaText", "sectionLabel", "description", "name", "duration", "price", "who_its_for",
  "accentText", "statement", "paragraphs", "value", "label", "quote", "quoteAttribution", "author", "location", "title", "time",
  "hosted_by", "category", "service", "why_i_recommend", "phone", "question", "answer", "address", "hours", "email",
  "locationTitle", "locationDescription", "ingredients", "badge", "bottomNote", "siteName", "ownerName", "ownerTitle", "trustBadge",
  "footerTagline", "copyrightText", "marqueeText", "ctaLabel", "heading",
]);
const LINK_FIELDS = new Set(["href", "ctaLink", "booking_link", "external_link", "instagramUrl", "facebookUrl", "googleMapsUrl", "bookingUrl", "stripePaymentLink", "ctaHref"]);
const IMAGE_FIELDS = new Set(["backgroundImageUrl", "logoUrl", "image_url", "imageUrl", "secondaryImageUrl", "photo_url"]);

function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function expectations(value: unknown, path = "", field = ""): Expectation[] {
  if (typeof value === "string") {
    if (!normalizeText(value)) return [];
    const kind = LINK_FIELDS.has(field) ? "link" : IMAGE_FIELDS.has(field) ? "image" : TEXT_FIELDS.has(field) ? "text" : null;
    return kind ? [{ path, value, kind }] : [];
  }
  if (Array.isArray(value)) return value.flatMap((entry, index) => expectations(entry, `${path}[${index}]`, field));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, entry]) => expectations(entry, path ? `${path}.${key}` : key, key));
  return [];
}

/** Only trusted tenant routing selects the destination; never a browser-supplied URL. */
export function publishedWebsiteUrl(tenant: Pick<TenantConfig, "productionDomain" | "siteUrl">): string | null {
  const raw = tenant.productionDomain ? (/^https?:\/\//i.test(tenant.productionDomain) ? tenant.productionDomain : `https://${tenant.productionDomain}/`) : tenant.siteUrl;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    return new URL("/", url).toString();
  } catch { return null; }
}

function absolute(value: string, base: string, depth = 0): string | null {
  try {
    const url = new URL(value, base);
    // Next image optimization wraps the actual source in the `url` parameter.
    if (url.pathname === "/_next/image" && url.searchParams.has("url")) return depth < 3 ? absolute(url.searchParams.get("url")!, base, depth + 1) : null;
    return url.toString();
  } catch { return null; }
}

/**
 * Read-only HTTP evidence after a publish has already been accepted. Failure
 * never rolls back that acceptance or retries a publish/revalidation.
 *
 * This verifies public markup values, not execution of browser JavaScript,
 * layout or the full section JSON. A section with no observable markup values
 * remains unverified. Callers must still compare stored version identity.
 * DNS and every redirect are validated and pinned by the shared transport.
 */
export async function readPublishedWebsiteContent(input: {
  tenant: Pick<TenantConfig, "productionDomain" | "siteUrl">;
  section: string;
  expected: unknown;
}, deps: { fetch?: typeof fetchPinnedPublicText; now?: () => Date } = {}): Promise<WebsiteContentReadBack> {
  const url = publishedWebsiteUrl(input.tenant);
  const checkedAt = (deps.now?.() ?? new Date()).toISOString();
  const base = { url, checkedAt, checkedValues: 0, missingFields: [] as string[] };
  if (!url) return { ...base, ok: false, status: "unverified", detail: "No public website URL is configured; the accepted publish has not been verified on the site." };
  const expected = expectations(input.expected);
  if (!expected.length) return { ...base, ok: false, status: "unverified", detail: `The ${input.section} change needs a visual check; it has no public text, link or image value to read back.` };
  let html: string | null;
  try { html = await (deps.fetch ?? fetchPinnedPublicText)(url, { timeoutMs: 8000, maxBytes: 2_000_000, maxRedirects: 5 }); }
  catch { html = null; }
  if (html === null) return { ...base, ok: false, status: "unreachable", detail: "The public site could not be read safely. The publish remains accepted; only its public read-back failed." };
  const $ = load(html);
  $("script, style, template, noscript, [hidden], [aria-hidden='true']").remove();
  $("[style]").each((_index, element) => {
    if (/\b(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test($(element).attr("style") ?? "")) $(element).remove();
  });
  const text = normalizeText($("body").text());
  const links = new Set($("a[href]").map((_index, element) => absolute($(element).attr("href") ?? "", url)).get());
  const images = new Set($("img[src], source[src], img[srcset], source[srcset]").map((_index, element) => {
    const node = $(element);
    return [node.attr("src") ?? "", ...(node.attr("srcset") ?? "").split(",").map(item => item.trim().split(/\s+/)[0] ?? "")].filter(Boolean).map(value => absolute(value, url));
  }).get());
  $("[style]").each((_index, element) => {
    for (const match of ($(element).attr("style") ?? "").matchAll(/url\(\s*(['"]?)([^'"()]+)\1\s*\)/gi)) {
      const value = absolute((match[2] ?? "").trim(), url);
      if (value) images.add(value);
    }
  });
  const missingFields = expected.filter(check => {
    if (check.kind === "text") return !text.includes(normalizeText(check.value));
    const value = absolute(check.value, url);
    return !value || !(check.kind === "link" ? links : images).has(value);
  }).map(check => check.path);
  const ok = missingFields.length === 0;
  return { ...base, ok, status: ok ? "verified" : "mismatch", checkedValues: expected.length, missingFields,
    detail: ok ? `The public homepage contains ${expected.length} published ${input.section} text, link or image values.` : `The accepted ${input.section} publish is missing ${missingFields.length} expected value(s) on the public homepage. Review the read-back; do not republish automatically.` };
}
