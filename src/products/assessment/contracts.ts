import type { AuditResult } from "@/lib/audit/types";
import type { AiVisibilityResult } from "@/products/ai-visibility/contracts";

/** The assessment methods Strelva currently presents as distinct products. */
export type AssessmentKind = "ai_visibility" | "website_audit";

/** Actions are product capabilities, not a generic workspace command set. */
export type AssessmentAction = "save" | "export" | "recover" | "handoff";

export type AssessmentAvailability = "available" | "partial" | "unavailable";
export type AssessmentTimestampBasis = "evidence" | "source" | "saved";

/**
 * Access is descriptive context supplied by the owning surface. It does not
 * authorize a request; the server still checks the workspace/resource owner.
 */
export type AssessmentAccess =
  | "public"
  | "owned"
  | "member"
  | "delegated_read"
  | "addressed";

export interface AssessmentActionState {
  allowed: boolean;
  reason?: string;
}

export type AssessmentActionMap = Readonly<Record<AssessmentAction, AssessmentActionState>>;

export interface AssessmentSubject {
  name: string;
  url?: string;
}

interface AssessmentBase {
  /** Discriminates the payload and preserves the product method. */
  kind: AssessmentKind;
  method: {
    id: AssessmentKind;
    label: string;
    /** Reserved for a provider/scorer version when the source records one. */
    version?: string | null;
  };
  /** Version of this browser-facing descriptor, separate from method provenance. */
  presentationVersion: string;
  resultId: string;
  workspaceId: string;
  resourceKind: string;
  subject: AssessmentSubject;
  /** Null means the source did not carry a measurement timestamp. */
  observedAt: string | null;
  observedAtBasis: AssessmentTimestampBasis;
  /** Durable row timestamp, never presented as measurement evidence. */
  recordedAt: string;
  availability: AssessmentAvailability;
  access: AssessmentAccess;
  actions: AssessmentActionMap;
  unavailableReason?: string;
}

export interface AiVisibilityAssessment extends AssessmentBase {
  kind: "ai_visibility";
  method: {
    id: "ai_visibility";
    label: "AI Visibility assessment";
    version?: string | null;
  };
  payload: AiVisibilityResult | null;
}

export interface WebsiteAuditAssessment extends AssessmentBase {
  kind: "website_audit";
  method: {
    id: "website_audit";
    label: "Website audit";
    version?: string | null;
  };
  payload: AuditResult | null;
}

/** A saved assessment result; `kind` narrows `payload` to its method schema. */
export type AssessmentResult = AiVisibilityAssessment | WebsiteAuditAssessment;

/** Names used by the release contract and by presentation callers. */
export type AssessmentView = AssessmentResult;
export type AssessmentActionId = AssessmentAction;
export type AssessmentActions = AssessmentActionMap;

/** Presentation contract version; this does not claim a scorer or model version. */
export const ASSESSMENT_PRESENTATION_VERSION = "1" as const;

export const ASSESSMENT_METHOD_LABELS = Object.freeze({
  ai_visibility: "AI Visibility assessment",
  website_audit: "Website audit",
} as const);

export function assessmentActionState(
  assessment: AssessmentResult,
  action: AssessmentAction,
): AssessmentActionState {
  return assessment.actions[action];
}

/** The action policy shared by the two supported result methods. */
export function assessmentActionsFor(
  kind: AssessmentKind,
  hasPayload: boolean,
  access: AssessmentAccess = "owned",
): AssessmentActionMap {
  const unavailable = "This assessment result is unavailable.";
  const canHandoff = kind === "ai_visibility" && hasPayload && (access === "owned" || access === "member");
  return Object.freeze({
    save: access === "public" && hasPayload
      ? { allowed: true }
      : { allowed: false, reason: "This assessment is already saved." },
    export: kind === "website_audit" && hasPayload
      ? { allowed: true }
      : { allowed: false, reason: kind === "ai_visibility" ? "AI Visibility export is not available here." : unavailable },
    recover: { allowed: false, reason: "Saved assessments do not need recovery." },
    handoff: canHandoff
      ? { allowed: true }
      : {
        allowed: false,
        reason: kind === "website_audit"
          ? "Website Audit handoff is not supported."
          : access === "delegated_read"
            ? "Delegated read access cannot create a handoff."
            : access === "public"
              ? "Public results cannot create a handoff."
              : unavailable,
      },
  });
}
