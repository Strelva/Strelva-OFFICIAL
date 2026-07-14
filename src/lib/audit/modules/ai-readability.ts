import type { AuditContext } from "../context";
import type { CategoryResult, CheckResult } from "../types";
import { averageCheckScores } from "../scoring";

/**
 * AI Readability — the marquee audit module: "are you visible to AI search?"
 *
 * Ported from OWSH Systems:
 *  - src/services/ai-readiness.js       (schema parse, analyzeSameAs,
 *                                        calculateAIDiscoveryScore, checkEntityClarity)
 *  - src/services/ai-discoverability.js (content accessibility / JS-render risk, ambiguity)
 *  - audit-app/src/lib/schema-validator.ts (per-type required/recommended field validation)
 *
 * Plus one signal that does not exist in OWSH: an llms.txt check (a site that
 * publishes an llms.txt for AI agents is the 2026 AI-visibility tell).
 *
 * Reads ONLY from ctx (the runner already fetched everything). The rich scoring
 * is kept; the OUTPUT is flattened into clear, business-owner CheckResults.
 */

// ---------------------------------------------------------------------------
// Constants ported from OWSH
// ---------------------------------------------------------------------------

// Authority platforms — presence in these helps AI trust/cite a business.
const AUTHORITY_PLATFORMS: Record<string, RegExp> = {
  wikipedia: /wikipedia\.org/i,
  wikidata: /wikidata\.org/i,
  linkedin: /linkedin\.com/i,
  crunchbase: /crunchbase\.com/i,
  bbb: /bbb\.org/i,
  yelp: /yelp\.com/i,
  facebook: /facebook\.com/i,
  twitter: /twitter\.com|x\.com/i,
  instagram: /instagram\.com/i,
  youtube: /youtube\.com/i,
  // Google Business Profile / Maps — the #1 authority profile for a local
  // business, and the one AI assistants lean on most. Matched narrowly so it
  // doesn't fire on a generic google.com link.
  google: /maps\.app\.goo\.gl|maps\.google\.|g\.page|business\.google\.com/i,
};

// Business schema types that signal "this is a real business" to AI.
const VALID_BUSINESS_TYPES = [
  "LocalBusiness",
  "Restaurant",
  "Store",
  "ProfessionalService",
  "FinancialService",
  "FoodEstablishment",
  "HealthAndBeautyBusiness",
  "HomeAndConstructionBusiness",
  "LegalService",
  "RealEstateAgent",
  "MedicalBusiness",
  "AutomotiveBusiness",
  "EntertainmentBusiness",
  "SportsActivityLocation",
  "LodgingBusiness",
  "EmergencyService",
  "Organization",
  "Corporation",
  "NGO",
  "EducationalOrganization",
  "Service",
  "FinancialProduct",
  // Common schema.org LocalBusiness subtypes real clients emit as their exact
  // @type. Without these the audit reads "structured data but nothing identifies
  // a business" and caps the schema score (e.g. a brewery's BarOrPub).
  "BarOrPub",
  "Brewery",
  "Winery",
  "Distillery",
  "Bakery",
  "CafeOrCoffeeShop",
  "IceCreamShop",
  "BeautySalon",
  "HairSalon",
  "NailSalon",
  "DaySpa",
  "Dentist",
  "Physician",
  "VeterinaryCare",
  "Plumber",
  "Electrician",
  "HVACBusiness",
  "RoofingContractor",
  "GeneralContractor",
  "HousePainter",
  "Locksmith",
  "MovingCompany",
  "Attorney",
  "AccountingService",
  "InsuranceAgency",
  "Florist",
  "PetStore",
  "TravelAgency",
  "ChildCare",
];

// Google rich-result requirements per type (from schema-validator.ts).
const SCHEMA_REQUIREMENTS: Record<
  string,
  { richResultType: string; required: string[]; recommended: string[] }
> = {
  LocalBusiness: {
    richResultType: "Local Business",
    required: ["name", "address"],
    recommended: [
      "telephone",
      "openingHours",
      "image",
      "priceRange",
      "geo",
      "url",
      "aggregateRating",
    ],
  },
  Organization: {
    richResultType: "Organization",
    required: ["name", "url"],
    recommended: ["logo", "sameAs", "contactPoint", "description"],
  },
  Product: {
    richResultType: "Product Snippets",
    required: ["name"],
    recommended: [
      "image",
      "description",
      "offers",
      "aggregateRating",
      "review",
      "brand",
      "sku",
    ],
  },
  Article: {
    richResultType: "Article",
    required: ["headline", "image", "datePublished", "author"],
    recommended: ["dateModified", "publisher", "description", "mainEntityOfPage"],
  },
  BlogPosting: {
    richResultType: "Article",
    required: ["headline", "image", "datePublished", "author"],
    recommended: ["dateModified", "publisher", "description", "mainEntityOfPage"],
  },
  NewsArticle: {
    richResultType: "Article",
    required: ["headline", "image", "datePublished", "author"],
    recommended: ["dateModified", "publisher", "description"],
  },
  FAQPage: {
    richResultType: "FAQ",
    required: ["mainEntity"],
    recommended: [],
  },
  HowTo: {
    richResultType: "How-to",
    required: ["name", "step"],
    recommended: ["image", "totalTime", "estimatedCost", "supply", "tool"],
  },
  Event: {
    richResultType: "Event",
    required: ["name", "startDate", "location"],
    recommended: ["endDate", "description", "image", "offers", "performer", "organizer"],
  },
  Service: {
    richResultType: "Service",
    required: ["name"],
    recommended: ["description", "provider", "areaServed", "offers", "aggregateRating"],
  },
  BreadcrumbList: {
    richResultType: "Breadcrumb",
    required: ["itemListElement"],
    recommended: [],
  },
  WebSite: {
    richResultType: "Sitelinks Search Box",
    required: ["name", "url"],
    recommended: ["potentialAction"],
  },
};

// Nested objects whose own sub-fields matter for rich-result eligibility.
const NESTED_FIELD_REQUIREMENTS: Record<string, string[]> = {
  address: ["streetAddress", "addressLocality", "addressRegion", "postalCode", "addressCountry"],
  geo: ["latitude", "longitude"],
  offers: ["price", "priceCurrency", "availability"],
  author: ["name"],
  publisher: ["name", "logo"],
  contactPoint: ["telephone", "contactType"],
  aggregateRating: ["ratingValue", "ratingCount"],
};

type JsonObject = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Schema collection
// ---------------------------------------------------------------------------

interface CollectedSchemas {
  /** Every typed schema object found, flattened (including @graph members). */
  all: { type: string; raw: JsonObject }[];
  /** Distinct @type strings seen. */
  types: string[];
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function collectSchemas($: AuditContext["$"]): CollectedSchemas {
  const all: { type: string; raw: JsonObject }[] = [];

  $('script[type="application/ld+json"]').each((_i, el) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse($(el).text() || "{}");
    } catch {
      return; // ignore invalid JSON blocks
    }
    const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      const obj = node as JsonObject;
      // Flatten @graph so nested entities are validated like top-level ones.
      const graph = obj["@graph"];
      if (Array.isArray(graph)) queue.push(...graph);
      const rawType = obj["@type"];
      const typeList = Array.isArray(rawType) ? rawType : [rawType];
      for (const t of typeList) {
        const type = asString(t);
        if (type) all.push({ type, raw: obj });
      }
    }
  });

  const types = [...new Set(all.map((s) => s.type))];
  return { all, types };
}

// ---------------------------------------------------------------------------
// sameAs authority analysis (ai-readiness.js: analyzeSameAs)
// ---------------------------------------------------------------------------

interface SameAsAnalysis {
  platforms: string[];
  authorityScore: number;
  hasKnowledgeGraphLinks: boolean;
}

function analyzeSameAs(sameAs: unknown): SameAsAnalysis {
  if (!sameAs) {
    return { platforms: [], authorityScore: 0, hasKnowledgeGraphLinks: false };
  }
  const links = Array.isArray(sameAs) ? sameAs : [sameAs];
  const foundPlatforms: string[] = [];
  let hasKnowledgeGraphLinks = false;

  for (const link of links) {
    if (typeof link !== "string") continue;
    for (const [platform, regex] of Object.entries(AUTHORITY_PLATFORMS)) {
      if (regex.test(link)) {
        foundPlatforms.push(platform);
        if (platform === "wikipedia" || platform === "wikidata") {
          hasKnowledgeGraphLinks = true;
        }
      }
    }
  }

  let authorityScore = foundPlatforms.length * 10;
  if (hasKnowledgeGraphLinks) authorityScore += 20;
  authorityScore = Math.min(100, authorityScore);

  return {
    platforms: [...new Set(foundPlatforms)],
    authorityScore,
    hasKnowledgeGraphLinks,
  };
}

// Visible authority/social links present as <a href> in the page — a real (if
// weaker) AI-trust signal even when the site declares no schema `sameAs`.
function visibleAuthorityPlatforms($: AuditContext["$"]): string[] {
  const found = new Set<string>();
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href") || "";
    for (const [platform, regex] of Object.entries(AUTHORITY_PLATFORMS)) {
      if (regex.test(href)) found.add(platform);
    }
  });
  return [...found];
}

// ---------------------------------------------------------------------------
// Entity clarity (ai-readiness.js: checkEntityClarity)
// ---------------------------------------------------------------------------

interface EntityClarity {
  clarityScore: number;
  presentCount: number;
}

function checkEntityClarity(schema: JsonObject | null): EntityClarity {
  if (!schema) return { clarityScore: 0, presentCount: 0 };
  const signals = {
    hasFoundingDate: !!(schema.foundingDate || schema.foundingLocation),
    hasFounder: !!schema.founder,
    hasNumberOfEmployees: !!schema.numberOfEmployees,
    hasAwards: !!(schema.award || schema.awards),
    hasKnowsAbout: !!schema.knowsAbout,
    hasAreaServed: !!schema.areaServed,
    hasPriceRange: !!schema.priceRange,
    hasPaymentAccepted: !!schema.paymentAccepted,
    hasCurrenciesAccepted: !!schema.currenciesAccepted,
  };
  const presentCount = Object.values(signals).filter(Boolean).length;
  const clarityScore = Math.round((presentCount / Object.keys(signals).length) * 100);
  return { clarityScore, presentCount };
}

// ---------------------------------------------------------------------------
// AI-answer content tracking (FAQPage / HowTo / Article / Breadcrumb / WebSite)
// ---------------------------------------------------------------------------

interface AiContent {
  hasFAQPage: boolean;
  hasHowTo: boolean;
  hasArticle: boolean;
  hasBreadcrumb: boolean;
  hasWebSite: boolean;
  faqCount: number;
  howToSteps: number;
}

function readAiContent(schemas: CollectedSchemas): AiContent {
  const c: AiContent = {
    hasFAQPage: false,
    hasHowTo: false,
    hasArticle: false,
    hasBreadcrumb: false,
    hasWebSite: false,
    faqCount: 0,
    howToSteps: 0,
  };
  for (const { type, raw } of schemas.all) {
    if (type === "FAQPage") {
      c.hasFAQPage = true;
      if (Array.isArray(raw.mainEntity)) c.faqCount = Math.max(c.faqCount, raw.mainEntity.length);
    }
    if (type === "HowTo") {
      c.hasHowTo = true;
      if (Array.isArray(raw.step)) c.howToSteps = Math.max(c.howToSteps, raw.step.length);
    }
    if (type === "Article" || type === "BlogPosting" || type === "NewsArticle") c.hasArticle = true;
    if (type === "BreadcrumbList") c.hasBreadcrumb = true;
    if (type === "WebSite") c.hasWebSite = true;
  }
  return c;
}

// ai-readiness.js: calculateAIDiscoveryScore
function calculateAIDiscoveryScore(
  aiContent: AiContent,
  sameAs: SameAsAnalysis,
  entity: EntityClarity
): number {
  let score = 0;
  // AI-answer content (40 max): FAQPage +15, HowTo +10, Article/Breadcrumb/WebSite +5 each
  if (aiContent.hasFAQPage) score += 15;
  if (aiContent.hasHowTo) score += 10;
  if (aiContent.hasArticle) score += 5;
  if (aiContent.hasBreadcrumb) score += 5;
  if (aiContent.hasWebSite) score += 5;
  // Authority signals (35 max)
  score += Math.min(25, sameAs.authorityScore / 4);
  if (sameAs.hasKnowledgeGraphLinks) score += 10;
  // Entity clarity (25 max)
  score += Math.min(25, entity.clarityScore / 4);
  return Math.min(100, Math.round(score));
}

// ---------------------------------------------------------------------------
// Per-type schema field validation (schema-validator.ts: validateSchema)
// ---------------------------------------------------------------------------

interface SchemaTypeValidation {
  type: string;
  richResultType: string;
  score: number; // 0-100
  missingRequired: string[];
}

function validateField(data: JsonObject, field: string): boolean {
  const value = data[field];
  if (value === undefined || value === null) return false;
  if (value === "" || (Array.isArray(value) && value.length === 0)) return false;
  if (typeof value === "object" && !Array.isArray(value) && NESTED_FIELD_REQUIREMENTS[field]) {
    const nested = value as JsonObject;
    const missing = NESTED_FIELD_REQUIREMENTS[field].filter((f) => !nested[f]);
    // Present, but flagged in OWSH as partial when sub-fields missing; still counts as present.
    return missing.length < NESTED_FIELD_REQUIREMENTS[field].length;
  }
  return true;
}

function validateSchemaType(schema: JsonObject, type: string): SchemaTypeValidation | null {
  const req = SCHEMA_REQUIREMENTS[type];
  if (!req) return null;
  const requiredPresent = req.required.filter((f) => validateField(schema, f));
  const recommendedPresent = req.recommended.filter((f) => validateField(schema, f));
  // Required = 70% of score, recommended = 30% (schema-validator weighting).
  const requiredScore = req.required.length
    ? (requiredPresent.length / req.required.length) * 70
    : 70;
  const recommendedScore = req.recommended.length
    ? (recommendedPresent.length / req.recommended.length) * 30
    : 30;
  return {
    type,
    richResultType: req.richResultType,
    score: Math.round(requiredScore + recommendedScore),
    missingRequired: req.required.filter((f) => !validateField(schema, f)),
  };
}

// ---------------------------------------------------------------------------
// Content accessibility (ai-discoverability.js: checkContentAccessibility)
// ---------------------------------------------------------------------------

interface Accessibility {
  wordCount: number;
  jsRenderingRisk: boolean;
}

function checkContentAccessibility($: AuditContext["$"]): Accessibility {
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(" ").length : 0;
  const spaRoot = $("#root, #app, #__next, [data-reactroot]").length > 0;
  const lowContent = wordCount < 100;
  return { wordCount, jsRenderingRisk: spaRoot && lowContent };
}

// ---------------------------------------------------------------------------
// Ambiguity (ai-discoverability.js: checkAmbiguity)
// ---------------------------------------------------------------------------

interface Ambiguity {
  distinctNames: string[];
  placeholder: boolean;
}

function checkAmbiguity($: AuditContext["$"], schemas: CollectedSchemas): Ambiguity {
  const ogName = $('meta[property="og:site_name"]').attr("content")?.trim();
  const titleName = $("title").text().split(/[|\-–—]/)[0].trim();
  const footerName = $('footer .logo, footer [class*="brand"]').first().text().trim();
  const schemaName = asString(schemas.all.find((s) => asString(s.raw.name))?.raw.name);

  const names = [ogName, titleName, footerName, schemaName].filter(
    (n): n is string => !!n && n.length > 0
  );
  const distinctNames = [...new Set(names.map((n) => n.toLowerCase()))];

  const bodyText = $("body").text().toLowerCase();
  const placeholder =
    bodyText.includes("coming soon") || bodyText.includes("under construction");

  return { distinctNames, placeholder };
}

// ---------------------------------------------------------------------------
// CheckResult helper
// ---------------------------------------------------------------------------

function statusFor(score: number): CheckResult["status"] {
  return score >= 80 ? "pass" : score >= 50 ? "warn" : "fail";
}

// ---------------------------------------------------------------------------
// Module entry
// ---------------------------------------------------------------------------

export function checkAiReadability(ctx: AuditContext): CategoryResult {
  const { $ } = ctx;
  const checks: CheckResult[] = [];

  const schemas = collectSchemas($);
  const businessSchema =
    schemas.all.find((s) => VALID_BUSINESS_TYPES.includes(s.type))?.raw ?? null;
  const aiContent = readAiContent(schemas);
  const sameAs = analyzeSameAs(businessSchema?.sameAs);
  const entity = checkEntityClarity(businessSchema);
  const aiDiscoveryScore = calculateAIDiscoveryScore(aiContent, sameAs, entity);

  // --- 1. Structured data present ----------------------------------------
  if (schemas.all.length === 0) {
    checks.push({
      name: "Structured data present",
      status: "fail",
      score: 0,
      message:
        "No structured data found. AI tools like ChatGPT and Google AI Overview cannot reliably understand or cite your business.",
      details: "Ask Strelva to add structured data (a hidden description of your business) so AI and Google know what you do and where you are.",
    });
  } else {
    checks.push({
      name: "Structured data present",
      status: "pass",
      score: 100,
      message: `Found ${schemas.types.length} schema type(s) AI tools can read.`,
      details: schemas.types.join(", "),
    });
  }

  // --- 2. Business schema valid ------------------------------------------
  if (!businessSchema) {
    checks.push({
      name: "Business schema valid",
      status: schemas.all.length === 0 ? "fail" : "warn",
      score: schemas.all.length === 0 ? 0 : 40,
      message:
        schemas.all.length === 0
          ? "No business schema. AI tools cannot tell what your business is, what it offers, or where it is."
          : "You have some structured data, but nothing that identifies you as a business.",
      details: "Ask Strelva to add business details (name, address, and phone) in a form AI and Google can read.",
    });
  } else {
    const primaryType = schemas.all.find((s) => VALID_BUSINESS_TYPES.includes(s.type))!.type;
    const validation = validateSchemaType(businessSchema, primaryType);
    if (validation) {
      const missing = validation.missingRequired;
      checks.push({
        name: "Business schema valid",
        status: statusFor(validation.score),
        score: validation.score,
        message:
          missing.length === 0
            ? `Your ${primaryType} schema has the fields AI tools and Google need.`
            : `Your ${primaryType} schema is missing required field(s): ${missing.join(", ")}.`,
        details:
          missing.length === 0
            ? `Eligible for ${validation.richResultType} rich results.`
            : `Add ${missing.join(", ")} so AI tools can describe your business accurately.`,
      });
    } else {
      // Business type present but no rich-result spec — partial credit (matches OWSH).
      checks.push({
        name: "Business schema valid",
        status: "warn",
        score: 50,
        message: `Found ${primaryType} schema, but it has no specific rich-result requirements to check.`,
      });
    }
  }

  // --- 3. AI-answer content (FAQ / HowTo) --------------------------------
  {
    let score = 0;
    if (aiContent.hasFAQPage) score += 60;
    if (aiContent.hasHowTo) score += 30;
    if (aiContent.hasArticle) score += 10;
    score = Math.min(100, score);
    const parts: string[] = [];
    if (aiContent.hasFAQPage) parts.push(`FAQ (${aiContent.faqCount || "some"} Q&As)`);
    if (aiContent.hasHowTo) parts.push(`how-to (${aiContent.howToSteps || "some"} steps)`);
    if (aiContent.hasArticle) parts.push("articles");
    checks.push({
      name: "AI-answer content (FAQ/HowTo)",
      status: statusFor(score),
      score,
      message:
        score >= 80
          ? `You publish content AI assistants quote directly: ${parts.join(", ")}.`
          : aiContent.hasFAQPage || aiContent.hasHowTo
            ? `Some answer-ready content found (${parts.join(", ")}). Add FAQ and how-to content for more AI visibility.`
            : "No FAQ or how-to content. AI assistants answer common questions about your business with competitor info instead of yours.",
      details:
        score >= 80
          ? undefined
          : "Add an FAQ section answering the questions customers actually ask (hours, pricing, services, location) so AI can quote it.",
    });
  }

  // --- 4. Entity authority (sameAs) --------------------------------------
  {
    // Schema-declared `sameAs` is the strongest AI cross-check signal; visible
    // social/authority links in the page are a weaker but real signal, so credit
    // them at a lower rate (was: schema-only, which falsely reported "nothing
    // linked" on sites that plainly link their socials, e.g. RHM's 7 links).
    const schemaPlatforms = sameAs.platforms;
    const visible = visibleAuthorityPlatforms($);
    const visibleOnly = visible.filter((p) => !schemaPlatforms.includes(p));
    const allPlatforms = [...new Set([...schemaPlatforms, ...visible])];
    let score = Math.min(100, sameAs.authorityScore + visibleOnly.length * 12);
    // A local business that links its official profiles (Google + a couple
    // socials) shouldn't read as a deep fail just because they aren't declared
    // in structured data — floor it at warn. Full pass still requires schema sameAs.
    if (allPlatforms.length >= 3) score = Math.max(score, 55);

    let message: string;
    if (sameAs.hasKnowledgeGraphLinks) {
      message = `Linked to ${schemaPlatforms.length} authority profile(s) including Wikipedia/Wikidata: a strong AI trust signal.`;
    } else if (schemaPlatforms.length >= 3) {
      message = `Linked to ${schemaPlatforms.length} authority profiles (${schemaPlatforms.join(", ")}), which helps AI tools trust and cite you.`;
    } else if (schemaPlatforms.length > 0) {
      message = `Only ${schemaPlatforms.length} authority profile(s) declared in your structured data (${schemaPlatforms.join(", ")}). Link more so AI tools trust your business.`;
    } else if (allPlatforms.length > 0) {
      message = `You link ${allPlatforms.length} social profile(s) (${allPlatforms.join(", ")}), but they aren't declared in your structured data, so AI tools can't reliably cross-check them.`;
    } else {
      message =
        "No verified social or authority profiles linked. AI tools have nothing to cross-check, so they trust you less.";
    }
    checks.push({
      name: "Entity authority (sameAs)",
      status: statusFor(score),
      score,
      message,
      details:
        score >= 80
          ? undefined
          : allPlatforms.length > 0
            ? "Ask Strelva to declare your social profiles as structured data (sameAs) so AI tools can confirm you're a real business, not just link them in the page."
            : "Link your official profiles (Google, LinkedIn, Facebook, and ideally Wikipedia) from the site so AI can confirm you are a real business.",
    });
  }

  // --- 5. Plain-text readable by AI --------------------------------------
  {
    const access = checkContentAccessibility($);
    if (access.jsRenderingRisk) {
      checks.push({
        name: "Plain-text readable by AI",
        status: "fail",
        score: 20,
        message:
          "Your page has almost no text in the initial HTML. AI crawlers can't execute your JavaScript, so they see a nearly blank page.",
        details: `Only ${access.wordCount} words were readable before any scripts ran. Ask Strelva to serve your text in the page itself so AI and search engines can read it.`,
      });
    } else if (access.wordCount < 200) {
      checks.push({
        name: "Plain-text readable by AI",
        status: "warn",
        score: 60,
        message: `Only ${access.wordCount} words of readable text. Thin pages give AI tools little to work with.`,
        details: "Add more written detail about your business and services so AI has something to describe and recommend.",
      });
    } else {
      checks.push({
        name: "Plain-text readable by AI",
        status: "pass",
        score: 100,
        message: `Your content is in plain HTML (${access.wordCount} words) that AI tools can read directly.`,
      });
    }
  }

  // --- 6. Single clear business name -------------------------------------
  {
    const ambiguity = checkAmbiguity($, schemas);
    if (ambiguity.placeholder) {
      checks.push({
        name: "Single clear business name",
        status: "fail",
        score: 0,
        message:
          'Your site shows "coming soon" or "under construction" content. AI tools will not recommend a business that looks unfinished.',
      });
    } else if (ambiguity.distinctNames.length >= 3) {
      checks.push({
        name: "Single clear business name",
        status: "warn",
        score: 40,
        message: `Your site shows ${ambiguity.distinctNames.length} different business names. AI tools cannot confidently identify which one is you.`,
        details: "Use one consistent business name everywhere: the page title, the footer, and your business details.",
      });
    } else {
      checks.push({
        name: "Single clear business name",
        status: "pass",
        score: 100,
        message: "Your business name is used consistently, so AI tools can identify you clearly.",
      });
    }
  }

  // --- 7. llms.txt for AI agents (NEW — not in OWSH) ---------------------
  {
    const llms = ctx.llmsTxt?.trim();
    if (llms) {
      checks.push({
        name: "llms.txt for AI agents",
        status: "pass",
        score: 100,
        message:
          "You publish an llms.txt file, the 2026 signal that tells AI agents how to read and use your site.",
      });
    } else {
      checks.push({
        name: "llms.txt for AI agents",
        // Gentle warn (70): llms.txt is an emerging, optional 2026 signal almost
        // no site publishes yet, so its absence should nudge, not tank the score.
        status: "warn",
        score: 70,
        message:
          "No llms.txt file found. llms.txt is an emerging, optional plain-text guide at your site root that tells AI assistants (ChatGPT, Claude, Perplexity) what your site is and where the important pages are.",
        details:
          "Optional but forward-looking: ask Strelva to add an llms.txt that summarizes your business and points AI assistants at your key pages.",
      });
    }
  }

  // ---------------------------------------------------------------------
  // Category score: blend OWSH's own AI-discovery weighting (schema/content/
  // authority/entity) with the flattened check scores so the new signals
  // (plain-text readability, name clarity, llms.txt) also move the number.
  // ---------------------------------------------------------------------
  const checkAvg = averageCheckScores(checks.map((c) => c.score));
  const score = Math.round(0.5 * aiDiscoveryScore + 0.5 * checkAvg);

  return {
    name: "AI Readability",
    slug: "ai-readability",
    weight: 0, // runner assigns the real weight
    score,
    checks,
  };
}
