import { z } from "zod";
import { websitePublishedCapabilitiesSchema } from "./contracts";

const text = (max: number) => z.string().trim().max(max);
export const siteIdSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,119}$/);
const reservedSiteRoots = new Set(["api", "admin", "workspace", "dashboard", "apps", "business", "auth", "sign-in", "sign-up", "preview", "pay", "onboard", "delivery", "agency-websites", "agency-applications", "custom-applications", "no-access", "audit", "ai-visibility", "privacy", "terms", "guides", "account", "home", "m-blog", "robots.txt", "sitemap.xml", "favicon.ico", ".well-known"]);
export const safeSitePathSchema = z.string().max(512).regex(/^\/(?:[a-zA-Z0-9_.-]+\/?)*$/).refine(value => value === "/" || !value.endsWith("/"), "Use a canonical path without a trailing slash").refine(value => !value.split("/").some(segment => segment === "." || segment === ".."), "Path traversal is not allowed").refine(value => !reservedSiteRoots.has((value.split("/")[1] ?? "").toLowerCase()), "The path is reserved for a Strelva product route");
const href = z.string().max(2048).refine(value => /^\/(?!\/)[a-zA-Z0-9_/?=&.#%-]*$/.test(value) || /^https:\/\//i.test(value) || /^mailto:[^\s<>]+$/.test(value) || /^tel:[+\d() .-]+$/.test(value), "Expected an internal path, HTTPS, email or telephone link");
const assetId = siteIdSchema;
const link = z.object({ label: text(160), href }).strict();
const links = z.array(link).max(40);
const verification = z.object({ supported: z.boolean(), confidence: z.number().min(0).max(1), highRisk: z.boolean().optional(), needsReview: z.boolean().optional() }).strict();
const base = { id: siteIdSchema, children: z.array(siteIdSchema).max(200).default([]), factIds: z.array(siteIdSchema).max(200).default([]), verification: verification.optional() };
const node = <T extends string, V extends [string, ...string[]], P extends z.ZodRawShape>(type: T, variants: V, props: P) => z.object({ ...base, type: z.literal(type), variant: z.enum(variants), props: z.object(props).strict() }).strict();
const title = text(500).optional();
const body = text(12000).optional();
const image = assetId.optional();
const cta = link.optional();

export const catalogNodeSchema = z.discriminatedUnion("type", [
  node("Header", ["logo-left", "centered"], { brand: title, links: links.optional(), cta }),
  node("Footer", ["simple", "columns"], { text: body, links: links.optional(), columns: z.array(z.object({ title: text(160), links }).strict()).max(8).optional() }),
  node("Hero", ["split", "image", "statement"], { eyebrow: text(160).optional(), title, body, image, cta, secondaryCta: cta }),
  node("TrustStrip", ["logos", "stats", "badges"], { title, items: z.array(z.object({ label: text(300), value: text(160).optional(), image }).strict()).max(40).optional() }),
  node("ServiceGrid", ["cards", "list", "icons"], { title, items: z.array(z.object({ title: text(500), body, href: href.optional(), image }).strict()).max(40).optional() }),
  node("ServiceDetail", ["standard"], { title, body, image, cta }),
  node("Story", ["split", "long-form"], { title, body, image }),
  node("TeamGrid", ["cards", "single-bio"], { title, people: z.array(z.object({ name: text(300), role: text(300).optional(), bio: body, image }).strict()).max(40).optional() }),
  node("Testimonials", ["carousel", "wall", "single"], { title, items: z.array(z.object({ quote: text(4000), name: text(300).optional(), role: text(300).optional() }).strict()).max(40).optional() }),
  node("ReviewSummary", ["stars-and-count"], { rating: z.number().min(0).max(5).optional(), count: z.number().int().nonnegative().optional(), label: text(300).optional() }),
  node("Faq", ["accordion", "two-column"], { title, items: z.array(z.object({ question: text(500), answer: text(4000) }).strict()).max(40).optional() }),
  node("Stats", ["row"], { items: z.array(z.object({ value: text(160), label: text(300) }).strict()).max(20).optional() }),
  node("Gallery", ["grid", "masonry"], { title, images: z.array(z.object({ assetId, caption: text(500).optional() }).strict()).max(80).optional() }),
  node("Hours", ["table"], { title, rows: z.array(z.object({ day: text(100), hours: text(300) }).strict()).max(20).optional() }),
  node("Map", ["static"], { image, address: text(500).optional(), href: href.optional() }),
  node("Locations", ["list"], { title, items: z.array(z.object({ name: text(300), address: text(500).optional(), phone: text(100).optional(), href: href.optional() }).strict()).max(40).optional() }),
  node("Cta", ["band", "card"], { title, body, cta }),
  node("InquiryForm", ["inline", "card"], { title, body, submitLabel: text(160).optional() }),
  node("Booking", ["inline"], { title, body }),
  node("PageHeader", ["standard"], { title, body, eyebrow: text(160).optional() }),
  node("RichText", ["standard"], { text: body }),
  node("Section", ["container", "band"], { title }),
]);
export type CatalogNode = z.infer<typeof catalogNodeSchema>;

export const factSchema = z.object({
  text: z.string().trim().min(1).max(500),
  kind: z.enum(["contact", "hours", "location", "service", "person", "credential", "number", "review", "claim"]),
  highRisk: z.boolean(),
  origin: z.enum(["source", "owner_stated", "owner_confirmed"]),
  sources: z.array(z.object({ sourceId: z.string().min(1).max(2048), quote: z.string().trim().min(1).max(300) }).strict()).max(40),
  verification: z.object({ supported: z.boolean(), confidence: z.number().min(0).max(1) }).strict().optional(),
}).strict().refine(fact => fact.origin !== "source" || fact.sources.length > 0, "Sourced facts require evidence");
export type Fact = z.infer<typeof factSchema>;

export const siteAssetSchema = z.object({
  url: z.string().max(2048).refine(value => {
    if (/^\/(?!\/)[a-zA-Z0-9_/?=&.#%-]+$/.test(value)) return true;
    try { const parsed = new URL(value); return parsed.protocol === "https:" && !parsed.username && !parsed.password && parsed.hostname.endsWith(".public.blob.vercel-storage.com"); } catch { return false; }
  }, "Assets must be rehosted in tenant media before they enter a site document"),
  alt: text(500), width: z.number().int().positive().max(20000).optional(), height: z.number().int().positive().max(20000).optional(),
  sourceUrl: z.string().url().max(2048).optional(), contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

/**
 * Shared child references are allowed (one header on several pages), but each
 * occurrence renders again. Bound the expanded count per page so a small
 * document cannot multiply into an enormous render (audit 2026-10-05, finding 2).
 */
export const SITE_MAX_EXPANDED_NODES_PER_PAGE = 500;
/** Expanded occurrences under a root, memoized and capped; cycles count as over the bound. */
export function siteExpandedNodeCount(nodes: Record<string, { children: string[] } | undefined>, root: string): number {
  const cap = SITE_MAX_EXPANDED_NODES_PER_PAGE + 1; const memo = new Map<string, number>(); const active = new Set<string>();
  const size = (id: string, depth: number): number => {
    const cached = memo.get(id); if (cached !== undefined) return cached;
    if (active.has(id) || depth > 40) return cap;
    const node = nodes[id]; if (!node) return 0;
    active.add(id); let total = 1;
    for (const child of node.children) { total += size(child, depth + 1); if (total >= cap) { total = cap; break; } }
    active.delete(id); memo.set(id, total); return total;
  };
  return size(root, 0);
}

export const siteDocumentSchema = z.object({
  version: z.literal(2), siteName: z.string().trim().min(1).max(160),
  theme: z.object({ palette: z.enum(["light", "dark", "warm", "ocean", "forest"]), accent: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(), typeScale: z.enum(["compact", "standard", "editorial"]), logo: assetId.optional() }).strict(),
  pages: z.array(z.object({ path: safeSitePathSchema, title: z.string().trim().min(1).max(70), description: text(160), root: siteIdSchema }).strict()).min(1).max(12),
  nodes: z.record(siteIdSchema, catalogNodeSchema), facts: z.record(siteIdSchema, factSchema), assets: z.record(assetId, siteAssetSchema),
  capabilities: websitePublishedCapabilitiesSchema.optional(),
  redirects: z.array(z.object({ from: safeSitePathSchema, to: safeSitePathSchema }).strict()).max(200),
  provenance: z.object({ sourceUrl: z.string().url().max(2048).optional(), crawledAt: z.string().datetime({ offset: true }).optional(), composer: z.enum(["jev", "model", "rules"]) }).strict(),
}).strict().superRefine((doc, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  if (Object.keys(doc.nodes).length > 500 || Object.keys(doc.facts).length > 1000 || Object.keys(doc.assets).length > 200) issue([], "The document exceeds its bounded catalog limits");
  const paths = new Set<string>();
  doc.pages.forEach((page, i) => { if (paths.has(page.path)) issue(["pages", i, "path"], "Duplicate page path"); paths.add(page.path); if (!doc.nodes[page.root]) issue(["pages", i, "root"], "Missing root node"); });
  if (!paths.has("/")) issue(["pages"], "A website needs a home page");
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string, depth: number) => {
    if (depth > 40 || visiting.has(id)) { issue(["nodes", id, "children"], "The node graph must be acyclic and at most 40 levels deep"); return; }
    if (visited.has(id)) return;
    visiting.add(id); for (const child of doc.nodes[id]?.children ?? []) if (doc.nodes[child]) visit(child, depth + 1); visiting.delete(id); visited.add(id);
  };
  for (const [id, entry] of Object.entries(doc.nodes)) {
    if (id !== entry.id) issue(["nodes", id, "id"], "Node ID must match its map key");
    entry.children.forEach(child => { if (!doc.nodes[child]) issue(["nodes", id, "children"], "Missing child node"); });
    entry.factIds.forEach(fact => { if (!doc.facts[fact]) issue(["nodes", id, "factIds"], "Missing fact"); });
    const checkAssets = (value: unknown, key?: string): void => {
      if ((key === "image" || key === "assetId") && typeof value === "string" && !doc.assets[value]) issue(["nodes", id, "props"], "Missing asset");
      if (Array.isArray(value)) value.forEach(item => checkAssets(item));
      else if (value && typeof value === "object") Object.entries(value).forEach(([childKey, child]) => checkAssets(child, childKey));
    }; checkAssets(entry.props); visit(id, 0);
  }
  doc.pages.forEach((page, i) => { if (doc.nodes[page.root] && siteExpandedNodeCount(doc.nodes, page.root) > SITE_MAX_EXPANDED_NODES_PER_PAGE) issue(["pages", i, "root"], `The page expands to more than ${SITE_MAX_EXPANDED_NODES_PER_PAGE} rendered sections`); });
  if (doc.theme.logo && !doc.assets[doc.theme.logo]) issue(["theme", "logo"], "Missing logo asset");
  const redirects = new Map<string,string>();
  doc.redirects.forEach((redirect, i) => { if (redirects.has(redirect.from) || paths.has(redirect.from) || redirect.from === redirect.to) issue(["redirects", i], "Redirect source conflicts with a page or redirect"); redirects.set(redirect.from,redirect.to); });
  doc.redirects.forEach((redirect, i) => { let target = redirect.to; const seen = new Set([redirect.from]); while (redirects.has(target) && !seen.has(target)) { seen.add(target); target = redirects.get(target)!; } if (seen.has(target) || !paths.has(target)) issue(["redirects", i, "to"], "Redirect must resolve to a document page without a cycle"); });
});
export type SiteDocument = z.infer<typeof siteDocumentSchema>;

export function unresolvedSiteFacts(document: SiteDocument): string[] {
  return Object.entries(document.facts).filter(([, fact]) => fact.origin !== "owner_confirmed" && (fact.highRisk || fact.verification?.supported === false || fact.origin !== "owner_stated" && (!fact.verification?.supported || fact.verification.confidence < 0.85))).map(([id]) => id);
}
