import {
  AI_VISIBILITY_PRODUCT_ID,
  AI_VISIBILITY_WORK_RESOURCE_KINDS,
  parseAiVisibilityAssessmentPayload,
  type AiVisibilityResult,
} from "@/products/ai-visibility/client";
import { parseWebsiteAudit } from "@/products/website-audit/client";
import {
  ASSESSMENT_METHOD_LABELS,
  ASSESSMENT_PRESENTATION_VERSION,
  assessmentActionsFor,
  type AssessmentAccess,
  type AssessmentKind,
  type AssessmentResult,
  type AssessmentTimestampBasis,
} from "./contracts";

const WEBSITE_AUDIT_PRODUCT_ID = "website_audit" as const;
const WEBSITE_AUDIT_RESOURCE_KIND = "website_audit_report" as const;

/** Minimum source fields needed to build the browser-safe assessment result. */
export interface AssessmentWorkSource {
  id: string;
  workspaceId: string;
  productId: string;
  resourceKind: string;
  title?: string;
  payload: unknown;
  createdAt: string;
  observedAt?: string;
  observedAtBasis?: Exclude<AssessmentTimestampBasis, "saved">;
  access?: AssessmentAccess;
  unavailableReason?: string;
}

export function assessmentKindForResource(productId: string, resourceKind: string): AssessmentKind | null {
  if (productId === AI_VISIBILITY_PRODUCT_ID && (AI_VISIBILITY_WORK_RESOURCE_KINDS as readonly string[]).includes(resourceKind)) {
    return "ai_visibility";
  }
  if (productId === WEBSITE_AUDIT_PRODUCT_ID && resourceKind === WEBSITE_AUDIT_RESOURCE_KIND) {
    return "website_audit";
  }
  return null;
}

function safeTitle(title: string | undefined, fallback: string): string {
  const clean = title?.trim();
  return clean || fallback;
}

function aiAvailability(payload: AiVisibilityResult | null): AssessmentResult["availability"] {
  if (!payload) return "unavailable";
  if (payload.measurementStatus === "unavailable" || payload.readinessMeasured === false) return "unavailable";
  if (payload.measurementStatus === "partial") return "partial";
  return "available";
}

function presentAiVisibility(source: AssessmentWorkSource): AssessmentResult {
  const payload = parseAiVisibilityAssessmentPayload(source.payload);
  const subject = {
    name: safeTitle(payload?.business, source.title || "AI Visibility assessment"),
    ...(payload?.url ? { url: payload.url } : {}),
  };
  const availability = aiAvailability(payload);
  return {
    kind: "ai_visibility",
    method: { id: "ai_visibility", label: ASSESSMENT_METHOD_LABELS.ai_visibility },
    presentationVersion: ASSESSMENT_PRESENTATION_VERSION,
    resultId: source.id,
    workspaceId: source.workspaceId,
    resourceKind: source.resourceKind,
    subject,
    observedAt: source.observedAt || null,
    observedAtBasis: source.observedAt ? source.observedAtBasis || "source" : "saved",
    recordedAt: source.createdAt,
    availability,
    access: source.access || "owned",
    actions: assessmentActionsFor("ai_visibility", Boolean(payload), source.access || "owned"),
    payload,
    ...(!payload ? { unavailableReason: source.unavailableReason || "This saved assessment could not be displayed. Its stored data has not been changed." } : {}),
  };
}

function presentWebsiteAudit(source: AssessmentWorkSource): AssessmentResult {
  const payload = parseWebsiteAudit(source.payload);
  const subject = {
    name: safeTitle(payload?.url, source.title || "Website audit"),
    ...(payload?.url ? { url: payload.url } : {}),
  };
  return {
    kind: "website_audit",
    method: { id: "website_audit", label: ASSESSMENT_METHOD_LABELS.website_audit },
    presentationVersion: ASSESSMENT_PRESENTATION_VERSION,
    resultId: source.id,
    workspaceId: source.workspaceId,
    resourceKind: source.resourceKind,
    subject,
    observedAt: payload?.scannedAt || source.observedAt || null,
    observedAtBasis: payload?.scannedAt ? "evidence" : source.observedAt ? source.observedAtBasis || "source" : "saved",
    recordedAt: source.createdAt,
    availability: payload ? "available" : "unavailable",
    access: source.access || "owned",
    actions: assessmentActionsFor("website_audit", Boolean(payload), source.access || "owned"),
    payload,
    ...(!payload ? { unavailableReason: source.unavailableReason || "This saved website audit could not be displayed. Its stored data is unchanged." } : {}),
  };
}

/**
 * Convert one persisted row into the explicit method/payload contract.
 * Unknown product/resource pairs intentionally return null rather than
 * treating arbitrary JSON as an assessment.
 */
export function presentAssessmentWork(source: AssessmentWorkSource): AssessmentResult | null {
  switch (assessmentKindForResource(source.productId, source.resourceKind)) {
    case "ai_visibility":
      return presentAiVisibility(source);
    case "website_audit":
      return presentWebsiteAudit(source);
    default:
      return null;
  }
}

export function isAssessmentWork(productId: string, resourceKind: string): boolean {
  return assessmentKindForResource(productId, resourceKind) !== null;
}

export { WEBSITE_AUDIT_PRODUCT_ID, WEBSITE_AUDIT_RESOURCE_KIND };
