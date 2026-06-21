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
  [/llms\.txt/i, "AI agents increasingly look for an llms.txt to understand a site. Without one you are invisible to that growing channel."],
  [/structured data|business schema|schema/i, "Without structured data, AI assistants and voice search cannot confidently recommend your business."],
  [/ai[- ]?answer|faq|howto|how-to/i, "Answer-format content is what AI tools quote directly. Without it, the AI summarizes a competitor instead of you."],
  [/entity|sameas|authority/i, "Weak entity signals make it hard for AI and search engines to know who you are and trust you."],
  [/plain[- ]?text|readable|render|javascript|js/i, "If your content only appears after JavaScript runs, AI crawlers often cannot read it at all."],
  [/business name|ambiguity|ambiguous/i, "An inconsistent business name across your site confuses both customers and the AI deciding who to recommend."],
  [/ai readiness|ai[- ]?ready|discoverab/i, "AI search is becoming a primary way customers find businesses. Sites that are not AI-ready get left out."],

  // SEO foundations
  [/robots|crawler|blocked|index/i, "If crawlers are blocked, search engines and AI tools cannot list you at all, no matter how good the site is."],
  [/sitemap/i, "Without a sitemap, search engines may never discover some of your pages."],
  [/canonical/i, "Missing canonical tags can split your ranking signals across duplicate URLs."],
  [/title/i, "Your title tag is the headline in search results. A missing or weak one costs clicks."],
  [/meta description/i, "The meta description is your ad copy in search results. Without it, Google writes its own, often poorly."],
  [/h1|heading/i, "Clear headings help search engines and AI understand what your page is about."],

  // Performance / mobile
  [/lcp|contentful paint|performance|load/i, "A slow site loses visitors. Over half of people abandon a page that takes more than three seconds."],
  [/cls|layout shift/i, "Visual instability frustrates users; roughly 40% leave after a jarring experience."],
  [/mobile|viewport|tap target|font size/i, "Most local searches happen on a phone. A site that is hard to use on mobile loses those customers."],

  // Security
  [/https/i, "Browsers flag non-HTTPS sites as Not Secure, and most visitors will not enter their information."],
  [/mixed content/i, "Insecure resources on a secure page trigger browser warnings that scare customers away."],
  [/security header/i, "Missing security headers leave the site open to common attacks and erode trust signals search engines read."],
  [/form/i, "Forms that are not secured put customer data at risk and can fail silently."],
  [/cookie|consent|gdpr/i, "A missing consent notice is a compliance gap that can carry real penalties."],

  // Accessibility
  [/alt/i, "Missing image alt text hurts accessibility, image search, and how AI understands your visuals."],
  [/lang|language/i, "A missing language attribute makes the page harder for screen readers and search engines to interpret."],
  [/label|form field/i, "Unlabeled form fields are unusable for screen readers and frustrate everyone else."],
  [/link text|click here/i, "Vague link text hurts accessibility and tells search engines nothing about where the link goes."],
  [/accessib|wcag|contrast|landmark/i, "Accessibility gaps shrink your audience and increasingly carry legal risk."],

  // Trust / content / conversion
  [/contact|phone|address|click[- ]?to[- ]?call/i, "If customers cannot quickly find how to reach you, they leave and call a competitor."],
  [/testimonial|review|trust|badge|credential/i, "Visible proof (reviews, credentials, guarantees) is what converts a visitor into a customer."],
  [/privacy|terms|legal/i, "Missing privacy and terms pages undercut trust and can block some ad and listing platforms."],
  [/content|word count|thin/i, "Thin pages rarely rank and give AI little to quote. Substance is what gets recommended."],
  [/cta|call to action/i, "Without a clear next step, even interested visitors leave without acting."],
];

// Per-category fallback when no specific check line matches.
const CATEGORY_IMPACT: Record<string, string> = {
  "ai-readability": "AI readiness issues will increasingly decide whether AI tools recommend you or a competitor.",
  seo: "Technical SEO issues stop search engines from properly understanding and ranking your site.",
  "web-vitals": "A slow site drives customers to faster competitors before they ever see your offer.",
  mobile: "Most of your visitors are on phones; a poor mobile experience loses them.",
  security: "Security gaps trigger browser warnings and erode the trust customers need to act.",
  a11y: "Accessibility gaps shrink your audience and carry growing legal risk.",
  trust: "Without visible proof, visitors hesitate and never become customers.",
  content: "Thin content rarely ranks and gives AI nothing to quote about you.",
};

function impactLineFor(categorySlug: string, checkName: string): string | undefined {
  for (const [re, line] of CHECK_IMPACT) {
    if (re.test(checkName)) return line;
  }
  return CATEGORY_IMPACT[categorySlug];
}

/** Fix priority from a check's status + how heavily its category counts. */
function priorityFor(status: CheckResult["status"], categoryWeight: number): CheckResult["priority"] {
  if (status === "pass") return undefined;
  if (status === "fail") return categoryWeight >= 0.12 ? "high" : "medium";
  return categoryWeight >= 0.12 ? "medium" : "low";
}

/**
 * Attach an impact line + priority to every failing/warning check in a category.
 * Passing checks are left untouched. Returns the same category (mutated in place)
 * for convenient chaining in the runner.
 */
export function attachImpact(category: CategoryResult): CategoryResult {
  for (const check of category.checks) {
    if (check.status === "pass") continue;
    // Informational placeholders (e.g. a metric we could not measure) are not
    // real findings, so they get no "what this costs you" line or priority.
    if (/not measured|not configured|coming soon/i.test(check.message)) continue;
    if (!check.impact) check.impact = impactLineFor(category.slug, check.name);
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
): Array<{ category: string; name: string; message: string; impact?: string; priority: CheckResult["priority"]; score: number }> {
  const rank = { high: 0, medium: 1, low: 2, undefined: 3 } as const;
  const fixes = categories.flatMap((cat) =>
    cat.checks
      .filter((c) => c.status !== "pass")
      .map((c) => ({
        category: cat.name,
        name: c.name,
        message: c.message,
        impact: c.impact,
        priority: c.priority,
        score: c.score,
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
