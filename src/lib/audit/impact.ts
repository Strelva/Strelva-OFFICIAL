import type { CategoryResult, CheckResult } from "./types";

/**
 * The "what this costs you" narrative, ported from OWSH Systems'
 * `businessImpact.ts`. Strelva's free audit has no vertical, so we use the
 * generic (business-type-agnostic) lines. Each failing/warning check gets a
 * plain-English, stat-backed impact sentence so the scorecard reads like a
 * verdict, not a checklist. Lines are factual and conservative on purpose.
 */

// Keyword (lowercased, matched against the check name) -> impact line.
// First match wins, so order most-specific first.
const CHECK_IMPACT: Array<[RegExp, string]> = [
  // AI readability / schema
  [/llms\.txt/i, "More people now ask ChatGPT and Perplexity for recommendations. An llms.txt points those assistants at your best pages, opening a channel most of your competitors have not touched yet."],
  [/structured data|business schema|schema/i, "Structured data is the label that tells AI assistants and voice search what you do and where you are. Add it and you become the answer they hand a searcher."],
  [/ai[- ]?answer|faq|howto|how-to/i, "When someone asks AI a question in your field, it quotes whoever wrote the clearest answer. Publish that answer and the quote points to you instead of a competitor."],
  [/entity|sameas|authority/i, "Links to your Google, social, and listing profiles let AI confirm you are real. The more it can cross-check, the more confidently it recommends you."],
  [/plain[- ]?text|readable|render|javascript|js/i, "AI crawlers do not run your site's scripts. If your words only appear after JavaScript loads, they read a blank page. Getting the text into the page puts you back in the conversation."],
  [/business name|ambiguity|ambiguous/i, "When your name shows up a few different ways across the site, AI can't tell which business is you. One consistent name makes you easy to pick out and recommend."],
  [/ai readiness|ai[- ]?ready|discoverab/i, "More customers start their search by asking an AI. Getting AI-ready is how you show up in that answer instead of being left out of it."],

  // SEO foundations
  [/robots|crawler|blocked|index/i, "Search engines can only show pages they are allowed to read. Opening that gate makes everything you have already built findable."],
  [/sitemap/i, "A sitemap is the index you hand Google so it finds every page. Add one and pages that were being missed start getting listed."],
  [/canonical/i, "A canonical tag tells Google which page is the real one, so your ranking strength lands on a single URL instead of being split across duplicates."],
  [/title/i, "Your title is the headline people see in Google. A clear one is the difference between a click and a scroll-past."],
  [/meta description/i, "The line under your title in Google is free ad space. Write it yourself and you control the first impression; leave it blank and Google guesses for you."],
  [/h1|heading/i, "A clear main heading tells Google and AI what the page is about in one line, so it shows your page for the right searches."],

  // Performance / mobile
  [/lcp|contentful paint|performance|load/i, "People leave a page that makes them wait; over half abandon after about three seconds. A faster site simply keeps more of the visitors you already earn."],
  [/cls|layout shift/i, "When the page jumps around as it loads, visitors mis-tap and give up. Steadying it keeps people moving toward booking or buying."],
  [/mobile|viewport|tap target|font size/i, "Most local searches happen on a phone. A site that is easy to use on mobile keeps the customers who find you there."],

  // Security
  [/https/i, "Without the padlock, browsers stamp your site 'Not Secure' and almost no one types their name or number into a page that looks unsafe. Adding it removes that hesitation."],
  [/mixed content/i, "A single insecure file on a secure page trips a browser warning that undoes the padlock's reassurance. Clearing it keeps the page looking trustworthy."],
  [/security header/i, "Security headers are the quiet signals that tell browsers and search engines your site is well-run. Adding them hardens the site and strengthens trust."],
  [/form/i, "A form that isn't secured can leak what customers type or fail without telling them. Securing it protects their details and your reputation."],
  [/cookie|consent|gdpr/i, "A consent notice keeps you on the right side of privacy rules and shows visitors you handle their data carefully."],

  // Accessibility
  [/alt/i, "Alt text describes your images to screen readers, image search, and AI. Adding it widens your audience and helps your photos get found."],
  [/lang|language/i, "Declaring the page language helps screen readers and search engines read it correctly, so more people can use the site as intended."],
  [/label|form field/i, "Labeled fields let everyone fill out your form, including customers using a screen reader. It's a small fix that removes a real barrier to reaching you."],
  [/link text|click here/i, "Links that describe where they go help both screen-reader users and Google understand your site, so more people follow them to the right place."],
  [/accessib|wcag|contrast|landmark/i, "An accessible site works for more people and lowers legal risk. Every fix here widens the audience that can actually use you."],

  // Trust / content / conversion
  [/contact|phone|address|click[- ]?to[- ]?call/i, "If customers can't find how to reach you in a second, they leave and call the next business. Making contact obvious captures people already ready to act."],
  [/testimonial|review|trust|badge|credential/i, "Reviews, credentials, and guarantees are what tip a hesitant visitor into a customer. Showing your proof does the convincing for you."],
  [/privacy|terms|legal/i, "Privacy and terms pages signal a real, legitimate business, and some ad and listing platforms require them before they'll feature you."],
  [/content|word count|thin/i, "Pages with real substance are what rank and what AI quotes. Filling out your content gives search and AI a reason to recommend you."],
  [/cta|call to action/i, "A clear next step turns interest into action. Telling visitors exactly what to do next is often the simplest way to win more customers."],
];

// Per-category fallback when no specific check line matches.
const CATEGORY_IMPACT: Record<string, string> = {
  "ai-readability": "As more customers search by asking an AI, being AI-ready is what decides whether it recommends you or a competitor.",
  seo: "These SEO foundations are how search engines understand and rank your site, so the pages you've built actually get found.",
  "web-vitals": "A faster site keeps the visitors you already earn instead of losing them to a competitor's quicker page.",
  mobile: "Most of your visitors are on phones, so a smooth mobile experience is what keeps them from bouncing.",
  security: "A secure site removes the browser warnings and hesitation that stop customers from acting.",
  a11y: "An accessible site works for more people and lowers legal risk; every fix widens who can use you.",
  trust: "Visible proof is what turns a hesitant visitor into a customer, so these signals directly affect conversions.",
  content: "Substantial content is what ranks and what AI quotes, giving both a reason to point people to you.",
};

function impactLineFor(categorySlug: string, checkName: string): string | undefined {
  for (const [re, line] of CHECK_IMPACT) {
    if (re.test(checkName)) return line;
  }
  return CATEGORY_IMPACT[categorySlug];
}

// ---------------------------------------------------------------------------
// Quantified loss estimate ("~$Y/mo" / "~X customers/mo")
//
// Ported from OWSH Systems' `getQuantifiedImpact` + `DEFAULT_METRICS`.
// OWSH had four per-business-type metric sets (physical/digital/sab/hybrid).
// Strelva's free audit has NO vertical and NO client analytics, so we collapse
// those into ONE generic, deliberately conservative local-business profile:
//
//   GENERIC_METRICS = {
//     monthlyVisitors: 500   // small-local-site baseline (OWSH physical=500,
//                            //   sab=300, hybrid=1000; 500 is the mid-low pick,
//                            //   chosen low so we never overstate)
//     conversionRate:  0.03  // 3% visitor->customer (OWSH physical default)
//     orderValue:      75    // avg order/job value in USD (between OWSH
//                            //   physical $50 and sab $200; a safe mid-low)
//   }
//
// Baseline monthly value at stake = 500 * 0.03 * $75 = ~$1,125/mo of revenue
// that the site is responsible for. Each estimate below takes a research-backed
// fraction of that (or of raw traffic) as the loss a specific issue causes.
//
// These numbers are SHOWN TO BUSINESS OWNERS. Every line is prefixed "~",
// every multiplier is conservative, and we only emit a figure where a dollar/
// customer estimate is genuinely credible. Anything speculative returns
// undefined (no quantified line) so we never invent precision we don't have.
// ---------------------------------------------------------------------------
/**
 * The traffic profile the quantified estimates multiply against.
 *  - `generic`  → the business-type-agnostic prior below. Used by the anonymous
 *    `/audit` tool, which has no client analytics.
 *  - `measured` → a paying client's REAL numbers (GA4 visitors, leads-based
 *    conversion). Threaded in by `scanTenant`; the qualifier flips from
 *    "estimated" to "based on your traffic" so we never claim precision we lack.
 */
export interface TrafficProfile {
  monthlyVisitors: number;
  conversionRate: number;
  orderValue: number;
  source: "generic" | "measured";
}

/** The generic prior for the anonymous audit. Exported so the single source of
 *  truth for the conversion/order-value priors is here (scanTenant reuses them
 *  for a paying client's real-traffic profile rather than re-hardcoding them). */
export const GENERIC_METRICS: TrafficProfile = {
  monthlyVisitors: 500,
  conversionRate: 0.03,
  orderValue: 75,
  source: "generic",
};

/** Honest qualifier: real traffic base vs a generic prior. */
const qualifier = (m: TrafficProfile) =>
  m.source === "measured" ? "based on your traffic" : "estimated";

const usd = (n: number) => `~$${Math.round(n).toLocaleString()}/mo`;
const customers = (n: number) =>
  `~${Math.max(1, Math.round(n))} ${Math.round(n) === 1 ? "customer" : "customers"}/mo`;

// Keyword (matched against the check name) -> a function producing the
// quantified string. First match wins, so order most-specific first. Only
// issue types where a dollar/customer figure is credible appear here.
const CHECK_QUANTIFIED: Array<[RegExp, (m: TrafficProfile) => string]> = [
  // Performance / load: ~35% of visitors abandon a slow page (conservative,
  // vs the often-cited 53% at 3s+). Lost = visitors * 0.35 * conversion.
  [
    /lcp|contentful paint|performance|load|speed|slow/i,
    (m) => {
      const lost = m.monthlyVisitors * 0.35 * m.conversionRate;
      return `${customers(lost)} lost to slow load (${qualifier(m)})`;
    },
  ],
  // Layout instability: ~40% leave after a jarring experience; only a slice of
  // those would have converted, so apply at half the abandonment weight.
  [
    /cls|layout shift/i,
    (m) => {
      const lost = m.monthlyVisitors * 0.4 * 0.5 * m.conversionRate;
      return `${usd(lost * m.orderValue)} (${qualifier(m)})`;
    },
  ],
  // Mobile: ~60% of local searches are mobile; a poor mobile UX loses a
  // fraction (0.3) of those would-be customers.
  [
    /mobile|viewport|tap target|font size/i,
    (m) => {
      const lost = m.monthlyVisitors * 0.6 * 0.3 * m.conversionRate;
      return `${customers(lost)} on mobile (${qualifier(m)})`;
    },
  ],
  // HTTPS / Not Secure: 85% won't submit info on a flagged page; apply to the
  // ~20% of visitors who would have taken a form/contact action.
  [
    /https|ssl|not secure|mixed content/i,
    (m) => {
      const lost = m.monthlyVisitors * 0.85 * 0.2 * m.conversionRate;
      return `${customers(lost)} who won't submit info (${qualifier(m)})`;
    },
  ],
  // Schema / AI-readiness / structured data: ~30% of searches now involve AI
  // assistants; without machine-readable signals AI can't recommend you. Apply
  // at half weight (this is the emerging, not yet dominant, channel).
  [
    /structured data|business schema|schema|llms\.txt|ai readiness|ai[- ]?ready|ai[- ]?answer|discoverab/i,
    (m) => {
      const lost = m.monthlyVisitors * 0.3 * 0.5 * m.conversionRate;
      return `${customers(lost)} via AI search (${qualifier(m)})`;
    },
  ],
  // Crawl-blocked / not indexed: 92% of search traffic goes to page 1. If
  // crawlers are blocked you forfeit organic discovery; apply at half weight.
  // Rendered as customers (not dollars) — the OWSH source deliberately avoided
  // quoting a dollar figure for ranking loss, so we keep that restraint.
  [
    /robots|crawler|blocked|index/i,
    (m) => {
      const lost = m.monthlyVisitors * 0.92 * 0.5 * m.conversionRate;
      return `${customers(lost)} from organic search (${qualifier(m)})`;
    },
  ],
  // Trust / reviews / testimonials / conversion CTA: visible proof and a clear
  // next step are what convert. Missing them costs a conservative ~20% of the
  // converting visitors.
  [
    /testimonial|review|trust|badge|credential|cta|call to action|contact|phone|click[- ]?to[- ]?call/i,
    (m) => {
      const lost = m.monthlyVisitors * 0.2 * m.conversionRate;
      return `${usd(lost * m.orderValue)} in conversions (${qualifier(m)})`;
    },
  ],
];

/**
 * A conservative dollar/customer loss estimate for a check, or undefined when
 * no credible figure exists. Multiplies against `metrics` — the generic prior
 * for the anonymous audit, or a paying client's real GA4/leads numbers.
 * Only failing/warning checks should be passed in; the caller guards status.
 */
function quantifiedFor(checkName: string, metrics: TrafficProfile = GENERIC_METRICS): string | undefined {
  for (const [re, fn] of CHECK_QUANTIFIED) {
    if (re.test(checkName)) return fn(metrics);
  }
  return undefined;
}

/** Fix priority from a check's status + how heavily its category counts.
 *  Threshold is 0.10: the 42cfb42 weight rebalance flattened all non-seo/ai
 *  categories to 0.10, and a 0.12 gate made "high" unreachable for security,
 *  web-vitals, mobile, a11y, trust, and content — so an HTTPS/mixed-content fail
 *  ranked below a missing-meta warning. 0.10 restores reachable "high" for them. */
function priorityFor(status: CheckResult["status"], categoryWeight: number): CheckResult["priority"] {
  if (status === "pass") return undefined;
  if (status === "fail") return categoryWeight >= 0.1 ? "high" : "medium";
  return categoryWeight >= 0.1 ? "medium" : "low";
}

/**
 * Attach an impact line + priority to every failing/warning check in a category.
 * Passing checks are left untouched. Returns the same category (mutated in place)
 * for convenient chaining in the runner.
 */
export function attachImpact(category: CategoryResult, metrics?: TrafficProfile): CategoryResult {
  for (const check of category.checks) {
    if (check.status === "pass") continue;
    // Informational placeholders (e.g. a metric we could not measure) are not
    // real findings, so they get no "what this costs you" line or priority.
    if (/not measured|not configured|coming soon/i.test(check.message)) continue;
    if (!check.impact) check.impact = impactLineFor(category.slug, check.name);
    if (!check.quantified) check.quantified = quantifiedFor(check.name, metrics);
    check.priority = priorityFor(check.status, category.weight);
  }
  return category;
}

/**
 * Flatten an audit's failing/warning checks into a prioritized fix list
 * (high -> medium -> low, worst score first). Powers the "what to fix" section
 * of the scorecard and the client health panel.
 */
export function topFixes(
  categories: CategoryResult[],
  limit = 5
): Array<{ category: string; name: string; message: string; impact?: string; quantified?: string; priority: CheckResult["priority"]; score: number; guides?: { slug: string; title: string }[] }> {
  const rank = { high: 0, medium: 1, low: 2, undefined: 3 } as const;
  const fixes = categories.flatMap((cat) =>
    cat.checks
      .filter((c) => c.status !== "pass")
      .map((c) => ({
        category: cat.name,
        name: c.name,
        message: c.message,
        impact: c.impact,
        quantified: c.quantified,
        priority: c.priority,
        score: c.score,
        // Guide cross-links live on the category (set by the server-only
        // runner); read the field here, never import guides.ts.
        guides: cat.guides,
      }))
  );
  fixes.sort((a, b) => {
    const pa = rank[(a.priority ?? "undefined") as keyof typeof rank];
    const pb = rank[(b.priority ?? "undefined") as keyof typeof rank];
    if (pa !== pb) return pa - pb;
    return a.score - b.score;
  });
  return fixes.slice(0, limit);
}
