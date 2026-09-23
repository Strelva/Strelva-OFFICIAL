/**
 * Risk assessment for agent operations.
 * Determines whether changes can auto-apply or need review.
 */

import type { ContentSection } from "./types";

export type RiskLevel = "low" | "medium" | "high";

// A field name that carries a link, payment, contact detail, or a high-consequence
// business FACT (price / hours / date / time) — changes to these are never "minor",
// regardless of how few characters move. The fact terms (price|hours|date|time) are
// the class the governance classifier used to guard ALONE; adding them here makes
// the two gates overlap, so a bare price/hours edit is caught even if governance's
// substring match misses it (defense-in-depth). Over-matching (e.g. "lastUpdated"
// hitting "date") fails safe — it only routes MORE to review, never less.
const SENSITIVE_FIELD = /url|link|href|booking|stripe|payment|email|phone|address|map|price|hours|date|time/i;
// Markup/script tokens that must never auto-publish if newly introduced.
const MARKUP_TOKEN = /<\s*(script|iframe|a|img|svg|object|embed|style)\b|javascript:|on\w+\s*=/i;

function looksLikeUrl(v: unknown): boolean {
  return typeof v === "string" && /^\s*(https?:\/\/|\/\/|www\.|mailto:|tel:)/i.test(v);
}

/** A change that introduces markup/script not present before. */
function introducesMarkup(before: unknown, after: unknown): boolean {
  const a = typeof after === "string" ? after : "";
  const b = typeof before === "string" ? before : "";
  return MARKUP_TOKEN.test(a) && !MARKUP_TOKEN.test(b);
}

/** How risky a single field's before→after change is — higher = more dangerous.
 *  Used to pick the WORST changed field so a malicious link/markup swap can't
 *  hide behind a benign first field. */
function changeRisk(field: string, before: unknown, after: unknown): number {
  if (JSON.stringify(before) === JSON.stringify(after)) return 0;
  if (introducesMarkup(before, after)) return 100;
  if (SENSITIVE_FIELD.test(field) || looksLikeUrl(before) || looksLikeUrl(after)) return 90;
  if (typeof before === "string" && typeof after === "string") {
    return 1 + Math.abs(after.length - before.length) / Math.max(before.length, 1);
  }
  return 1;
}

export interface RiskAssessment {
  level: RiskLevel;
  reason: string;
  requiresPreview: boolean;
  autoApply: boolean;
}

export interface AgentOperation {
  type: "rewrite" | "add" | "update" | "delete" | "reorder" | "visibility" | "structural";
  section: ContentSection;
  field?: string;
  before?: unknown;
  after?: unknown;
  itemCount?: { before: number; after: number };
}

/**
 * Assess risk level for a proposed agent operation.
 */
export function assessRisk(operation: AgentOperation): RiskAssessment {
  // High risk: structural changes, deletions, visibility
  if (operation.type === "structural") {
    return {
      level: "high",
      reason: "Structural changes to site layout require manual review.",
      requiresPreview: true,
      autoApply: false,
    };
  }

  if (operation.type === "visibility") {
    return {
      level: "high",
      reason: "Section visibility changes affect site structure.",
      requiresPreview: true,
      autoApply: false,
    };
  }

  if (operation.type === "delete") {
    return {
      level: "high",
      reason: "Deleting content cannot be undone automatically.",
      requiresPreview: true,
      autoApply: false,
    };
  }

  if (operation.type === "reorder") {
    return {
      level: "medium",
      reason: "Reordering affects how content appears to visitors.",
      requiresPreview: true,
      autoApply: false,
    };
  }

  // Check for significant array item changes
  if (operation.itemCount) {
    const { before, after } = operation.itemCount;
    if (before > 0 && after < before * 0.5) {
      return {
        level: "high",
        reason: `Would remove ${before - after} of ${before} items.`,
        requiresPreview: true,
        autoApply: false,
      };
    }
    if (after > before + 5) {
      return {
        level: "medium",
        reason: `Adding ${after - before} new items at once.`,
        requiresPreview: true,
        autoApply: false,
      };
    }
  }

  // Medium risk: adding new content
  if (operation.type === "add") {
    return {
      level: "medium",
      reason: "New content will be visible to site visitors.",
      requiresPreview: true,
      autoApply: false,
    };
  }

  // Low risk: minor text edits, rewrites
  if (operation.type === "rewrite" || operation.type === "update") {
    // Content-aware checks come BEFORE the length heuristic: a same-length swap
    // ("calendly.com/me" -> "evil.com/x", or "Open 9-5" -> "<script>…") moves
    // few characters but is high-consequence. Length alone would wave it through.
    if (introducesMarkup(operation.before, operation.after)) {
      return {
        level: "medium",
        reason: "Change introduces markup or script. Needs review.",
        requiresPreview: true,
        autoApply: false,
      };
    }
    if (
      SENSITIVE_FIELD.test(operation.field ?? "") ||
      looksLikeUrl(operation.before) ||
      looksLikeUrl(operation.after)
    ) {
      return {
        level: "medium",
        reason: "Change to a link, payment, or contact field. Needs review.",
        requiresPreview: true,
        autoApply: false,
      };
    }

    // Check if it's a significant rewrite
    if (typeof operation.before === "string" && typeof operation.after === "string") {
      const beforeLen = operation.before.length;
      const afterLen = operation.after.length;
      const lengthChange = Math.abs(afterLen - beforeLen) / Math.max(beforeLen, 1);

      if (lengthChange > 0.5) {
        return {
          level: "medium",
          reason: "Significant content change (>50% length difference).",
          requiresPreview: true,
          autoApply: false,
        };
      }
    }

    return {
      level: "low",
      reason: "Minor text edit.",
      requiresPreview: false,
      autoApply: true,
    };
  }

  // Default: medium risk, require preview
  return {
    level: "medium",
    reason: "Content change requires review.",
    requiresPreview: true,
    autoApply: false,
  };
}

/**
 * Classify operation type from before/after data comparison.
 */
export function classifyOperation(
  section: ContentSection,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): AgentOperation {
  const beforeKeys = new Set(Object.keys(before));
  const afterKeys = new Set(Object.keys(after));

  // Check for structural sections
  if (["theme", "navigation", "footer"].includes(section)) {
    return { type: "structural", section, before, after };
  }

  // Check for array-based content (services, events, etc.)
  const arrayKeys = ["services", "products", "events", "testimonials", "providers", "faqs", "items"];
  for (const key of arrayKeys) {
    const beforeArr = before[key];
    const afterArr = after[key];
    if (Array.isArray(beforeArr) || Array.isArray(afterArr)) {
      const beforeLen = Array.isArray(beforeArr) ? beforeArr.length : 0;
      const afterLen = Array.isArray(afterArr) ? afterArr.length : 0;

      if (afterLen < beforeLen) {
        return {
          type: "delete",
          section,
          field: key,
          before,
          after,
          itemCount: { before: beforeLen, after: afterLen },
        };
      }
      if (afterLen > beforeLen) {
        return {
          type: "add",
          section,
          field: key,
          before,
          after,
          itemCount: { before: beforeLen, after: afterLen },
        };
      }
    }
  }

  // Check for field additions
  for (const key of afterKeys) {
    if (!beforeKeys.has(key) && after[key] !== undefined && after[key] !== "") {
      return { type: "add", section, field: key, before: before[key], after: after[key] };
    }
  }

  // Check for field deletions
  for (const key of beforeKeys) {
    if (!afterKeys.has(key) || after[key] === undefined || after[key] === "") {
      if (before[key] !== undefined && before[key] !== "") {
        return { type: "delete", section, field: key, before: before[key], after: after[key] };
      }
    }
  }

  // Default: update/rewrite. Pick the WORST changed field, not the first — a
  // malicious link/markup swap could otherwise hide behind a benign field that
  // sorts earlier, getting the whole op classified on the benign change.
  let worst: { key: string; risk: number } | null = null;
  for (const key of beforeKeys) {
    const risk = changeRisk(key, before[key], after[key]);
    if (risk > 0 && (!worst || risk > worst.risk)) worst = { key, risk };
  }
  if (worst) {
    return {
      type: "rewrite",
      section,
      field: worst.key,
      before: before[worst.key],
      after: after[worst.key],
    };
  }

  return { type: "update", section, before, after };
}

/**
 * Format a preview diff for display.
 */
export interface PreviewDiff {
  field: string;
  before: string;
  after: string;
  type: "added" | "removed" | "changed";
}

// Human labels for the section schema keys so the client's approval-queue diff
// reads "Headline" / "Button text", not the raw `heading` / `ctaText` keys.
const FIELD_LABELS: Record<string, string> = {
  heading: "Headline",
  headline: "Headline",
  subheading: "Subheading",
  subheadline: "Subheading",
  title: "Title",
  body: "Body copy",
  description: "Description",
  text: "Text",
  ctaText: "Button text",
  ctaLabel: "Button text",
  ctaUrl: "Button link",
  ctaLink: "Button link",
  items: "Items",
  media: "Image",
  image: "Image",
  imageUrl: "Image",
};

function fieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  // Fallback: camelCase / snake_case → spaced, capitalized.
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function generatePreviewDiffs(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): PreviewDiff[] {
  const diffs: PreviewDiff[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const beforeVal = before[key];
    const afterVal = after[key];

    if (beforeVal === undefined && afterVal !== undefined) {
      diffs.push({
        field: fieldLabel(key),
        before: "",
        after: formatValue(afterVal),
        type: "added",
      });
    } else if (beforeVal !== undefined && afterVal === undefined) {
      diffs.push({
        field: fieldLabel(key),
        before: formatValue(beforeVal),
        after: "",
        type: "removed",
      });
    } else if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      diffs.push({
        field: fieldLabel(key),
        before: formatValue(beforeVal),
        after: formatValue(afterVal),
        type: "changed",
      });
    }
  }

  return diffs;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return `[${val.length} items]`;
  if (typeof val === "object") return JSON.stringify(val, null, 2);
  return String(val);
}
