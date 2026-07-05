/**
 * Scaffold Web SEO helpers for custom-repo client sites.
 *
 * Pure, IO-free mappers from a Scaffold-shaped SEO config to Next.js metadata
 * primitives — so every client repo builds its `<head>`, sitemap, and robots the
 * same way instead of hand-rolling them per build.
 *
 *   - `buildMetadata(config)`  → Next `Metadata` (drop into `generateMetadata`)
 *   - `buildSitemap(entries)`  → Next `MetadataRoute.Sitemap` (drop into `app/sitemap.ts`)
 *   - `buildRobots(config)`    → Next `MetadataRoute.Robots` (drop into `app/robots.ts`)
 *
 * The `ScaffoldSeoConfig` is a superset of the control plane's `PageConfig.seo`
 * (`{ title, description, ogImage }`) plus a canonical URL, site name, and a
 * noindex flag — so you can feed a fetched page config straight in and layer on
 * the per-repo extras.
 *
 * Self-contained: only type-only imports from "next" (erased at build), no
 * `@/lib/...`, no runtime deps. Honesty rule (mirrors the schema emitter): any
 * field you don't provide is OMITTED — no empty strings, no fabricated defaults.
 */

import type { Metadata, MetadataRoute } from "next";

/** Superset of the control plane's `PageConfig.seo`, for one page's `<head>`. */
export interface ScaffoldSeoConfig {
  title?: string;
  description?: string;
  /** Open Graph image URL. */
  ogImage?: string;
  /** Canonical URL for this page → `alternates.canonical`. */
  canonical?: string;
  /** Page URL for Open Graph → `openGraph.url`. */
  url?: string;
  /** Site/brand name → `openGraph.siteName`. */
  siteName?: string;
  /** When true, emit `robots: { index:false, follow:false }`. */
  noindex?: boolean;
}

function clean(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

/**
 * Map a Scaffold SEO config to a Next.js `Metadata` object. Only provided fields
 * are set — an empty config yields an empty (but valid) `Metadata`. Pure.
 */
export function buildMetadata(config: ScaffoldSeoConfig | undefined | null): Metadata {
  const c = config ?? {};
  const metadata: Metadata = {};

  const title = clean(c.title);
  if (title) metadata.title = title;

  const description = clean(c.description);
  if (description) metadata.description = description;

  const canonical = clean(c.canonical);
  if (canonical) metadata.alternates = { canonical };

  if (c.noindex) metadata.robots = { index: false, follow: false };

  const ogTitle = title;
  const ogDescription = description;
  const ogImage = clean(c.ogImage);
  const ogUrl = clean(c.url);
  const siteName = clean(c.siteName);
  if (ogTitle || ogDescription || ogImage || ogUrl || siteName) {
    const openGraph: NonNullable<Metadata["openGraph"]> = {};
    if (ogTitle) openGraph.title = ogTitle;
    if (ogDescription) openGraph.description = ogDescription;
    if (ogUrl) openGraph.url = ogUrl;
    if (siteName) openGraph.siteName = siteName;
    if (ogImage) openGraph.images = [{ url: ogImage }];
    metadata.openGraph = openGraph;
  }

  return metadata;
}

export type SitemapChangeFrequency = MetadataRoute.Sitemap[number]["changeFrequency"];

/** One sitemap entry before normalization. `url` may be an absolute URL or a path. */
export interface SitemapEntryInput {
  url: string;
  lastModified?: string | Date;
  changeFrequency?: SitemapChangeFrequency;
  /** 0.0–1.0. Clamped into range; out-of-range/garbage is dropped. */
  priority?: number;
}

/**
 * Build a Next.js sitemap from entries. When `baseUrl` is given, path-style urls
 * ("/about") are made absolute against it; already-absolute urls are left alone.
 * Empty urls are dropped and the result is de-duplicated by final url. Pure.
 */
export function buildSitemap(
  entries: SitemapEntryInput[] | undefined | null,
  opts?: { baseUrl?: string },
): MetadataRoute.Sitemap {
  if (!Array.isArray(entries)) return [];
  const base = opts?.baseUrl?.replace(/\/$/, "");
  const seen = new Set<string>();
  const out: MetadataRoute.Sitemap = [];

  for (const entry of entries) {
    const raw = entry?.url?.trim();
    if (!raw) continue;
    const isAbsolute = /^https?:\/\//i.test(raw);
    const url = isAbsolute ? raw : base ? `${base}${raw.startsWith("/") ? "" : "/"}${raw}` : raw;
    if (seen.has(url)) continue;
    seen.add(url);

    const item: MetadataRoute.Sitemap[number] = { url };
    if (entry.lastModified) item.lastModified = entry.lastModified;
    if (entry.changeFrequency) item.changeFrequency = entry.changeFrequency;
    if (Number.isFinite(entry.priority)) {
      item.priority = Math.min(1, Math.max(0, entry.priority as number));
    }
    out.push(item);
  }

  return out;
}

export interface RobotsConfig {
  /** Path(s) explicitly allowed. */
  allow?: string | string[];
  /** Path(s) disallowed. Ignored when `disallowAll` is set. */
  disallow?: string | string[];
  /** Sitemap URL(s) → the `Sitemap:` line(s). */
  sitemap?: string | string[];
  /** Canonical host → the `Host:` line. */
  host?: string;
  /** User-agent the rule applies to. Default "*". */
  userAgent?: string;
  /** Block everything (staging / not-yet-launched): disallow "/". */
  disallowAll?: boolean;
}

function cleanList(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  const arr = (Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter(Boolean);
  return arr.length ? arr : undefined;
}

/**
 * Build a Next.js robots object. `disallowAll` blocks the whole site; otherwise
 * only provided allow/disallow lists are set. Sitemap/host are added when given.
 * Pure.
 */
export function buildRobots(config: RobotsConfig | undefined | null): MetadataRoute.Robots {
  const c = config ?? {};
  const rules: NonNullable<MetadataRoute.Robots["rules"]> = {
    userAgent: clean(c.userAgent) ?? "*",
  };

  if (c.disallowAll) {
    rules.disallow = "/";
  } else {
    const allow = cleanList(c.allow);
    const disallow = cleanList(c.disallow);
    if (allow) rules.allow = allow;
    if (disallow) rules.disallow = disallow;
  }

  const robots: MetadataRoute.Robots = { rules };
  const sitemap = cleanList(c.sitemap);
  if (sitemap) robots.sitemap = sitemap.length === 1 ? sitemap[0] : sitemap;
  const host = clean(c.host);
  if (host) robots.host = host;
  return robots;
}
