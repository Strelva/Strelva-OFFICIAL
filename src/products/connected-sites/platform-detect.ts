/**
 * What a live page says it is built with. Pure and browser-safe: it reads text
 * it is handed and never executes, evaluates or fetches anything.
 *
 * A generator tag wins. Otherwise distinct fingerprints (asset hosts, markers,
 * response headers) are counted per builder, and two or more is confident.
 */
import type { SitePlatform } from "./contracts";
import { GUIDE_ORDER } from "./install-guides";

export interface PlatformDetection { platform: SitePlatform; evidence: string[]; confident: boolean }

const META_WINDOW = 300_000;
const BODY_WINDOW = 2_000_000;
const MAX_GENERATORS = 5;
const MAX_EVIDENCE = 5;
const MAX_EVIDENCE_LENGTH = 120;

const GENERATOR_RULES: Array<[RegExp, SitePlatform]> = [
  [/wordpress/i, "wordpress"],
  [/wix\.com/i, "wix"],
  [/squarespace/i, "squarespace"],
  [/webflow/i, "webflow"],
  [/go ?daddy|starfield/i, "godaddy"],
  [/duda/i, "duda"],
  [/framer/i, "framer"],
  [/shopify/i, "shopify"],
  [/weebly|square online/i, "square"],
  [/carrd/i, "carrd"],
];

interface Fingerprint { text?: string; header?: [name: string, pattern?: RegExp] }
const FINGERPRINTS: Partial<Record<SitePlatform, Fingerprint[]>> = {
  wordpress: [{ text: "/wp-content/" }, { text: "/wp-includes/" }, { text: "wp-json" }, { header: ["x-powered-by", /wp engine|wordpress/i] }],
  wix: [{ text: "static.wixstatic.com" }, { text: "static.parastorage.com" }, { text: "wix-bolt" }, { header: ["x-wix-request-id"] }],
  squarespace: [{ text: "static1.squarespace.com" }, { text: "squarespace-cdn.com" }, { text: "Static.SQUARESPACE_CONTEXT" }, { header: ["server", /squarespace/i] }],
  webflow: [{ text: "data-wf-page" }, { text: "data-wf-site" }, { text: "website-files.com" }],
  shopify: [{ text: "cdn.shopify.com" }, { text: "Shopify.theme" }, { text: "myshopify.com" }, { header: ["x-shopid"] }],
  godaddy: [{ text: "img1.wsimg.com" }, { text: "websites.godaddy.com" }],
  duda: [{ text: "cdn-website.com" }, { text: "dmAPI" }, { text: "d-js-one-runtime" }],
  framer: [{ text: "framerusercontent.com" }, { text: "data-framer-" }],
  square: [{ text: "editmysite.com" }, { text: "squarecdn.com" }, { text: ".square.site" }],
  carrd: [{ text: "carrd.co" }],
  "google-sites": [{ text: "sites.google.com" }, { text: "gstatic.com/atari" }],
};

function clip(value: string, max = MAX_EVIDENCE_LENGTH): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** `name="generator"` contents from the first tags in the head window, any attribute order. */
function generatorContents(html: string): string[] {
  const window = html.slice(0, META_WINDOW);
  const found: string[] = [];
  const tag = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(window)) && found.length < MAX_GENERATORS) {
    const attrs = match[0];
    if (!/\bname\s*=\s*(["']?)generator\1(?=[\s/>])/i.test(attrs)) continue;
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs);
    const value = (content?.[1] ?? content?.[2] ?? content?.[3] ?? "").trim();
    if (value) found.push(value);
  }
  return found;
}

export function detectSitePlatform(input: { html: string; headers?: Record<string, string | null | undefined> }): PlatformDetection {
  const generators = generatorContents(input.html);
  for (const content of generators) {
    for (const [pattern, platform] of GENERATOR_RULES) {
      if (pattern.test(content)) return { platform, evidence: [clip(`generator: ${clip(content, 80)}`)], confident: true };
    }
  }

  const body = input.html.slice(0, BODY_WINDOW).toLowerCase();
  const headers = new Map<string, string>();
  for (const [name, value] of Object.entries(input.headers ?? {})) if (value) headers.set(name.toLowerCase(), value);

  const hits = new Map<SitePlatform, string[]>();
  for (const platform of GUIDE_ORDER) {
    const list: string[] = [];
    for (const print of FINGERPRINTS[platform] ?? []) {
      if (print.text !== undefined) {
        if (body.includes(print.text.toLowerCase())) list.push(print.text);
      } else if (print.header) {
        const [name, pattern] = print.header;
        const value = headers.get(name);
        if (value !== undefined && (!pattern || pattern.test(value))) list.push(`header ${name}`);
      }
    }
    if (list.length) hits.set(platform, list);
  }

  let best: SitePlatform | null = null;
  for (const platform of GUIDE_ORDER) {
    const score = hits.get(platform)?.length ?? 0;
    if (score > (best ? hits.get(best)!.length : 0)) best = platform;
  }
  if (!best) return { platform: "unknown", evidence: [], confident: false };
  const evidence = hits.get(best)!.slice(0, MAX_EVIDENCE).map(item => clip(item));
  return { platform: best, evidence, confident: hits.get(best)!.length >= 2 };
}
