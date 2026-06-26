import type { ContentSection } from "./types";

/**
 * Machine-readable reason for a governance decision. The prose `reason` is for
 * humans; `reasonCode` lets downstream gates (e.g. auto-approval) branch on WHY
 * a change was sent to review without string-matching the message. Critically,
 * `high_risk_facts` must never be auto-published, even for a trusted tenant.
 */
export type AiGovernanceReasonCode =
  | "structural"
  | "tenant_review_required"
  | "high_risk_facts"
  | "marketing_copy"
  | "factual_auto"
  | "unclassified"
  | "auto_approved";

export type AiGovernanceDecision =
  | {
      action: "publish";
      reason: string;
      reasonCode: AiGovernanceReasonCode;
    }
  | {
      action: "review";
      reason: string;
      reasonCode: AiGovernanceReasonCode;
    }
  | {
      action: "block";
      reason: string;
      reasonCode: AiGovernanceReasonCode;
    };

const STRUCTURAL_SECTIONS = new Set<ContentSection>([
  "theme",
  "navigation",
  "footer",
]);

const REVIEW_SECTIONS = new Set<ContentSection>([
  "hero",
  "story",
  "services",
  "products",
  "shop",
  "testimonials",
  "faq",
]);

const FACTUAL_SECTIONS = new Set<ContentSection>([
  "contact",
  "settings",
  "events",
  "providers",
]);

const FACTUAL_FIELD_HINTS = [
  "address",
  "booking",
  "bookinglink",
  "bookingurl",
  "businesshours",
  "date",
  "email",
  "facebook",
  "googlemaps",
  "hours",
  "instagram",
  "link",
  "location",
  "phone",
  "price",
  "time",
  "url",
];

const HIGH_RISK_FACTUAL_FIELD_HINTS = [
  "address",
  "booking",
  "bookinglink",
  "bookingurl",
  "businesshours",
  "date",
  "email",
  "external_link",
  "externallink",
  "googlemaps",
  "hours",
  "location",
  "phone",
  "price",
  "stripepaymentlink",
  "time",
  "url",
];

const MARKETING_FIELD_HINTS = [
  "answer",
  "badge",
  "description",
  "headline",
  "paragraph",
  "quote",
  "statement",
  "subheadline",
  "tagline",
  "title",
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function collectKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectKeys(item, `${prefix}.${index}`));
  }

  const keys: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    keys.push(path);
    keys.push(...collectKeys(child, path));
  }
  return keys;
}

function hasAnyHint(keys: string[], hints: string[]): boolean {
  return keys.some((key) => {
    const normalized = normalize(key);
    return hints.some((hint) => normalized.includes(hint));
  });
}

export function decideAiContentGovernance(
  section: ContentSection,
  data: unknown,
  opts: { tenantAutoPublish?: boolean } = {}
): AiGovernanceDecision {
  if (STRUCTURAL_SECTIONS.has(section)) {
    return {
      action: "block",
      reason: "Structural design and navigation changes require manual admin work.",
      reasonCode: "structural",
    };
  }

  if (opts.tenantAutoPublish === false) {
    return {
      action: "review",
      reason: "This tenant requires admin review before AI changes publish.",
      reasonCode: "tenant_review_required",
    };
  }

  const keys = collectKeys(data);
  const touchesMarketingCopy = hasAnyHint(keys, MARKETING_FIELD_HINTS);
  const touchesHighRiskFacts = hasAnyHint(keys, HIGH_RISK_FACTUAL_FIELD_HINTS);
  const touchesOnlyFactualFields =
    keys.length > 0 &&
    hasAnyHint(keys, FACTUAL_FIELD_HINTS) &&
    !touchesMarketingCopy;

  if (touchesHighRiskFacts) {
    return {
      action: "review",
      reason: "High-risk business details such as prices, booking links, hours, addresses, contact info, or dates require review.",
      reasonCode: "high_risk_facts",
    };
  }

  if (REVIEW_SECTIONS.has(section) || touchesMarketingCopy) {
    return {
      action: "review",
      reason: "New or revised marketing copy needs human review before publishing.",
      reasonCode: "marketing_copy",
    };
  }

  if (FACTUAL_SECTIONS.has(section) || touchesOnlyFactualFields) {
    return {
      action: "publish",
      reason: "Factual business details can publish automatically.",
      reasonCode: "factual_auto",
    };
  }

  return {
    action: "review",
    reason: "Unclassified AI content changes require review.",
    reasonCode: "unclassified",
  };
}
