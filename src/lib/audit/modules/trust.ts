import type { AuditContext } from "../context";
import type { CategoryResult, CheckResult } from "../types";
import { averageCheckScores } from "../scoring";

/**
 * Trust Signals audit module — ported from OWSH Systems'
 * `src/services/trust-signals.js` (`auditTrustSignals`). Pure: reads only from
 * the shared AuditContext (no network). Scores /100 with the OWSH module's own
 * weighting (HTTPS 15, badges up to 26, contact up to 15, legal pages 10,
 * social proof up to 15, transparency up to 10, comprehensiveness bonus up to
 * 10) and maps the findings into plain-English CheckResults.
 */

type Importance = "high" | "medium" | "low";

interface TrustBadge {
  patterns: RegExp[];
  name: string;
  importance: Importance;
}

// Trust badge / credential patterns (text or HTML).
const TRUST_BADGES: Record<string, TrustBadge> = {
  bbb: {
    patterns: [/bbb\.org/i, /better business bureau/i, /bbb accredited/i, /bbb-logo/i],
    name: "BBB Accredited",
    importance: "high",
  },
  ssl: {
    patterns: [/secure.*checkout/i, /ssl.*certificate/i, /256.*bit.*encryption/i],
    name: "SSL/Secure",
    importance: "high",
  },
  googleReviews: {
    patterns: [/google.*review/i, /\d+\s*(google|★)\s*review/i],
    name: "Google Reviews",
    importance: "high",
  },
  yelpBadge: {
    patterns: [/yelp.*review/i, /yelp.*rating/i],
    name: "Yelp Reviews",
    importance: "medium",
  },
  licenses: {
    patterns: [/licensed/i, /license\s*#/i, /lic\s*#/i, /contractor.*license/i],
    name: "Licensed",
    importance: "high",
  },
  insured: {
    patterns: [/insured/i, /fully insured/i, /bonded.*insured/i],
    name: "Insured",
    importance: "high",
  },
  yearsInBusiness: {
    patterns: [
      /\d+\s*years?\s*(in business|of experience|serving)/i,
      /since\s*(19|20)\d{2}/i,
      /established\s*(19|20)\d{2}/i,
    ],
    name: "Years in Business",
    importance: "medium",
  },
  familyOwned: {
    patterns: [/family[\s-]?owned/i, /family[\s-]?operated/i, /locally owned/i, /local business/i],
    name: "Family/Locally Owned",
    importance: "low",
  },
  guarantees: {
    patterns: [/satisfaction\s*guarantee/i, /money[\s-]?back\s*guarantee/i, /100%\s*guarantee/i, /warranty/i],
    name: "Guarantees/Warranty",
    importance: "medium",
  },
  certifications: {
    patterns: [/certified/i, /certification/i, /accredited/i, /member of/i],
    name: "Certifications",
    importance: "medium",
  },
  awards: {
    patterns: [/award[\s-]?winning/i, /voted\s*#?\d*\s*best/i, /best of/i, /top rated/i],
    name: "Awards/Recognition",
    importance: "low",
  },
};

interface FoundBadge {
  name: string;
  importance: Importance;
}

interface TrustAnalysis {
  trustBadges: Record<string, FoundBadge>;
  hasTestimonials: boolean;
  hasTeamPage: boolean;
  hasPrivacyPolicy: boolean;
  hasTerms: boolean;
  hasPhysicalAddress: boolean;
  hasPhoneNumber: boolean;
  hasClickToCall: boolean;
  hasBusinessHours: boolean;
  hasPaymentIcons: boolean;
  hasAssociations: boolean;
  isHttps: boolean;
}

function analyze(ctx: AuditContext): TrustAnalysis {
  const $ = ctx.$;
  const bodyText = ($("body").text() || "").toLowerCase();
  const bodyHtml = $("body").html() || "";

  const trustBadges: Record<string, FoundBadge> = {};
  for (const [badgeId, badge] of Object.entries(TRUST_BADGES)) {
    for (const pattern of badge.patterns) {
      if (pattern.test(bodyText) || pattern.test(bodyHtml)) {
        trustBadges[badgeId] = { name: badge.name, importance: badge.importance };
        break;
      }
    }
  }

  const hasTestimonials =
    $('[class*="testimonial"], [id*="testimonial"], [class*="review"], [id*="review"]').length > 0 ||
    /testimonial/i.test(bodyText) ||
    /what (our )?customers (are )?say/i.test(bodyText) ||
    /customer review/i.test(bodyText);

  const hasTeamPage =
    $('a[href*="team"], a[href*="staff"], a[href*="about-us"], a:contains("Our Team"), a:contains("Meet")').length > 0;

  const hasPrivacyPolicy =
    $('a[href*="privacy"], a:contains("Privacy Policy"), a:contains("Privacy")').length > 0;

  const hasTerms =
    $('a[href*="terms"], a:contains("Terms of Service"), a:contains("Terms")').length > 0;

  const addressPattern =
    /\d+\s+[\w\s]+(?:st(?:reet)?|ave(?:nue)?|blvd|rd|dr(?:ive)?|ln|lane|way|ct|court|pl(?:ace)?)[,.\s]+[\w\s]+,?\s*[A-Z]{2}\s*\d{5}/i;
  const hasPhysicalAddress = addressPattern.test(bodyText);

  const phonePattern = /(?:\+1\s?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/;
  const hasPhoneNumber = phonePattern.test(bodyText);

  const hasClickToCall = $('a[href^="tel:"]').length > 0;

  const hasBusinessHours =
    /(?:hours|open|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*:?\s*\d/i.test(bodyText) ||
    $('[class*="hours"], [id*="hours"]').length > 0;

  const hasPaymentIcons =
    /visa|mastercard|amex|american express|discover|paypal|credit card/i.test(bodyText) ||
    $('img[src*="visa"], img[src*="mastercard"], img[src*="paypal"], img[alt*="visa"], img[alt*="mastercard"]')
      .length > 0;

  const hasAssociations = /member of|affiliated with|association|chamber of commerce/i.test(bodyText);

  const isHttps = ctx.url.startsWith("https://");

  return {
    trustBadges,
    hasTestimonials,
    hasTeamPage,
    hasPrivacyPolicy,
    hasTerms,
    hasPhysicalAddress,
    hasPhoneNumber,
    hasClickToCall,
    hasBusinessHours,
    hasPaymentIcons,
    hasAssociations,
    isHttps,
  };
}

/** OWSH's own /100 trust score. Mirrors trust-signals.js `calculateScore`. */
function calculateScore(a: TrustAnalysis): number {
  let score = 0;

  // HTTPS (15)
  if (a.isHttps) score += 15;

  // Trust badges (up to 26)
  const badges = Object.values(a.trustBadges);
  const high = badges.filter((b) => b.importance === "high").length;
  const medium = badges.filter((b) => b.importance === "medium").length;
  const low = badges.filter((b) => b.importance === "low").length;
  score += Math.min(high * 6, 18);
  score += Math.min(medium * 3, 6);
  score += Math.min(low * 1, 2);

  // Contact information (up to 15)
  if (a.hasPhoneNumber) score += 5;
  if (a.hasClickToCall) score += 3;
  if (a.hasPhysicalAddress) score += 5;
  if (a.hasBusinessHours) score += 2;

  // Legal pages (up to 10)
  if (a.hasPrivacyPolicy) score += 5;
  if (a.hasTerms) score += 5;

  // Social proof (up to 15)
  if (a.hasTestimonials) score += 10;
  if (a.hasAssociations) score += 5;

  // Transparency (up to 10)
  if (a.hasTeamPage) score += 5;
  if (a.hasPaymentIcons) score += 5;

  // Comprehensiveness bonus (up to 10)
  const totalSignals =
    Object.keys(a.trustBadges).length +
    (a.hasTestimonials ? 1 : 0) +
    (a.hasPrivacyPolicy ? 1 : 0) +
    (a.hasPhysicalAddress ? 1 : 0);
  if (totalSignals >= 6) score += 10;
  else if (totalSignals >= 4) score += 5;

  return Math.min(100, score);
}

function statusFor(score: number): CheckResult["status"] {
  if (score >= 80) return "pass";
  if (score >= 50) return "warn";
  return "fail";
}

function check(name: string, score: number, message: string, details?: string): CheckResult {
  return { name, status: statusFor(score), score, message, details };
}

export function checkTrust(ctx: AuditContext): CategoryResult {
  const a = analyze(ctx);
  const checks: CheckResult[] = [];

  // Secure connection (HTTPS)
  checks.push(
    a.isHttps
      ? check("Secure connection (HTTPS)", 100, "Your site loads over HTTPS, which visitors and search engines trust.")
      : check(
          "Secure connection (HTTPS)",
          0,
          "Your site is not served over HTTPS. Browsers flag it as not secure, which scares visitors away.",
        ),
  );

  // Contact info visible
  {
    const bits: string[] = [];
    let s = 0;
    if (a.hasPhoneNumber) {
      s += 55;
      bits.push("phone number");
    }
    if (a.hasPhysicalAddress) {
      s += 35;
      bits.push("physical address");
    }
    if (a.hasBusinessHours) {
      s += 10;
      bits.push("business hours");
    }
    const present = bits.length ? `Shows: ${bits.join(", ")}.` : "No phone number, address, or hours were found.";
    checks.push(
      check(
        "Contact info visible",
        s,
        s >= 80
          ? "Visitors can clearly see how and where to reach you."
          : s >= 50
            ? "Some contact details are visible, but the page is missing key ones customers look for."
            : "Customers cannot easily find how to reach you, which kills trust and conversions.",
        present,
      ),
    );
  }

  // Click-to-call
  checks.push(
    a.hasClickToCall
      ? check("Click-to-call", 100, "Your phone number is a tap-to-call link, which is easy for mobile visitors.")
      : check(
          "Click-to-call",
          0,
          "There is no tap-to-call link. Mobile visitors have to copy your number by hand to call you.",
        ),
  );

  // Trust badges & credentials
  {
    const badgeNames = Object.values(a.trustBadges).map((b) => b.name);
    const high = Object.values(a.trustBadges).filter((b) => b.importance === "high").length;
    const medium = Object.values(a.trustBadges).filter((b) => b.importance === "medium").length;
    const low = Object.values(a.trustBadges).filter((b) => b.importance === "low").length;
    const raw = Math.min(high * 6, 18) + Math.min(medium * 3, 6) + Math.min(low, 2); // out of 26
    const s = Math.round((raw / 26) * 100);
    checks.push(
      check(
        "Trust badges & credentials",
        s,
        s >= 80
          ? "Your site shows strong credibility signals like licenses, accreditations, or guarantees."
          : s >= 50
            ? "You show a few credibility signals, but adding licenses, awards, or guarantees would build more trust."
            : "Your site shows little proof of credibility (licensing, insurance, certifications, awards, or guarantees).",
        badgeNames.length ? `Found: ${badgeNames.join(", ")}.` : "No trust badges or credentials detected.",
      ),
    );
  }

  // Customer testimonials
  checks.push(
    a.hasTestimonials
      ? check("Customer testimonials", 100, "Your site displays testimonials or reviews, which reassures new customers.")
      : check(
          "Customer testimonials",
          0,
          "No customer testimonials or reviews are shown. Social proof is one of the strongest trust signals.",
        ),
  );

  // Privacy & terms pages
  {
    const have: string[] = [];
    let s = 0;
    if (a.hasPrivacyPolicy) {
      s += 50;
      have.push("Privacy Policy");
    }
    if (a.hasTerms) {
      s += 50;
      have.push("Terms of Service");
    }
    checks.push(
      check(
        "Privacy & terms pages",
        s,
        s >= 80
          ? "Your site links to its legal pages, which signals a legitimate business."
          : s >= 50
            ? "Only one legal page is linked. Add the other so your site looks fully legitimate."
            : "No privacy policy or terms links were found. These are expected on a trustworthy business site.",
        have.length ? `Linked: ${have.join(", ")}.` : "Neither a privacy policy nor terms link was found.",
      ),
    );
  }

  // Team / about transparency
  checks.push(
    a.hasTeamPage
      ? check("Team transparency", 100, "Your site links to a team or about page, which puts a face to the business.")
      : check(
          "Team transparency",
          0,
          "No team or about page link was found. Showing the people behind the business builds trust.",
        ),
  );

  const score = calculateScore(a);

  return {
    name: "Trust Signals",
    slug: "trust",
    weight: 0, // runner overrides
    // Prefer OWSH's own weighted /100; fall back to the check average defensively.
    score: Number.isFinite(score) ? score : averageCheckScores(checks.map((c) => c.score)),
    checks,
  };
}
