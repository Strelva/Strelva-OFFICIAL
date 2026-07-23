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
    // For a local SMB, longevity ("since 1924", "25 years serving") is a top-tier
    // credibility signal — as strong as any license, so treat it as high.
    importance: "high",
  },
  familyOwned: {
    patterns: [/family[\s-]?owned/i, /family[\s-]?operated/i, /locally owned/i, /local business/i],
    name: "Family/Locally Owned",
    // A real, meaningful trust signal for local businesses, not a throwaway.
    importance: "medium",
  },
  guarantees: {
    patterns: [/satisfaction\s*guarantee/i, /money[\s-]?back\s*guarantee/i, /100%\s*guarantee/i, /warranty/i],
    name: "Guarantees/Warranty",
    importance: "medium",
  },
  certifications: {
    patterns: [/certified/i, /certification/i, /accredited/i, /member of/i],
    name: "Certifications",
    // A professional certification (QuickBooks/Ambrook certified, licensed
    // practitioner, etc.) is a top credibility signal for the ICP.
    importance: "high",
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
  hasEmail: boolean;
  hasContactForm: boolean;
  hasContactMethod: boolean;
  isHttps: boolean;
}

const US_STATE_NAMES =
  "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming";

// A structured JSON-LD PostalAddress (street + locality + region) is a
// higher-confidence "we have a real address" signal than any body-text regex,
// and it's what a well-built site emits. The brittle visible-text pattern was
// false-negativing sites (e.g. Orange Crate) that declare a full address in
// schema but format it loosely in the page copy.
function hasStructuredPostalAddress($: AuditContext["$"]): boolean {
  let found = false;
  $('script[type="application/ld+json"]').each((_i, el) => {
    if (found) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse($(el).text() || "{}");
    } catch {
      return;
    }
    const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      const obj = node as Record<string, unknown>;
      if (Array.isArray(obj["@graph"])) queue.push(...(obj["@graph"] as unknown[]));
      const addrs = Array.isArray(obj.address) ? obj.address : [obj.address];
      for (const a of addrs) {
        if (a && typeof a === "object") {
          const ao = a as Record<string, unknown>;
          if (ao.streetAddress && ao.addressLocality && ao.addressRegion) {
            found = true;
            return;
          }
        }
      }
    }
  });
  return found;
}

function analyze(ctx: AuditContext): TrustAnalysis {
  const $ = ctx.$;
  // VISIBLE text only — matching trust signals (licensed/certified/warranty/
  // testimonials/hours) against raw HTML granted credit from inline <script>
  // bundle strings on CSR sites. visibleText has script/style stripped.
  const bodyText = ctx.visibleText.toLowerCase();

  const trustBadges: Record<string, FoundBadge> = {};
  for (const [badgeId, badge] of Object.entries(TRUST_BADGES)) {
    for (const pattern of badge.patterns) {
      if (pattern.test(bodyText)) {
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

  // Match any "about"/team/story link or nav item — an /about page, an #about
  // anchor on a one-pager, or "About Us"/"Our Story"/"Who We Are" text. (Was
  // hyphen-specific "about-us" + "team"/"staff" only, so plain "About" sections
  // — which most local sites use — didn't count.)
  const hasTeamPage =
    $(
      'a[href*="about"], a[href*="team"], a[href*="staff"], a[href*="story"], ' +
        'a:contains("About"), a:contains("Our Team"), a:contains("Our Story"), ' +
        'a:contains("Who We Are"), a:contains("Meet")'
    ).length > 0;

  const hasPrivacyPolicy =
    $('a[href*="privacy"], a:contains("Privacy Policy"), a:contains("Privacy")').length > 0;

  const hasTerms =
    $('a[href*="terms"], a:contains("Terms of Service"), a:contains("Terms")').length > 0;

  // Street + city + state (2-letter code OR spelled-out state name); the ZIP is
  // a bonus, not a gate. A structured JSON-LD PostalAddress also qualifies.
  const addressPattern = new RegExp(
    `\\d+\\s+[\\w\\s]+(?:st(?:reet)?|ave(?:nue)?|blvd|rd|dr(?:ive)?|ln|lane|way|ct|court|pl(?:ace)?)[,.\\s]+[\\w\\s]+,?\\s*(?:[a-z]{2}|${US_STATE_NAMES})\\b(?:\\s*\\d{5})?`,
    "i"
  );
  const hasPhysicalAddress =
    addressPattern.test(bodyText) || hasStructuredPostalAddress($);

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

  // Any real way to reach the business. An online-only brand that takes email or
  // a contact form is legitimately reachable and shouldn't be scored as if it
  // hides its contact info just because it has no storefront phone/address.
  const hasEmail =
    $('a[href^="mailto:"]').length > 0 ||
    /[\w.+-]+@[\w-]+\.[\w.-]{2,}/.test(bodyText);
  const hasContactForm =
    $("form").length > 0 ||
    $('a[href*="contact"], a:contains("Contact")').length > 0;
  const hasContactMethod =
    hasPhoneNumber || hasClickToCall || hasEmail || hasContactForm;

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
    hasEmail,
    hasContactForm,
    hasContactMethod,
    isHttps,
  };
}

/**
 * Trust score /100, recalibrated for the local-SMB ICP. It still rewards real
 * credibility and dings a bare site, but it no longer assumes a trades/ecom
 * business: longevity, family-ownership and professional certifications count as
 * strong credibility (not just BBB/license/insurance), any real contact method
 * (phone, email, or a contact form) satisfies reachability so an online-only
 * brand isn't tanked, and payment-card logos are a minor bonus rather than a
 * transparency requirement.
 */
function calculateScore(a: TrustAnalysis): number {
  let score = 0;

  // HTTPS (15)
  if (a.isHttps) score += 15;

  // Credibility signals (up to 25). High = longevity, certifications, real
  // reviews, licenses/insurance where they apply; each carries real weight so a
  // couple of genuine signals reads as credible.
  const badges = Object.values(a.trustBadges);
  const high = badges.filter((b) => b.importance === "high").length;
  const medium = badges.filter((b) => b.importance === "medium").length;
  const low = badges.filter((b) => b.importance === "low").length;
  score += Math.min(
    25,
    Math.min(high * 7, 21) + Math.min(medium * 4, 12) + Math.min(low * 2, 6),
  );

  // Contact & reachability (up to 15). Any real contact method is the baseline;
  // a full local contact block (phone + tap-to-call + address + hours) tops it.
  let contact = 0;
  if (a.hasContactMethod) contact += 6;
  if (a.hasPhoneNumber) contact += 3;
  if (a.hasClickToCall) contact += 2;
  if (a.hasPhysicalAddress) contact += 3;
  if (a.hasBusinessHours) contact += 1;
  score += Math.min(15, contact);

  // Legal pages (up to 8)
  if (a.hasPrivacyPolicy) score += 4;
  if (a.hasTerms) score += 4;

  // Social proof (up to 17)
  if (a.hasTestimonials) score += 12;
  if (a.hasAssociations) score += 5;

  // Transparency (up to 10). An about/team page is the real signal; payment-card
  // logos are a minor ecom-only bonus, not a requirement.
  if (a.hasTeamPage) score += 7;
  if (a.hasPaymentIcons) score += 3;

  // Comprehensiveness bonus (up to 10)
  const totalSignals =
    Object.keys(a.trustBadges).length +
    (a.hasTestimonials ? 1 : 0) +
    (a.hasPrivacyPolicy ? 1 : 0) +
    (a.hasContactMethod ? 1 : 0) +
    (a.hasTeamPage ? 1 : 0);
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

  // Contact info visible — any real channel counts (an online-only brand reached
  // by email or a contact form is legitimately contactable).
  {
    const bits: string[] = [];
    let s = 0;
    if (a.hasPhoneNumber) {
      s += 45;
      bits.push("phone number");
    }
    if (a.hasEmail) {
      s += 40;
      bits.push("email");
    }
    if (a.hasPhysicalAddress) {
      s += 25;
      bits.push("physical address");
    }
    if (a.hasBusinessHours) {
      s += 10;
      bits.push("business hours");
    }
    if (a.hasContactForm) {
      s += 15;
      bits.push("contact form");
    }
    s = Math.min(100, s);
    const present = bits.length ? `Shows: ${bits.join(", ")}.` : "No phone, email, address, or contact form was found.";
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

  // Click-to-call — only a real gap when a phone number is shown but isn't
  // tappable. A business that intentionally has no public phone (online-only, or
  // contact-by-email/form) is not penalized for lacking a tap-to-call link.
  checks.push(
    a.hasClickToCall
      ? check("Click-to-call", 100, "Your phone number is a tap-to-call link, which is easy for mobile visitors.")
      : a.hasPhoneNumber
        ? check(
            "Click-to-call",
            35,
            "Your phone number isn't a tap-to-call link, so mobile visitors have to copy it by hand.",
            "Ask Strelva to make the number a tel: link so mobile visitors can call in one tap.",
          )
        : a.hasContactMethod
          ? check(
              "Click-to-call",
              80,
              "No public phone number, which is fine because you take contact by email or a form.",
              "If you want calls, add a phone number as a tap-to-call link.",
            )
          : check(
              "Click-to-call",
              0,
              "There is no phone number or other clear way to reach you on the page.",
              "Add a phone number (as a tap-to-call link), an email, or a contact form so visitors can reach you.",
            ),
  );

  // Trust badges & credentials
  {
    const badgeNames = Object.values(a.trustBadges).map((b) => b.name);
    const high = Object.values(a.trustBadges).filter((b) => b.importance === "high").length;
    const medium = Object.values(a.trustBadges).filter((b) => b.importance === "medium").length;
    const low = Object.values(a.trustBadges).filter((b) => b.importance === "low").length;
    const raw = Math.min(
      25,
      Math.min(high * 7, 21) + Math.min(medium * 4, 12) + Math.min(low * 2, 6),
    ); // out of 25
    const s = Math.round((raw / 25) * 100);
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
