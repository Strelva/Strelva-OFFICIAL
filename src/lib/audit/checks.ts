import * as cheerio from "cheerio";
import type { CategoryResult, CheckResult, PageSpeedResult } from "./types";
import { averageCheckScores } from "./scoring";

// ---------------------------------------------------------------------------
// Category weights (must sum to 1)
// ---------------------------------------------------------------------------
const WEIGHTS = {
  webVitals: 0.3,
  seo: 0.25,
  mobile: 0.2,
  schema: 0.1,
  ssl: 0.1,
  a11y: 0.05,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() =>
    clearTimeout(timeout)
  );
}

// ---------------------------------------------------------------------------
// 1. Core Web Vitals (via Google PageSpeed Insights API)
// ---------------------------------------------------------------------------
async function checkWebVitals(
  url: string,
  apiKey: string | undefined
): Promise<CategoryResult> {
  const checks: CheckResult[] = [];

  if (!apiKey) {
    checks.push({
      name: "PageSpeed API",
      status: "warn",
      score: 50,
      message: "PageSpeed API key not configured",
      details: "Set GOOGLE_PAGESPEED_API_KEY to enable Core Web Vitals checks.",
    });
    return {
      name: "Core Web Vitals",
      slug: "web-vitals",
      weight: WEIGHTS.webVitals,
      score: 50,
      checks,
    };
  }

  try {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&strategy=mobile&category=PERFORMANCE`;
    const res = await fetchWithTimeout(apiUrl, 30_000);
    if (!res.ok) throw new Error(`PageSpeed API returned ${res.status}`);

    const data: PageSpeedResult = await res.json();
    const audits = data.lighthouseResult?.audits ?? {};
    const perfScore = data.lighthouseResult?.categories?.performance?.score;

    // LCP
    const lcpMs = audits["largest-contentful-paint"]?.numericValue ?? 0;
    const lcpScore =
      lcpMs <= 2500 ? 100 : lcpMs <= 4000 ? 60 : 20;
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

    // CLS
    const clsVal = audits["cumulative-layout-shift"]?.numericValue ?? 0;
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

    // INP / TBT (proxy for INP in lab data)
    const tbtMs = audits["total-blocking-time"]?.numericValue ?? 0;
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

    // Overall performance score
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
      weight: WEIGHTS.webVitals,
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
      weight: WEIGHTS.webVitals,
      score: 0,
      checks,
    };
  }
}

// ---------------------------------------------------------------------------
// 2. Mobile Responsiveness (from same PageSpeed API call)
// ---------------------------------------------------------------------------
async function checkMobile(
  url: string,
  apiKey: string | undefined
): Promise<CategoryResult> {
  const checks: CheckResult[] = [];

  if (!apiKey) {
    checks.push({
      name: "Mobile Check",
      status: "warn",
      score: 50,
      message: "PageSpeed API key not configured",
    });
    return {
      name: "Mobile Responsiveness",
      slug: "mobile",
      weight: WEIGHTS.mobile,
      score: 50,
      checks,
    };
  }

  try {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&strategy=mobile&category=PERFORMANCE`;
    const res = await fetchWithTimeout(apiUrl, 30_000);
    if (!res.ok) throw new Error(`PageSpeed API returned ${res.status}`);

    const data: PageSpeedResult = await res.json();
    const audits = data.lighthouseResult?.audits ?? {};

    // Viewport meta tag
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

    // Font size legibility
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

    // Tap targets
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
      weight: WEIGHTS.mobile,
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
      weight: WEIGHTS.mobile,
      score: 0,
      checks,
    };
  }
}

// ---------------------------------------------------------------------------
// 3. Basic SEO (parse HTML)
// ---------------------------------------------------------------------------
function checkSEO(html: string, _url: string): CategoryResult {
  const $ = cheerio.load(html);
  const checks: CheckResult[] = [];

  // Title tag
  const title = $("title").first().text().trim();
  if (!title) {
    checks.push({
      name: "Title Tag",
      status: "fail",
      score: 0,
      message: "No title tag found",
    });
  } else if (title.length < 30) {
    checks.push({
      name: "Title Tag",
      status: "warn",
      score: 60,
      message: `Title tag is short (${title.length} chars) — aim for 30-60 characters`,
      details: title,
    });
  } else if (title.length > 60) {
    checks.push({
      name: "Title Tag",
      status: "warn",
      score: 70,
      message: `Title tag is long (${title.length} chars) — may be truncated in search results`,
      details: title,
    });
  } else {
    checks.push({
      name: "Title Tag",
      status: "pass",
      score: 100,
      message: `Title tag found (${title.length} chars)`,
      details: title,
    });
  }

  // Meta description
  const metaDesc =
    $('meta[name="description"]').attr("content")?.trim() ?? "";
  if (!metaDesc) {
    checks.push({
      name: "Meta Description",
      status: "fail",
      score: 0,
      message: "No meta description found",
    });
  } else if (metaDesc.length < 70) {
    checks.push({
      name: "Meta Description",
      status: "warn",
      score: 60,
      message: `Meta description is short (${metaDesc.length} chars) — aim for 70-160 characters`,
    });
  } else if (metaDesc.length > 160) {
    checks.push({
      name: "Meta Description",
      status: "warn",
      score: 70,
      message: `Meta description is long (${metaDesc.length} chars) — may be truncated`,
    });
  } else {
    checks.push({
      name: "Meta Description",
      status: "pass",
      score: 100,
      message: `Meta description found (${metaDesc.length} chars)`,
    });
  }

  // H1 tag
  const h1Count = $("h1").length;
  if (h1Count === 0) {
    checks.push({
      name: "H1 Tag",
      status: "fail",
      score: 0,
      message: "No H1 tag found",
    });
  } else if (h1Count > 1) {
    checks.push({
      name: "H1 Tag",
      status: "warn",
      score: 60,
      message: `Multiple H1 tags found (${h1Count}) — use a single H1`,
    });
  } else {
    checks.push({
      name: "H1 Tag",
      status: "pass",
      score: 100,
      message: "Single H1 tag found",
      details: $("h1").first().text().trim().slice(0, 100),
    });
  }

  // Canonical URL
  const canonical = $('link[rel="canonical"]').attr("href")?.trim();
  checks.push({
    name: "Canonical URL",
    status: canonical ? "pass" : "warn",
    score: canonical ? 100 : 40,
    message: canonical
      ? "Canonical URL is set"
      : "No canonical URL found — may cause duplicate content issues",
    details: canonical,
  });

  // Robots meta
  const robotsMeta =
    $('meta[name="robots"]').attr("content")?.toLowerCase() ?? "";
  const isNoindex =
    robotsMeta.includes("noindex") || robotsMeta.includes("none");
  checks.push({
    name: "Robots Meta",
    status: isNoindex ? "warn" : "pass",
    score: isNoindex ? 30 : 100,
    message: isNoindex
      ? "Page is set to noindex — search engines will not index this page"
      : "Page is indexable by search engines",
  });

  return {
    name: "Basic SEO",
    slug: "seo",
    weight: WEIGHTS.seo,
    score: averageCheckScores(checks.map((c) => c.score)),
    checks,
  };
}

// ---------------------------------------------------------------------------
// 4. Schema / Structured Data
// ---------------------------------------------------------------------------
function checkSchema(html: string): CategoryResult {
  const $ = cheerio.load(html);
  const checks: CheckResult[] = [];

  // JSON-LD
  const jsonLdScripts = $('script[type="application/ld+json"]');
  const schemas: string[] = [];
  jsonLdScripts.each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text());
      const types = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of types) {
        if (item["@type"]) schemas.push(item["@type"]);
        if (item["@graph"]) {
          for (const g of item["@graph"]) {
            if (g["@type"]) schemas.push(g["@type"]);
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  });

  // Check for any structured data
  if (schemas.length === 0) {
    checks.push({
      name: "Structured Data",
      status: "fail",
      score: 0,
      message: "No JSON-LD structured data found",
      details:
        "Adding schema markup helps search engines understand your business",
    });
  } else {
    checks.push({
      name: "Structured Data",
      status: "pass",
      score: 100,
      message: `Found ${schemas.length} schema type(s)`,
      details: schemas.join(", "),
    });
  }

  // Check for local business schema specifically
  const localSchemas = [
    "LocalBusiness",
    "Organization",
    "Restaurant",
    "Store",
    "MedicalBusiness",
    "LegalService",
    "FinancialService",
    "AutoRepair",
    "HealthAndBeautyBusiness",
    "HomeAndConstructionBusiness",
    "ProfessionalService",
  ];
  const hasLocal = schemas.some((s) =>
    localSchemas.some((ls) => s.toLowerCase().includes(ls.toLowerCase()))
  );

  if (schemas.length > 0) {
    checks.push({
      name: "Business Schema",
      status: hasLocal ? "pass" : "warn",
      score: hasLocal ? 100 : 50,
      message: hasLocal
        ? "Local business or organization schema found"
        : "Structured data exists but no business-specific schema found",
      details: hasLocal
        ? undefined
        : "Consider adding LocalBusiness or Organization schema",
    });
  }

  return {
    name: "Schema / Structured Data",
    slug: "schema",
    weight: WEIGHTS.schema,
    score: averageCheckScores(checks.map((c) => c.score)),
    checks,
  };
}

// ---------------------------------------------------------------------------
// 5. SSL Certificate
// ---------------------------------------------------------------------------
async function checkSSL(url: string): Promise<CategoryResult> {
  const checks: CheckResult[] = [];
  const parsedUrl = new URL(url);

  // Check if URL is HTTPS
  if (parsedUrl.protocol === "https:") {
    checks.push({
      name: "HTTPS",
      status: "pass",
      score: 100,
      message: "Site is served over HTTPS",
    });
  } else {
    checks.push({
      name: "HTTPS",
      status: "fail",
      score: 0,
      message: "Site is not served over HTTPS",
      details: "HTTPS is required for security and SEO ranking",
    });
  }

  // Test that HTTPS version actually works
  if (parsedUrl.protocol !== "https:") {
    const httpsUrl = url.replace(/^http:/, "https:");
    try {
      const res = await fetchWithTimeout(httpsUrl, 8_000);
      checks.push({
        name: "HTTPS Available",
        status: res.ok ? "warn" : "fail",
        score: res.ok ? 60 : 0,
        message: res.ok
          ? "HTTPS is available but not the default — configure redirect"
          : "HTTPS version is not accessible",
      });
    } catch {
      checks.push({
        name: "HTTPS Available",
        status: "fail",
        score: 0,
        message: "Could not connect via HTTPS",
      });
    }
  }

  return {
    name: "SSL Certificate",
    slug: "ssl",
    weight: WEIGHTS.ssl,
    score: averageCheckScores(checks.map((c) => c.score)),
    checks,
  };
}

// ---------------------------------------------------------------------------
// 6. Basic Accessibility
// ---------------------------------------------------------------------------
function checkAccessibility(html: string): CategoryResult {
  const $ = cheerio.load(html);
  const checks: CheckResult[] = [];

  // Lang attribute
  const lang = $("html").attr("lang");
  checks.push({
    name: "Language Attribute",
    status: lang ? "pass" : "fail",
    score: lang ? 100 : 0,
    message: lang
      ? `HTML lang attribute is set (${lang})`
      : "Missing lang attribute on <html> tag",
  });

  // Alt tags on images
  const images = $("img");
  const totalImages = images.length;
  let missingAlt = 0;
  images.each((_, el) => {
    const alt = $(el).attr("alt");
    if (alt === undefined) missingAlt++;
  });

  if (totalImages === 0) {
    checks.push({
      name: "Image Alt Text",
      status: "pass",
      score: 100,
      message: "No images found on the page",
    });
  } else if (missingAlt === 0) {
    checks.push({
      name: "Image Alt Text",
      status: "pass",
      score: 100,
      message: `All ${totalImages} image(s) have alt attributes`,
    });
  } else {
    const ratio = (totalImages - missingAlt) / totalImages;
    checks.push({
      name: "Image Alt Text",
      status: ratio >= 0.8 ? "warn" : "fail",
      score: clamp(Math.round(ratio * 100), 0, 100),
      message: `${missingAlt} of ${totalImages} image(s) missing alt attributes`,
    });
  }

  return {
    name: "Accessibility",
    slug: "a11y",
    weight: WEIGHTS.a11y,
    score: averageCheckScores(checks.map((c) => c.score)),
    checks,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 stubs
// ---------------------------------------------------------------------------
export function stubGBPCompleteness(): CategoryResult {
  return {
    name: "Google Business Profile",
    slug: "gbp",
    weight: 0,
    score: 0,
    checks: [
      {
        name: "GBP Completeness",
        status: "warn",
        score: 0,
        message: "Coming soon — requires Google API integration",
      },
    ],
  };
}

export function stubNAPConsistency(): CategoryResult {
  return {
    name: "NAP Consistency",
    slug: "nap",
    weight: 0,
    score: 0,
    checks: [
      {
        name: "NAP Check",
        status: "warn",
        score: 0,
        message: "Coming soon — requires cross-directory scraping",
      },
    ],
  };
}

export function stubReviewPresence(): CategoryResult {
  return {
    name: "Review Presence",
    slug: "reviews",
    weight: 0,
    score: 0,
    checks: [
      {
        name: "Reviews",
        status: "warn",
        score: 0,
        message: "Coming soon — requires Google/Yelp API",
      },
    ],
  };
}

export function stubLocalSEOGrid(): CategoryResult {
  return {
    name: "Local SEO Grid",
    slug: "local-grid",
    weight: 0,
    score: 0,
    checks: [
      {
        name: "Local Grid",
        status: "warn",
        score: 0,
        message: "Coming soon — requires DataForSEO integration",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------
export async function runAudit(inputUrl: string): Promise<CategoryResult[]> {
  // Normalize URL
  let url = inputUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;

  // Fetch the page HTML
  let html = "";
  let fetchedUrl = url;
  try {
    const res = await fetchWithTimeout(url, 15_000);
    html = await res.text();
    fetchedUrl = res.url; // after redirects
  } catch {
    // Try with http if https failed
    if (url.startsWith("https://")) {
      try {
        const httpUrl = url.replace(/^https:/, "http:");
        const res = await fetchWithTimeout(httpUrl, 15_000);
        html = await res.text();
        fetchedUrl = res.url;
      } catch {
        // Will proceed with empty html — checks will reflect missing data
      }
    }
  }

  // Run checks in parallel where possible
  const [webVitals, mobile, ssl] = await Promise.all([
    checkWebVitals(fetchedUrl, apiKey),
    checkMobile(fetchedUrl, apiKey),
    checkSSL(fetchedUrl),
  ]);

  // These are sync and use the HTML we already fetched
  const seo = checkSEO(html, fetchedUrl);
  const schema = checkSchema(html);
  const a11y = checkAccessibility(html);

  return [webVitals, seo, mobile, schema, ssl, a11y];
}
