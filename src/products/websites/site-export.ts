import { tenantSiteOrigin } from "@/platform/infra/brand";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { siteDocumentSchema, siteDocumentHash, type SiteDocument } from "./site-document";
import { SITE_CATALOG_CSS, sitePageTree, siteThemeVariables, type SiteTree } from "./site-render-tree";
import { safeJsonLd, siteDocumentJsonLd, siteFaqJsonLd } from "./site-seo";
import type { WebsiteArtifactFile } from "./artifact";

export function escapeSiteHtml(value: unknown): string { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function treeHtml(tree: SiteTree): string {
  if (typeof tree === "string") return escapeSiteHtml(tree);
  const attrs = Object.entries(tree.attrs).filter(([, value]) => value !== false).map(([key, value]) => value === true ? ` ${key}` : ` ${key}="${escapeSiteHtml(value)}"`).join("");
  const open = `<${tree.tag}${attrs}>`;
  return ["img", "input", "br", "hr", "meta", "link"].includes(tree.tag) ? open : `${open}${tree.children.map(treeHtml).join("")}</${tree.tag}>`;
}
export function renderSiteDocumentHtml(input: SiteDocument, path = "/", options: { preview?: boolean; canonicalUrl?: string; tenant?: string; apiOrigin?: string; assetPaths?: Record<string, string> } = {}): string {
  const document = siteDocumentSchema.parse(input);
  const page = document.pages.find(item => item.path === path);
  if (!page) throw new Error(`The website has no page at ${path}.`);
  const hash = siteDocumentHash(document);
  const renderDocument = options.assetPaths ? { ...document, assets: Object.fromEntries(Object.entries(document.assets).map(([id, asset]) => [id, { ...asset, url: options.assetPaths![id] ?? asset.url }])) } : document;
  const tree = sitePageTree(renderDocument, path, options);
  const legacyInquiry = !options.preview && !!options.tenant && !document.capabilities?.inquiry;
  if (legacyInquiry && (options.apiOrigin || options.canonicalUrl)) {
    const setOrigin = (node: SiteTree) => { if (typeof node === "string") return; if (node.attrs["data-site-inquiry"]) node.attrs["data-site-api-origin"] = new URL(options.apiOrigin || options.canonicalUrl!).origin; node.children.forEach(setOrigin); };
    setOrigin(tree);
  }
  const variables = Object.entries(siteThemeVariables(document)).map(([name, value]) => `${name}:${value}`).join(";");
  const origin = options.canonicalUrl ? new URL(options.canonicalUrl).origin : null;
  const canonical = origin ? new URL(path, origin).toString() : null;
  const capabilities = !options.preview && Boolean(document.capabilities) && (!options.tenant || document.capabilities?.tenant === options.tenant);
  const faqSchema = options.preview ? null : siteFaqJsonLd(document, path);
  const icon = document.theme.logo ? renderDocument.assets[document.theme.logo]?.url : undefined;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="strelva-site-hash" content="${hash}"><title>${escapeSiteHtml(page.title)}</title><meta name="description" content="${escapeSiteHtml(page.description)}">${options.preview ? '<meta name="robots" content="noindex,nofollow">' : ""}${canonical ? `<link rel="canonical" href="${escapeSiteHtml(canonical)}"><meta property="og:url" content="${escapeSiteHtml(canonical)}">` : ""}<meta property="og:type" content="website"><meta property="og:title" content="${escapeSiteHtml(page.title)}"><meta property="og:description" content="${escapeSiteHtml(page.description)}">${icon ? `<link rel="icon" href="${escapeSiteHtml(icon)}">` : ""}<style>${SITE_CATALOG_CSS}</style>${origin && !options.preview ? `<script type="application/ld+json">${safeJsonLd(siteDocumentJsonLd(document, origin))}</script>` : ""}${faqSchema ? `<script type="application/ld+json">${safeJsonLd(faqSchema)}</script>` : ""}</head><body style="margin:0;${variables};background:var(--site-background);color:var(--site-text)"><a class="site-skip" href="#main-content">Skip to content</a><main id="main-content">${treeHtml(tree)}</main>${capabilities ? '<script type="module" src="/website-generation/capability-runtime.mjs"></script>' : ""}${legacyInquiry ? '<script type="module" src="/website-generation/site-lead-runtime.mjs"></script>' : ""}</body></html>`;
}
function file(path: string, content: string): WebsiteArtifactFile { return { path, content, bytes: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex") }; }
export interface SiteDocumentExportInput { workspaceId: string; workId: string; revision: number; tenant?: string; apiOrigin?: string; generatedAt?: string; canonicalUrl?: string; assetFiles?: Array<{ assetId: string; path: string; content: string; encoding?: "base64" | "utf8" }> }
export interface SiteDocumentExport { version: 2; contentHash: string; previewHtml: string; files: WebsiteArtifactFile[]; binaryFiles: Array<{ path: string; base64: string; sha256: string; bytes: number }> }
/** Complete static export, including local image bytes and the immutable document. */
export function buildSiteDocumentExport(input: SiteDocument, options: SiteDocumentExportInput): SiteDocumentExport {
  const document = siteDocumentSchema.parse(input);
  const hash = siteDocumentHash(document);
  if (!Number.isSafeInteger(options.revision) || options.revision < 1) throw new Error("Export revision must be positive.");
  const assetPaths: Record<string, string> = {};
  const binaryFiles: SiteDocumentExport["binaryFiles"] = [];
  for (const [id] of Object.entries(document.assets)) {
    const asset = options.assetFiles?.find(item => item.assetId === id);
    if (!asset || !/^assets\/[a-zA-Z0-9._/-]+$/.test(asset.path) || asset.path.split("/").some(part => part === ".." || part === ".")) throw new Error(`Image ${id} is missing from the export. Download its tenant-media bytes first.`);
    if (binaryFiles.some(item => item.path === asset.path)) throw new Error("Export image paths must be unique.");
    const bytes = Buffer.from(asset.content, asset.encoding === "utf8" ? "utf8" : "base64");
    if (bytes.length === 0) throw new Error(`Image ${id} has no export bytes.`);
    assetPaths[id] = `/${asset.path}`;
    const imageHash = createHash("sha256").update(bytes).digest("hex");
    if (document.assets[id]?.contentHash && document.assets[id]!.contentHash !== imageHash) throw new Error(`Image ${id} does not match its recorded content hash.`);
    binaryFiles.push({ path: asset.path, base64: bytes.toString("base64"), sha256: imageHash, bytes: bytes.length });
  }
  const previewHtml = renderSiteDocumentHtml(document, "/", { preview: true, canonicalUrl: options.canonicalUrl, assetPaths });
  const files = [file("site-document.json", JSON.stringify(document, null, 2) + "\n"), ...document.pages.map(page => file(page.path === "/" ? "index.html" : `${page.path.slice(1)}/index.html`, renderSiteDocumentHtml(document, page.path, { canonicalUrl: options.canonicalUrl, apiOrigin: options.apiOrigin ?? (options.tenant ? tenantSiteOrigin(options.tenant) : undefined), assetPaths, tenant: options.tenant })))];
  if (options.tenant && !document.capabilities?.inquiry) files.push(file("website-generation/site-lead-runtime.mjs", readFileSync(join(process.cwd(), "src/products/websites/site-lead-runtime.mjs"), "utf8")));
  if (document.capabilities) files.push(file("website-generation/capability-runtime.mjs", readFileSync(join(process.cwd(), "custom-repo-starter/website-generation/capability-runtime.mjs"), "utf8")));
  if (options.canonicalUrl) { const origin = new URL(options.canonicalUrl).origin; files.push(file("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${document.pages.map(page => `<url><loc>${escapeSiteHtml(new URL(page.path, origin).toString())}</loc></url>`).join("")}</urlset>`), file("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`)); }
  files.push(file("_redirects", document.redirects.map(item => `${item.from} ${item.to} 301`).join("\n") + "\n"));
  files.push(file("redirects.json", JSON.stringify(document.redirects, null, 2) + "\n"));
  files.push(file("export-manifest.json", JSON.stringify({ version: 2, workspaceId: options.workspaceId, workId: options.workId, revision: options.revision, contentHash: hash, generatedAt: options.generatedAt ?? new Date().toISOString(), files: [...files, ...binaryFiles].map(item => ({ path: item.path, sha256: item.sha256, bytes: item.bytes })) }, null, 2) + "\n"));
  return { version: 2, contentHash: hash, previewHtml, files, binaryFiles };
}
