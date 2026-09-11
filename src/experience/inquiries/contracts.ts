import type {
  AcceptShapeInput,
  ChangeReceipt,
  ContextualInquiryRequestInput,
  DraftEditInput,
  InquiryCapabilityDefinition,
  InquiryCapabilityState,
  InquiryEngineState,
  InquiryPlan,
  InquiryRecord,
  InquiryRecordDefinition,
  InquiryRequestState,
  InquiryRuleUpdateInput,
  InquiryShapeProposal,
  InquiryShapeLineKind,
  InquiryWork,
  InquiryWorkContext,
  RehearsalRun,
  StartInquiryWorkInput,
  ResponsibilityPolicy,
  ResponsibilityAction,
  ResponsibilityApprovalClause,
  ResponsibilityNeverClause,
  ResponsibilityUpdateInput,
  WhyResult,
} from "@/products/inquiries/contracts";

export type {
  AcceptShapeInput,
  ChangeReceipt,
  ContextualInquiryRequestInput,
  DraftEditInput,
  InquiryCapabilityDefinition,
  InquiryCapabilityState,
  InquiryEngineState,
  InquiryPlan,
  InquiryRecord,
  InquiryRecordDefinition,
  InquiryRequestState,
  InquiryRuleUpdateInput,
  InquiryShapeProposal,
  InquiryShapeLineKind,
  InquiryWork,
  InquiryWorkContext,
  RehearsalRun,
  StartInquiryWorkInput,
  ResponsibilityPolicy,
  ResponsibilityAction,
  ResponsibilityApprovalClause,
  ResponsibilityNeverClause,
  ResponsibilityUpdateInput,
  WhyResult,
};

export type {
  InquiryConnectionView,
} from "@/products/inquiries/contracts";

export type {
  InquiryAudience,
  InquirySurfaceAction,
  InquirySurfaceAdapter,
  InquirySurfaceResult,
  InquirySurfaceSnapshot,
} from "@/products/inquiries/contracts";

export type InquiryView =
  | "home"
  | "new"
  | "shape"
  | "work"
  | "plan"
  | "preview"
  | "rehearsal"
  | "receipt"
  | "search"
  | "record"
  | "why"
  | "responsibility"
  | "connections"
  | "onboarding"
  | "account"
  | "attention"
  | "patterns";

export const REQUEST_STATE_LABELS: Record<InquiryRequestState, string> = {
  shaped: "Shaped",
  planned: "Plan ready",
  editing: "Editing the result",
  rehearsing: "Rehearsal running",
  ready_to_publish: "Ready to make live",
  publishing: "Making live",
  live_unverified: "Live, verification pending",
  handled: "Handled",
  failed: "Needs a safe next step",
  cancelled: "Cancelled",
};

export function requestStateLabel(state: InquiryRequestState): string {
  return REQUEST_STATE_LABELS[state];
}

export function phaseForWork(work: InquiryWork): "problem" | "work" | "result" | "system" | "handled" {
  if (work.state === "handled") return "handled";
  if (work.state === "publishing" || work.state === "live_unverified") return "system";
  if (work.state === "ready_to_publish" || work.state === "editing") return "result";
  if (work.state === "planned" || work.state === "rehearsing") return "work";
  return "problem";
}

export function phaseLabel(phase: ReturnType<typeof phaseForWork>): string {
  return {
    problem: "Problem",
    work: "Work",
    result: "Result",
    system: "Your system",
    handled: "Handled",
  }[phase];
}
