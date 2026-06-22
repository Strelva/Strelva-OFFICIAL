import * as dns from "node:dns";
import * as cheerio from "cheerio";
import type { AuditContext } from "./context";
import type { CategoryResult, CheckResult, PageSpeedResult } from "./types";
import { averageCheckScores } from "./scoring";
import { attachImpact } from "./impact";
import { guideRefsForCategory } from "@/lib/guides";
import { checkAiReadability } from "./modules/ai-readability";
import { checkSeoFoundations } from "./modules/seo-foundations";
import { checkSecurity } from "./modules/security";
import { checkAccessibility } from "./modules/accessibility";
import { checkTrust } from "./modules/trust";
import { checkContent } from "./modules/content";

// ---------------------------------------------------------------------------
// SSRF protection
// ---------------------------------------------------------------------------
export function isPrivateIP(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts[0] === 0) return true;
  if (parts[0] === 10) return true;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 198 && parts[1] >= 18 && parts[1] <= 19) return true;
  return false;
}

export async function validateUrlSafety(url: string): Promise<{ address: string }> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Blocked: non-HTTP scheme "${parsed.protocol}"`);
  }
  // Force IPv4 to prevent IPv6 SSRF bypass (::1, ::ffff:127.0.0.1, fe80::, etc.)
  const { address } = await dns.promises.lookup(parsed.hostname, { family: 4 });
  if (isPrivateIP(address)) {
    throw new Error(`Blocked: resolved to private IP ${address}`);
  }
  return { address };
}

// ---------------------------------------------------------------------------
// Category weights (the slugs the modules emit). Sums to 1.0; the roll-up in
// scoring.ts redistributes proportionally when a category is excluded
// (weight 0), so a URL-only run with no PageSpeed key still grades honestly.
// ---------------------------------------------------------------------------
const WEIGHTS: Record<string, number> = {
  "ai-readability": 0.2,
  seo: 0.18,
  "web-vitals": 0.15,
  security: 0.12,
  a11y: 0.1,
  mobile: 0.1,
  trust: 0.08,
  content: 0.07,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() =>
    clearTimeout(timeout)
  );
}

/** Best-effort GET of a well-known file; null on any miss/error. */
async function fetchTextSafe(url: string, ms = 6000): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url, ms);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shared PageSpeed API fetch (used by webVitals + mobile)
// ---------------------------------------------------------------------------
// Note: Google PageSpeed API requires the key as a query parameter.
// Ensure Sentry/logging does not capture full request URLs to prevent key leakage.
async function fetchPageSpeedData(
  url: string,
  apiKey: string | undefined
): Promise<PageSpeedResult | null> {
  if (!apiKey) return null;
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&strategy=mobile&category=PERFORMANCE`;
  const res = await fetchWithTimeout(apiUrl, 30_000);
  if (!res.ok) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// Core Web Vitals (via Google PageSpeed Insights API)
// ---------------------------------------------------------------------------
async function checkWebVitals(
  _url: string,
  apiKey: string | undefined,
  psData: PageSpeedResult | null
): Promise<CategoryResult> {
  const checks: CheckResult[] = [];

  if (!apiKey || !psData) {
    checks.push({
      name: "PageSpeed API",
      status: "warn",
      score: 50,
      message: "Core Web Vitals not measured",
      details: "Set GOOGLE_PAGESPEED_API_KEY to include real load-speed data.",
    });
    return {
      name: "Core Web Vitals",
      // Weight 0 so an uninstrumented category is EXCLUDED from the overall
      // grade rather than injecting a 50-point participation score.
      slug: "web-vitals",
      weight: 0,
      score: 50,
      checks,
    };
  }

  try {
    const audits = psData.lighthouseResult?.audits ?? {};
    const perfScore = psData.lighthouseResult?.categories?.performance?.score;

    const lcpMs = audits["largest-contentful-paint"]?.numericValue ?? 8000;
    const lcpScore = lcpMs <= 2500 ? 100 : lcpMs <= 4000 ? 60 : 20;
    checks.push({
      name: "Largest Contentful Paint (LCP)",
      status: lcpScore >= 80 ? "pass" : lcpScore >= 50 ? "warn" : "fail",
      score: lcpScore,
      message:
        lcpMs <= 2500
          ? `LCP is ${(lcpMs / 1000).toFixed(1)}s (good)`
          : lcpMs <= 4000
            ? `LCP is ${(lcpMs / 1000).toFixed(1)}s (needs improvement)`
            : `LCP is ${(lcpMs / 1000).toFixed(1)}s (poor)`,
    });

    const clsVal = audits["cumulative-layout-shift"]?.numericValue ?? 0.5;
    const clsScore = clsVal <= 0.1 ? 100 : clsVal <= 0.25 ? 60 : 20;
    checks.push({
      name: "Cumulative Layout Shift (CLS)",
      status: clsScore >= 80 ? "pass" : clsScore >= 50 ? "warn" : "fail",
      score: clsScore,
      message:
        clsVal <= 0.1
          ? `CLS is ${clsVal.toFixed(3)} (good)`
          : clsVal <= 0.25
            ? `CLS is ${clsVal.toFixed(3)} (needs improvement)`
            : `CLS is ${clsVal.toFixed(3)} (poor)`,
    });

    const tbtMs = audits["total-blocking-time"]?.numericValue ?? 1000;
    const tbtScore = tbtMs <= 200 ? 100 : tbtMs <= 600 ? 60 : 20;
    checks.push({
      name: "Total Blocking Time (TBT)",
      status: tbtScore >= 80 ? "pass" : tbtScore >= 50 ? "warn" : "fail",
      score: tbtScore,
      message:
        tbtMs <= 200
          ? `TBT is ${Math.round(tbtMs)}ms (good)`
          : tbtMs <= 600
            ? `TBT is ${Math.round(tbtMs)}ms (needs improvement)`
            : `TBT is ${Math.round(tbtMs)}ms (poor)`,
    });

    if (perfScore != null) {
      const perf = Math.round(perfScore * 100);
      checks.push({
        name: "Performance Score",
        status: perf >= 90 ? "pass" : perf >= 50 ? "warn" : "fail",
        score: perf,
        message: `Google PageSpeed performance score: ${perf}/100`,
      });
    }

    return {
      name: "Core Web Vitals",
      slug: "web-vitals",
      weight: WEIGHTS["web-vitals"],
      score: averageCheckScores(checks.map((c) => c.score)),
      checks,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    checks.push({
      name: "PageSpeed API",
      status: "fail",
      score: 0,
      message: `Failed to fetch PageSpeed data: ${msg}`,
    });
    return {
      name: "Core Web Vitals",
      slug: "web-vitals",
      weight: WEIGHTS["web-vitals"],
      score: 0,
      checks,
    };
  }
}

// ---------------------------------------------------------------------------
// Mobile Responsiveness (from same PageSpeed API call)
// ---------------------------------------------------------------------------
async function checkMobile(
  _url: string,
  apiKey: string | undefined,
  psData: PageSpeedResult | null
): Promise<CategoryResult> {
  const checks: CheckResult[] = [];

  if (!apiKey || !psData) {
    checks.push({
      name: "Mobile Check",
      status: "warn",
      score: 50,
      message: "Mobile responsiveness not measured",
    });
    return {
      name: "Mobile Responsiveness",
      slug: "mobile",
      weight: 0,
      score: 50,
      checks,
    };
  }

  try {
    const audits = psData.lighthouseResult?.audits ?? {};

    const viewportAudit = audits["viewport"];
    const hasViewport = viewportAudit?.score === 1;
    checks.push({
      name: "Viewport Meta Tag",
      status: hasViewport ? "pass" : "fail",
      score: hasViewport ? 100 : 0,
      message: hasViewport
        ? "Viewport meta tag is properly configured"
        : "Missing or misconfigured viewport meta tag",
    });

    const fontSizeAudit = audits["font-size"];
    const fontOk = fontSizeAudit?.score === 1;
    checks.push({
      name: "Legible Font Sizes",
      status: fontOk ? "pass" : "warn",
      score: fontOk ? 100 : 40,
      message: fontOk
        ? "Text is legible on mobile devices"
        : "Some text may be too small on mobile",
    });

    const tapAudit = audits["tap-targets"];
    const tapOk = tapAudit?.score === 1;
    checks.push({
      name: "Tap Target Sizing",
      status: tapOk ? "pass" : "warn",
      score: tapOk ? 100 : 50,
      message: tapOk
        ? "Tap targets are appropriately sized"
        : "Some tap targets may be too small or too close together",
    });

    return {
      name: "Mobile Responsiveness",
      slug: "mobile",
      weight: WEIGHTS["mobile"],
      score: averageCheckScores(checks.map((c) => c.score)),
      checks,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    checks.push({
      name: "Mobile Check",
      status: "fail",
      score: 0,
      message: `Failed to check mobile responsiveness: ${msg}`,
    });
    return {
      name: "Mobile Responsiveness",
      slug: "mobile",
      weight: WEIGHTS["mobile"],
      score: 0,
      checks,
    };
  }
}

// ---------------------------------------------------------------------------
// Build the shared audit context (one homepage fetch + the well-known files)
// ---------------------------------------------------------------------------
async function buildAuditContext(
  startUrl: string
): Promise<{ ctx: AuditContext; fetchedUrl: string }> {
  let html = "";
  let fetchedUrl = startUrl;
  let headers = new Headers();

  try {
    const res = await fetchWithTimeout(startUrl, 15_000);
    html = await res.text();
    fetchedUrl = res.url || startUrl;
    headers = res.headers;
  } catch {
    if (startUrl.startsWith("https://")) {
      try {
        const httpUrl = startUrl.replace(/^https:/, "http:");
        const res = await fetchWithTimeout(httpUrl, 15_000);
        html = await res.text();
        fetchedUrl = res.url || httpUrl;
        headers = res.headers;
      } catch {
        // proceed with empty html — modules reflect missing data honestly
      }
    }
  }

  // DNS-rebinding guard: if a redirect changed host, re-validate the final host.
  const finalUrl = new URL(fetchedUrl);
  if (finalUrl.hostname !== new URL(startUrl).hostname) {
    const { address } = await dns.promises.lookup(finalUrl.hostname, { family: 4 });
    if (isPrivateIP(address)) {
      throw new Error(`Blocked: redirect target resolved to private IP ${address}`);
    }
  }

  const origin = finalUrl.origin;
  const [robotsTxt, sitemapXml, llmsTxt] = await Promise.all([
    fetchTextSafe(`${origin}/robots.txt`),
    fetchTextSafe(`${origin}/sitemap.xml`),
    fetchTextSafe(`${origin}/llms.txt`),
  ]);

  const ctx: AuditContext = {
    url: fetchedUrl,
    html,
    $: cheerio.load(html),
    headers,
    robotsTxt,
    sitemapXml,
    llmsTxt,
  };
  return { ctx, fetchedUrl };
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------
export async function runAudit(inputUrl: string): Promise<CategoryResult[]> {
  let url = inputUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  // SSRF protection — reject private/internal addresses before any fetch.
  await validateUrlSafety(url);

  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;

  const { ctx, fetchedUrl } = await buildAuditContext(url);

  // PageSpeed (one shared call) feeds the two performance categories.
  const psData = await fetchPageSpeedData(fetchedUrl, apiKey);
  const [webVitals, mobile] = await Promise.all([
    checkWebVitals(fetchedUrl, apiKey, psData),
    checkMobile(fetchedUrl, apiKey, psData),
  ]);

  // The ported single-fetch modules run synchronously off the shared context.
  const moduleResults = [
    checkAiReadability(ctx),
    checkSeoFoundations(ctx),
    checkSecurity(ctx),
    checkAccessibility(ctx),
    checkTrust(ctx),
    checkContent(ctx),
  ].map((cat) => ({ ...cat, weight: WEIGHTS[cat.slug] ?? 0 }));

  const categories = [webVitals, mobile, ...moduleResults];

  // Attach the "what this costs you" narrative + fix priority to every finding.
  for (const cat of categories) attachImpact(cat);

  // Cross-link weak categories (needs improvement) to the `/guides` articles
  // that fix them. Server-only: guideRefsForCategory returns a light
  // {slug,title} shape, so no guide HTML crosses to the client.
  for (const cat of categories) {
    if (cat.score >= 80) continue;
    const refs = guideRefsForCategory(cat.slug);
    if (refs.length > 0) cat.guides = refs;
  }

  return categories;
}
