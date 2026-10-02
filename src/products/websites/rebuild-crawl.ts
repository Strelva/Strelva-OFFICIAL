import { createHash } from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";
import * as cheerio from "cheerio";
import { computeVisibleText, validateUrlSafety } from "@/lib/audit/checks";
import { isSafeFetchUrl } from "@/lib/safe-fetch";
import { registrableRebuildDomain } from "./rebuild-domain-key";

export const REBUILD_USER_AGENT = "StrelvaRebuild/1.0";
export interface SourceRef { sourceId: string; quote: string }
export interface AssetRef { url: string; alt: string; width?: number; height?: number; kind: "image" | "logo" | "icon" }
export interface CrawledPage { url: string; sourceId: string; html: string; visibleText: string; title: string; headings: string[]; links: Array<{ url: string; text: string }>; assets: AssetRef[]; contentTruncated?: boolean }
export interface SkippedPath { url: string; reason: "robots" | "external" | "limit" | "unreachable" | "javascript_only" | "not_html" }
export interface CrawlResult { pages: CrawledPage[]; skipped: SkippedPath[]; assets: AssetRef[]; crawledAt: string; bytes: number; elapsedMs: number; limited: boolean }
export class WebsiteCrawlError extends Error {
  constructor(public readonly code: "unsafe_url" | "unreachable" | "robots_blocked" | "javascript_only", message: string, public readonly crawl?: CrawlResult) { super(message); this.name = "WebsiteCrawlError"; }
}
export class WebsiteCrawlCheckpointError extends Error {
  constructor(public readonly cause: unknown) { super("We couldn't save this website's source pages. Retry to continue."); this.name = "WebsiteCrawlCheckpointError"; }
}
export interface PageFetchOptions { maxBytes: number; timeoutMs: number; allowUrl?: (url: string) => boolean | Promise<boolean> }
export interface PageFetchResult { url: string; status: number; html: string; contentType: string }
export type PageFetcher = (url: string, options: PageFetchOptions) => Promise<PageFetchResult>;

export function normalizeRebuildUrl(raw: string): string {
  let url: URL;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) && !/^https?:\/\//i.test(raw.trim())) throw new WebsiteCrawlError("unsafe_url", "Enter a public HTTP or HTTPS website address.");
  try { url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`); } catch { throw new WebsiteCrawlError("unsafe_url", "Enter a valid public website address."); }
  if (!isSafeFetchUrl(url.href) || url.username || url.password || url.port && !["80", "443"].includes(url.port)) throw new WebsiteCrawlError("unsafe_url", "Enter a public HTTP or HTTPS website address without credentials or a custom port.");
  url.hash = "";
  return url.href;
}

/** PSL includes private hosted registries, so unrelated github.io or co.uk
 * businesses never become part of one crawl. */
export function sameCrawlDomain(left: string, right: string): boolean {
  return registrableRebuildDomain(new URL(left).hostname) === registrableRebuildDomain(new URL(right).hostname);
}

/** Shares the audit's DNS safety check, pins the validated address for this
 * connection, and checks every redirect before requesting it. */
export const fetchRebuildPage: PageFetcher = async (raw, options) => {
  let url = normalizeRebuildUrl(raw);
  const deadline = Date.now() + options.timeoutMs;
  for (let hop = 0; hop <= 5; hop++) {
    if (options.allowUrl && !await options.allowUrl(url)) throw new Error("The redirect is outside the allowed crawl paths.");
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Website request timed out.");
    let dnsTimer: ReturnType<typeof setTimeout> | undefined;
    let address: string;
    try { ({ address } = await Promise.race([validateUrlSafety(url), new Promise<never>((_, reject) => { dnsTimer = setTimeout(() => reject(new Error("Website DNS lookup timed out.")), remaining); })])); }
    finally { if (dnsTimer) clearTimeout(dnsTimer); }
    const response = await new Promise<{ status: number; headers: http.IncomingHttpHeaders; html: string }>((resolve, reject) => {
      const parsed = new URL(url);
      const request = (parsed.protocol === "https:" ? https : http).request(parsed, {
        family: 4,
        headers: { "User-Agent": `${REBUILD_USER_AGENT} (+https://strelva.com)`, Accept: "text/html,text/plain;q=0.9", "Accept-Encoding": "identity" },
        lookup: (_hostname, _options, callback) => callback(null, address, 4),
      }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) { res.resume(); resolve({ status: res.statusCode!, headers: res.headers, html: "" }); return; }
        const chunks: Buffer[] = []; let bytes = 0;
        res.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > options.maxBytes) { request.destroy(new Error("Website page exceeds the crawl byte limit.")); return; } chunks.push(chunk); });
        res.on("error", reject);
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, html: Buffer.concat(chunks).toString("utf8") }));
      });
      const timer = setTimeout(() => request.destroy(new Error("Website request timed out.")), Math.max(1, deadline - Date.now()));
      request.on("error", reject); request.on("close", () => clearTimeout(timer)); request.end();
    });
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) { url = normalizeRebuildUrl(new URL(response.headers.location, url).href); continue; }
    return { url, status: response.status, html: response.html, contentType: String(response.headers["content-type"] ?? "") };
  }
  throw new Error("Website redirected too many times.");
};

export function robotsAllows(text: string, url: string): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let group = { agents: [] as string[], rules: [] as Array<{ allow: boolean; path: string }> };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0]?.trim() ?? ""; const match = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i); if (!match) continue;
    const field = match[1]!.toLowerCase(); const value = match[2]!.trim();
    if (field === "user-agent") { if (group.rules.length) { groups.push(group); group = { agents: [], rules: [] }; } group.agents.push(value.toLowerCase()); }
    else if (group.agents.length && value) group.rules.push({ allow: field === "allow", path: value });
  }
  if (group.agents.length) groups.push(group);
  const specific = groups.filter((entry) => entry.agents.some((agent) => agent !== "*" && REBUILD_USER_AGENT.toLowerCase().startsWith(agent)));
  const applicable = specific.length ? specific : groups.filter((entry) => entry.agents.includes("*"));
  const normalizePath = (value: string) => value.replace(/%([a-fA-F0-9]{2})/g, (match, hex: string) => { const character = String.fromCharCode(parseInt(hex, 16)); return /[a-zA-Z0-9_.~-]/.test(character) ? character : match.toUpperCase(); }).replace(/[^\x00-\x7F]/g, character => encodeURIComponent(character));
  const path = normalizePath(new URL(url).pathname + new URL(url).search);
  const rules = applicable.flatMap((entry) => entry.rules).filter((rule) => {
    const anchored = rule.path.endsWith("$"); const literal = normalizePath(anchored ? rule.path.slice(0, -1) : rule.path);
    const expression = literal.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp(`^${expression}${anchored ? "$" : ""}`).test(path);
  }).sort((a, b) => b.path.replace(/[*$]/g, "").length - a.path.replace(/[*$]/g, "").length || Number(b.allow) - Number(a.allow));
  return rules[0]?.allow ?? true;
}

function parsePage(url: string, html: string): CrawledPage {
  const $ = cheerio.load(html);
  const assets: AssetRef[] = [];
  const resolveAsset = (src: string | undefined, alt: string, kind: AssetRef["kind"], width?: string, height?: string) => {
    if (!src) return; try { const resolved = new URL(src, url).href; if (!isSafeFetchUrl(resolved)) return; assets.push({ url: resolved, alt: alt.slice(0, 500), kind, ...(Number(width) > 0 ? { width: Number(width) } : {}), ...(Number(height) > 0 ? { height: Number(height) } : {}) }); } catch { /* Invalid assets are omitted. */ }
  };
  $("img").each((_, el) => { const image = $(el); resolveAsset(image.attr("src"), image.attr("alt") ?? "", /logo/i.test(`${image.attr("class")} ${image.attr("alt")}`) ? "logo" : "image", image.attr("width"), image.attr("height")); });
  resolveAsset($("meta[property='og:image']").attr("content"), "", "image");
  $("link[rel*='icon']").each((_, el) => resolveAsset($(el).attr("href"), "", "icon"));
  const links: CrawledPage["links"] = [];
  $("a[href]").each((_, el) => { try { const href = new URL($(el).attr("href")!, url); href.hash = ""; if (["http:", "https:"].includes(href.protocol)) links.push({ url: href.href, text: $(el).text().replace(/\s+/g, " ").trim().slice(0, 160) }); } catch { /* Invalid links are omitted. */ } });
  return { url, sourceId: `${url}#sha256=${createHash("sha256").update(html).digest("hex")}`, html, visibleText: computeVisibleText($), title: $("title").first().text().trim().slice(0, 160), headings: $("h1,h2,h3").map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get(), links, assets };
}

export async function crawlWebsite(raw: string, options: { fetchPage?: PageFetcher; maxPages?: number; maxBytes?: number; timeoutMs?: number; now?: string; onPage?: (page: CrawledPage) => Promise<void> | void } = {}): Promise<CrawlResult> {
  const start = normalizeRebuildUrl(raw); const fetchPage = options.fetchPage ?? fetchRebuildPage;
  const maxPages = Math.min(25, Math.max(1, options.maxPages ?? 25)); const maxBytes = Math.min(8 * 1024 * 1024, options.maxBytes ?? 8 * 1024 * 1024); const timeoutMs = Math.min(60_000, options.timeoutMs ?? 60_000);
  const began = Date.now(); const result: CrawlResult = { pages: [], skipped: [], assets: [], crawledAt: options.now ?? new Date().toISOString(), bytes: 0, elapsedMs: 0, limited: false };
  const queue = [start]; const seen = new Set<string>(); const robots = new Map<string, string>();
  const getRobots = async (url: string) => {
    const origin = new URL(url).origin; if (robots.has(origin)) return robots.get(origin)!;
    const response = await fetchPage(`${origin}/robots.txt`, { maxBytes: Math.min(256 * 1024, maxBytes), timeoutMs: Math.max(1, Math.min(6_000, timeoutMs - (Date.now() - began))), allowUrl: (target) => sameCrawlDomain(start, target) });
    if (response.status >= 500 || response.status === 401 || response.status === 403 || response.status === 429) throw new Error("Robots policy is unavailable; retry before crawling.");
    const text = response.status >= 200 && response.status < 300 && !/text\/html/i.test(response.contentType) ? response.html : ""; robots.set(origin, text); robots.set(new URL(response.url).origin, text); return text;
  };
  while (queue.length) {
    if (result.pages.length >= maxPages || result.bytes >= maxBytes || Date.now() - began >= timeoutMs) { result.limited = true; result.skipped.push(...queue.map((url): SkippedPath => ({ url, reason: "limit" }))); break; }
    const url = queue.shift()!; if (seen.has(url)) continue; seen.add(url);
    try {
      const policy = await getRobots(url);
      if (!robotsAllows(policy, url)) { result.skipped.push({ url, reason: "robots" }); continue; }
      const response = await fetchPage(url, { maxBytes: maxBytes - result.bytes, timeoutMs: Math.max(1, Math.min(15_000, timeoutMs - (Date.now() - began))), allowUrl: async (target) => sameCrawlDomain(start, target) && robotsAllows(await getRobots(target), target) });
      if (response.status < 200 || response.status >= 300 || /cf-chl|checking your browser|just a moment\.\.\./i.test(response.html)) throw new Error("Website request failed.");
      if (!sameCrawlDomain(start, response.url)) throw new Error("Website redirected outside its domain.");
      result.bytes += Buffer.byteLength(response.html); if (result.bytes > maxBytes) throw new Error("Crawl byte limit exceeded.");
      if (response.contentType && !/text\/html|application\/xhtml\+xml/i.test(response.contentType)) { result.skipped.push({ url, reason: "not_html" }); continue; }
      const page = parsePage(response.url, response.html); seen.add(response.url);
      if (page.visibleText.length < 80 && (response.html.match(/<script\b/gi)?.length ?? 0) >= 3) { result.skipped.push({ url, reason: "javascript_only" }); continue; }
      result.pages.push(page); try { await options.onPage?.(page); } catch (error) { throw new WebsiteCrawlCheckpointError(error); }
      for (const link of page.links) {
        if (!sameCrawlDomain(start, link.url)) continue;
        if (/\.(?:pdf|jpe?g|png|gif|webp|svg|zip|mp4|docx?)(?:\?|$)/i.test(new URL(link.url).pathname)) continue;
        if (!seen.has(link.url) && !queue.includes(link.url) && queue.length < 200) queue.push(link.url);
      }
    } catch (error) { if (error instanceof WebsiteCrawlCheckpointError) throw error; result.skipped.push({ url, reason: "unreachable" }); }
  }
  result.elapsedMs = Date.now() - began; result.assets = [...new Map(result.pages.flatMap((page) => page.assets).map((asset) => [asset.url, asset])).values()].slice(0, 200);
  if (!result.pages.length) {
    const code = result.skipped.some((skip) => skip.reason === "javascript_only") ? "javascript_only" : result.skipped.some((skip) => skip.reason === "robots") ? "robots_blocked" : "unreachable";
    throw new WebsiteCrawlError(code, code === "javascript_only" ? "This site needs a browser to read. Describe your business instead." : code === "robots_blocked" ? "This website's robots.txt blocks rebuilding. Describe your business instead." : "We couldn't open this website. Retry, or describe your business instead.", result);
  }
  return result;
}
