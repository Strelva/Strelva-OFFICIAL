import { parseWebsiteAudit } from "@/products/website-audit/client";
import type { SavedWork } from "@/platform/workspaces/types";
import type { ProductWorkPresentation } from "@/platform/products/contracts";
import {
  aiVisibilityWorkPresentation,
  type AiVisibilityResult,
} from "@/products/ai-visibility/client";
import type { WorkspaceWork } from "./contracts";

/**
 * Browser-safe, explicit product renderer registry.
 *
 * The list is intentionally static. A persisted product/resource identifier
 * selects one known parser; it cannot name a module, function, or executable
 * expression. Products add a descriptor here when their work contract is
 * ready for the shared workspace.
 */
export const WORK_PRESENTATION_REGISTRY: readonly ProductWorkPresentation<AiVisibilityResult>[] = Object.freeze([
  aiVisibilityWorkPresentation,
]);

export function getWorkspaceWorkPresentation(
  productId: string,
  resourceKind: string,
): ProductWorkPresentation<AiVisibilityResult> | null {
  return WORK_PRESENTATION_REGISTRY.find((presentation) =>
    presentation.productId === productId && presentation.resourceKinds.includes(resourceKind),
  ) ?? null;
}

/**
 * Keep the workspace response to the fields the current product accepts. An
 * unsupported product's input is not a browser contract, and persisted rows
 * may contain fields added by a newer server implementation.
 */
function presentWorkInput(
  presentation: ProductWorkPresentation<AiVisibilityResult> | null,
  input: unknown,
): Record<string, unknown> {
  // An input field is part of the product presentation contract too. Do not
  // expose even the small AI input allowlist when the resource kind is
  // unknown, because a future resource may give those keys a different
  // meaning or sensitivity.
  if (!presentation || presentation.productId !== "ai_visibility" || !input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const key of ["business", "url", "category", "location"] as const) {
    if (typeof source[key] === "string") safe[key] = source[key];
  }
  return safe;
}

/** Explicit renderer dispatch. A new product cannot masquerade as an assessment. */
export function presentWorkspaceWork(work: SavedWork): WorkspaceWork {
  if (work.productId === "website_audit" && work.resourceKind === "website_audit_report") {
    const auditPayload = parseWebsiteAudit(work.payload);
    return { id: work.id, workspaceId: work.workspaceId, productId: work.productId, resourceKind: work.resourceKind,
      title: auditPayload?.url || work.title || "Website audit", payload: null, auditPayload,
      input: {}, createdAt: work.createdAt,
      ...(!auditPayload ? { unavailableReason: "This saved website audit could not be displayed. Its stored data is unchanged." } : {}),
    };
  }
  const presentation = getWorkspaceWorkPresentation(work.productId, work.resourceKind);
  let parsed: AiVisibilityResult | null = null;
  if (presentation) {
    try {
      parsed = presentation.parsePayload(work.payload);
    } catch {
      // A malformed persisted payload must make one item unavailable, not
      // break the whole workspace response. Product parsers are a trust
      // boundary even when their current implementation uses safeParse.
      parsed = null;
    }
  }
  // The current registry only returns the AI Visibility contract, which is the
  // one payload currently supported by WorkspaceWork.
  const payload = parsed;
  let title = work.title?.trim() || "";
  if (!title && presentation?.titleForPayload) {
    try {
      title = presentation.titleForPayload(parsed)?.trim() || "";
    } catch {
      title = "";
    }
  }
  title ||= "Saved work";
  return {
    id: work.id, workspaceId: work.workspaceId,
    title, productId: work.productId,
    resourceKind: work.resourceKind, payload,
    ...(!payload ? { unavailableReason: presentation
      ? "This saved assessment could not be displayed. Its stored data has not been changed."
      : "This product's interactive view is not available in this release. Your saved work is unchanged." } : {}),
    input: presentWorkInput(presentation, work.input),
    createdAt: work.createdAt,
  };
}
