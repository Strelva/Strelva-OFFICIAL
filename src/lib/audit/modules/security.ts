import type { AuditContext } from "../context";
import type { CategoryResult, CheckResult } from "../types";
import { averageCheckScores } from "../scoring";

/**
 * Security audit module — ported from OWSH Systems' `securityAnalysis.ts`
 * (`analyzeSecurityComplete`). Replaces the thin SSL-only SSL check with real
 * security signals that come free with the homepage fetch: response headers,
 * mixed content, form submission safety, and cookie-consent presence.
 *
 * Pure: reads only from `ctx` (url, html, $, headers). No network calls.
 */

// ---------------------------------------------------------------------------
// Security headers configuration (ported sub-weights: critical 4 / high 3 / medium 2 / low 1)
// ---------------------------------------------------------------------------
type Importance = "critical" | "high" | "medium" | "low";

interface HeaderConfig {
  header: string;
  displayName: string;
  importance: Importance;
  goodValues?: string[];
}

const SECURITY_HEADERS: HeaderConfig[] = [
  {
    header: "strict-transport-security",
    displayName: "HSTS",
    importance: "critical",
    goodValues: ["max-age=31536000", "max-age=63072000"],
  },
  {
    header: "content-security-policy",
    displayName: "Content-Security-Policy",
    importance: "high",
  },
  {
    header: "x-frame-options",
    displayName: "X-Frame-Options",
    importance: "high",
    goodValues: ["deny", "sameorigin"],
  },
  {
    header: "x-content-type-options",
    displayName: "X-Content-Type-Options",
    importance: "medium",
    goodValues: ["nosniff"],
  },
  {
    header: "referrer-policy",
    displayName: "Referrer-Policy",
    importance: "medium",
    goodValues: [
      "no-referrer",
      "no-referrer-when-downgrade",
      "strict-origin",
      "strict-origin-when-cross-origin",
    ],
  },
  {
    header: "permissions-policy",
    displayName: "Permissions-Policy",
    importance: "low",
  },
  {
    header: "x-xss-protection",
    displayName: "X-XSS-Protection",
    importance: "low",
    goodValues: ["0", "1; mode=block"],
  },
];

function importanceWeight(importance: Importance): number {
  return importance === "critical"
    ? 4
    : importance === "high"
      ? 3
      : importance === "medium"
        ? 2
        : 1;
}

function statusFromScore(score: number): CheckResult["status"] {
  return score >= 80 ? "pass" : score >= 50 ? "warn" : "fail";
}

// ---------------------------------------------------------------------------
// Cookie-consent / GDPR detection patterns (ported)
// ---------------------------------------------------------------------------
const COOKIE_NOTICE_PATTERNS: RegExp[] = [
  /cookiebot/i,
  /onetrust/i,
  /trustarc/i,
  /usercentrics/i,
  /quantcast/i,
  /didomi/i,
  /osano/i,
  /termly/i,
  /iubenda/i,
  /cookie-law-info/i,
  /gdpr-cookie-consent/i,
  /cookie-notice/i,
  /cookie.?consent/i,
  /cookie.?banner/i,
  /cookie.?policy/i,
  /gdpr/i,
  /ccpa/i,
  /accept.?cookies/i,
];

const COOKIE_NOTICE_CLASS_PATTERNS = [
  "cookie-consent",
  "cookie-banner",
  "cookie-notice",
  "cookie-popup",
  "cookieconsent",
  "gdpr-banner",
  "gdpr-consent",
  "privacy-banner",
  "consent-banner",
  "cc-banner",
  "cc-window",
];

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/** HTTPS — first and most important signal. */
function checkHttps(ctx: AuditContext): CheckResult {
  let isHttps = false;
  try {
    isHttps = new URL(ctx.url).protocol === "https:";
  } catch {
    isHttps = false;
  }
  return {
    name: "HTTPS",
    status: isHttps ? "pass" : "fail",
    score: isHttps ? 100 : 0,
    message: isHttps
      ? "Your site loads securely over HTTPS."
      : "Your site does not load securely over HTTPS.",
    details: isHttps
      ? undefined
      : "The secure padlock is what earns visitor trust and helps you rank. Ask Strelva to turn on HTTPS and send every visitor to the secure version.",
  };
}

/** Security response headers (weighted by importance). Lists missing ones in details. */
function checkSecurityHeaders(ctx: AuditContext): CheckResult {
  let totalScore = 0;
  let maxScore = 0;
  const missing: string[] = [];

  for (const cfg of SECURITY_HEADERS) {
    const weight = importanceWeight(cfg.importance);
    maxScore += weight;

    const value = ctx.headers.get(cfg.header);
    if (!value) {
      missing.push(cfg.displayName);
      continue;
    }

    if (cfg.goodValues) {
      const isGood = cfg.goodValues.some((gv) =>
        value.toLowerCase().includes(gv.toLowerCase())
      );
      totalScore += isGood ? weight : weight * 0.5;
    } else {
      totalScore += weight;
    }
  }

  const score = maxScore === 0 ? 0 : Math.round((totalScore / maxScore) * 100);
  const present = SECURITY_HEADERS.length - missing.length;

  return {
    name: "Security headers",
    status: statusFromScore(score),
    score,
    message:
      missing.length === 0
        ? "All recommended security headers are in place."
        : `${present} of ${SECURITY_HEADERS.length} recommended security headers are in place.`,
    details:
      missing.length === 0
        ? undefined
        : `Missing headers: ${missing.join(", ")}. Ask Strelva to add these. They harden the site behind the scenes with no visible change.`,
  };
}

/** Mixed content — active http resources on an https page score 0, passive 50, none 100. */
function checkMixedContent(ctx: AuditContext): CheckResult {
  let isHttps = false;
  try {
    isHttps = new URL(ctx.url).protocol === "https:";
  } catch {
    isHttps = false;
  }

  // Mixed content only applies on an HTTPS page.
  if (!isHttps) {
    return {
      name: "No mixed content",
      status: "pass",
      score: 100,
      message: "Mixed content does not apply (page is not served over HTTPS).",
    };
  }

  const html = ctx.html;
  const active: string[] = [];
  const passive: string[] = [];

  const patterns: Array<{ regex: RegExp; kind: "active" | "passive" }> = [
    { regex: /<script[^>]+src=["']http:\/\/[^"']+["']/gi, kind: "active" },
    {
      regex: /<link[^>]+href=["']http:\/\/[^"']+["'][^>]*rel=["']stylesheet["']/gi,
      kind: "active",
    },
    {
      regex: /<link[^>]+rel=["']stylesheet["'][^>]*href=["']http:\/\/[^"']+["']/gi,
      kind: "active",
    },
    { regex: /<iframe[^>]+src=["']http:\/\/[^"']+["']/gi, kind: "active" },
    { regex: /<img[^>]+src=["']http:\/\/[^"']+["']/gi, kind: "passive" },
    { regex: /<video[^>]+src=["']http:\/\/[^"']+["']/gi, kind: "passive" },
    { regex: /<audio[^>]+src=["']http:\/\/[^"']+["']/gi, kind: "passive" },
    { regex: /<source[^>]+src=["']http:\/\/[^"']+["']/gi, kind: "passive" },
  ];

  for (const { regex, kind } of patterns) {
    const matches = html.match(regex) ?? [];
    for (const m of matches) {
      const urlMatch = m.match(/(?:src|href)=["'](http:\/\/[^"']+)["']/i);
      if (urlMatch) {
        if (kind === "active") active.push(urlMatch[1]);
        else passive.push(urlMatch[1]);
      }
    }
  }

  const total = active.length + passive.length;
  if (total === 0) {
    return {
      name: "No mixed content",
      status: "pass",
      score: 100,
      message: "No insecure HTTP resources found on the HTTPS page.",
    };
  }

  if (active.length > 0) {
    return {
      name: "No mixed content",
      status: "fail",
      score: 0,
      message: `${active.length} file(s) on this secure page still load over an insecure connection (scripts, styles, or embeds).`,
      details:
        "Browsers block these insecure files, which can break the page. Ask Strelva to switch them to the secure (HTTPS) version: " +
        active.slice(0, 5).join(", ") +
        (active.length > 5 ? ", ..." : "") +
        ".",
    };
  }

  return {
    name: "No mixed content",
    status: "warn",
    score: 50,
    message: `${passive.length} image or media file(s) on this secure page still load over an insecure connection.`,
    details:
      "These weaken the secure padlock and may not load. Ask Strelva to switch them to the secure (HTTPS) version: " +
      passive.slice(0, 5).join(", ") +
      (passive.length > 5 ? ", ..." : "") +
      ".",
  };
}

/** Form security — forms should submit over HTTPS and carry a CSRF token. */
function checkFormSecurity(ctx: AuditContext): CheckResult {
  let pageIsHttps = false;
  try {
    pageIsHttps = new URL(ctx.url).protocol === "https:";
  } catch {
    pageIsHttps = false;
  }

  const $ = ctx.$;
  const forms = $("form");
  const formsFound = forms.length;

  if (formsFound === 0) {
    return {
      name: "Form security",
      status: "pass",
      score: 100,
      message: "No forms found on the page.",
    };
  }

  let formsWithHttps = 0;
  let unprotectedSensitive = 0; // auth/state-changing forms lacking CSRF AND anti-abuse

  forms.each((_, el) => {
    const $form = $(el);
    const action = ($form.attr("action") ?? "").trim();

    if (action) {
      if (
        action.startsWith("https://") ||
        (action.startsWith("/") && pageIsHttps) ||
        (!action.includes("://") && pageIsHttps)
      ) {
        formsWithHttps++;
      }
      // action starting with http:// (or relative on an http page) is insecure
    } else if (pageIsHttps) {
      // No action submits to the current page; secure if the page is HTTPS.
      formsWithHttps++;
    }

    const formHtml = $.html($form);
    // A CSRF token only matters for a form that performs a sensitive,
    // state-changing action (login/account/password). A public contact or
    // newsletter form submitting over HTTPS is secure without one — grading it
    // down was capping every clean local-SMB site at 70/warn.
    const sensitive =
      /type=["']?password/i.test(formHtml) ||
      /(?:login|log-in|signin|sign-in|register|sign-?up|account|password|settings)/i.test(
        `${action} ${$form.attr("id") ?? ""} ${$form.attr("name") ?? ""} ${$form.attr("class") ?? ""}`
      );
    if (!sensitive) return;

    const hasCsrf =
      /name=["']?(?:csrf|_token|authenticity_token|_csrf_token)[^"']*["']?/i.test(
        formHtml
      ) || /type=["']?hidden["'][^>]*name=["']?(?:token|nonce)/i.test(formHtml);
    // Honeypot / captcha / a hosted third-party form handler are legitimate
    // anti-abuse that stand in for a CSRF token on a no-backend form.
    const hasAntiAbuse =
      /_gotcha|honeypot|recaptcha|hcaptcha|cf-turnstile|g-recaptcha/i.test(formHtml) ||
      /formspree|netlify|getform|basin|web3forms/i.test(action);
    if (!hasCsrf && !hasAntiAbuse) unprotectedSensitive++;
  });

  const httpsRatio = formsWithHttps / formsFound;
  // HTTPS submission is the whole score for ordinary public forms; only a
  // sensitive form missing both CSRF and anti-abuse caps it.
  let score = Math.round(httpsRatio * 100);
  if (unprotectedSensitive > 0) score = Math.min(score, 60);

  const insecure = formsFound - formsWithHttps;
  let message: string;
  if (insecure > 0) {
    message = `${insecure} of ${formsFound} form(s) may send what customers type over an insecure connection.`;
  } else if (unprotectedSensitive > 0) {
    message = `${unprotectedSensitive} sign-in/account form(s) should add a security token to block tampering.`;
  } else {
    message = `All ${formsFound} form(s) submit securely.`;
  }

  return {
    name: "Form security",
    status: statusFromScore(score),
    score,
    message,
    details:
      insecure > 0
        ? "Ask Strelva to make sure every form sends its data over the secure (HTTPS) connection so customer details stay protected."
        : undefined,
  };
}

/** Cookie consent / GDPR notice presence. */
function checkCookieConsent(ctx: AuditContext): CheckResult {
  const html = ctx.html;
  let detected = false;

  for (const pattern of COOKIE_NOTICE_PATTERNS) {
    if (pattern.test(html)) {
      detected = true;
      break;
    }
  }

  if (!detected) {
    for (const className of COOKIE_NOTICE_CLASS_PATTERNS) {
      const classRegex = new RegExp(
        `(class|id)=["'][^"']*${className}[^"']*["']`,
        "i"
      );
      if (classRegex.test(html)) {
        detected = true;
        break;
      }
    }
  }

  // Absence is a soft nudge, not a security hole: most local US small
  // businesses with no ad/tracking cookies don't legally need a banner (and
  // banner-fatigue argues against adding one), so a missing notice scores a
  // neutral warn rather than 0 — which used to drag the whole security grade.
  return {
    name: "Cookie consent",
    status: detected ? "pass" : "warn",
    score: detected ? 100 : 60,
    message: detected
      ? "A cookie consent notice is in place."
      : "No cookie consent notice was found.",
    details: detected
      ? undefined
      : "Only needed if you run analytics or ad cookies that track visitors. If you do, ask Strelva to add a short consent banner to stay compliant with GDPR/CCPA.",
  };
}

// ---------------------------------------------------------------------------
// Module entry point
// ---------------------------------------------------------------------------
export function checkSecurity(ctx: AuditContext): CategoryResult {
  const https = checkHttps(ctx);
  const headers = checkSecurityHeaders(ctx);
  const mixedContent = checkMixedContent(ctx);
  const formSecurity = checkFormSecurity(ctx);
  const cookieConsent = checkCookieConsent(ctx);

  const checks: CheckResult[] = [
    https,
    headers,
    mixedContent,
    formSecurity,
    cookieConsent,
  ];

  // Overall score uses the OWSH module's weighting where those signals exist
  // (headers 40, formSecurity 25, mixedContent 20, cookieConsent 15), folding
  // HTTPS in at the same weight as headers since it is the primary signal.
  const weighted = [
    { score: https.score, weight: 40 },
    { score: headers.score, weight: 40 },
    { score: formSecurity.score, weight: 25 },
    { score: mixedContent.score, weight: 20 },
    { score: cookieConsent.score, weight: 15 },
  ];
  const totalWeight = weighted.reduce((sum, s) => sum + s.weight, 0);
  const score =
    totalWeight === 0
      ? averageCheckScores(checks.map((c) => c.score))
      : Math.round(
          weighted.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight
        );

  return {
    name: "Security",
    slug: "security",
    weight: 0, // runner overrides
    score,
    checks,
  };
}
