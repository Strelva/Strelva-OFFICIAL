/**
 * Risk assessment for agent operations.
 * Determines whether changes can auto-apply or need review.
 */

import type { ContentSection } from "./types";

export type RiskLevel = "low" | "medium" | "high";

export interface RiskAssessment {
  level: RiskLevel;
  reason: string;
  requiresPreview: boolean;
  autoApply: boolean;
}

export interface NodeContext {
  selectedSection: ContentSection;
  selectedField?: string;
  currentValue?: string;
  sectionData?: Record<string, unknown>;
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

  // Default: update/rewrite
  // Find the first changed field
  for (const key of beforeKeys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      return {
        type: "rewrite",
        section,
        field: key,
        before: before[key],
        after: after[key],
      };
    }
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
        field: key,
        before: "",
        after: formatValue(afterVal),
        type: "added",
      });
    } else if (beforeVal !== undefined && afterVal === undefined) {
      diffs.push({
        field: key,
        before: formatValue(beforeVal),
        after: "",
        type: "removed",
      });
    } else if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      diffs.push({
        field: key,
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
