/**
 * Shared server/client DTOs for the inquiry workspace surface.
 *
 * These types live beside the canonical inquiry engine so the product adapter
 * never depends on the experience layer. The experience layer re-exports them
 * for its existing view imports.
 */

import type {
  AcceptShapeInput,
  ChangeReceipt,
  DraftEditInput,
  InquiryCapabilityState,
  InquiryEngineState,
  InquiryRecord,
  InquiryRuleUpdateInput,
  InquiryWork,
  RehearsalRun,
  StartInquiryWorkInput,
  ResponsibilityUpdateInput,
  WhyResult,
} from "./contracts";
import type {
  PatternConflictResolution,
  PatternUpdateProposal,
} from "./inquiry-pattern-updates";

export type InquiryAudience = "business" | "agency";

export type InquiryPatternInstallationView = {
  id: string;
  capabilityId: string;
  sourceBusinessId: string;
  sourceCapabilityId: string;
  sourceVersion: number;
  targetVersion: number;
  status: "installed" | "update_available" | "conflicted";
  lastProposalId: string | null;
  updatedAt: string;
};

export type InquirySurfaceSnapshot = {
  /** Server-only concurrency cursor carried through the client adapter. */
  revision?: number | null;
  business: {
    id: string;
    /** Routing slug used by server-authorized operational commands. */
    tenantId?: string;
    name: string;
    domain: string | null;
    role: "owner" | "agency_member" | "read_only";
    description: string;
  };
  state: InquiryEngineState;
  capabilities: InquiryCapabilityState[];
  connections: import("./contracts").InquiryConnectionView[];
  onboarding: import("./contracts").InquirySetupFacts;
  audience: InquiryAudience;
  available: boolean;
  /** Redis availability is explicit so missing records never render as empty. */
  recordsAvailable?: boolean;
  readOnly: boolean;
  rehearsal: boolean;
  /** Read-only provider timeline evidence can be unavailable independently of workspace state. */
  deliveryEvidence?: {
    available: boolean;
    reason: string | null;
  };
  pausedRequestIds?: string[];
  permissions?: {
    canStart?: boolean;
    canEdit?: boolean;
    canPublish?: boolean;
    canManageRecords?: boolean;
    canCorrectOnboarding?: boolean;
    canManageResponsibility?: boolean;
    canManageConnections?: boolean;
  };
  whyByInquiry?: Record<string, WhyResult>;
  patterns?: Array<{
    id: string;
    name: string;
    summary: string;
    sourceBusinessId: string;
    capabilityId: string;
    provenVersion: number;
    cleanReceiptCount: number;
  }>;
  patternInstallations?: InquiryPatternInstallationView[];
  account?: {
    name: string | null;
    email: string | null;
    memberships: Array<{ businessId: string; businessName: string; role: string }>;
  };
};

export type InquirySurfaceAction =
  | { kind: "start"; input: StartInquiryWorkInput }
  | { kind: "contextual-request"; inquiryId: string; intent: string; actorId: string }
  | { kind: "accept-shape"; requestId: string; input: AcceptShapeInput }
  | { kind: "edit"; requestId: string; input: DraftEditInput }
  | { kind: "edit-rules"; requestId: string; input: InquiryRuleUpdateInput }
  | { kind: "rehearse"; requestId: string; actorId: string }
  | { kind: "publish"; requestId: string; actorId: string }
  | { kind: "undo"; requestId: string; actorId: string }
  | { kind: "simulate-inquiry"; capabilityId: string; fields: Record<string, string>; actorId: string }
  | { kind: "set-email-consent"; requestId: string; granted: boolean; actorId: string }
  | { kind: "pause"; requestId: string; actorId: string }
  | { kind: "resume"; requestId: string; actorId: string }
  | { kind: "bulk-record"; recordIds: string[]; action: "assign" | "mark_handled"; actorId: string }
  | { kind: "bulk-undo"; recordIds: string[]; actorId: string }
  | { kind: "correct-onboarding"; statementId: string; value: string; actorId: string }
  | { kind: "scan-onboarding"; website: string; actorId: string }
  | { kind: "promote-responsibility"; responsibilityId: string; actorId: string }
  | { kind: "update-responsibility"; responsibilityId: string; input: ResponsibilityUpdateInput }
  | { kind: "fix-why"; requestId: string; path: string; actorId: string }
  | { kind: "use-pattern"; patternId: string; businessId: string; destination?: string; actorId: string }
  | { kind: "propose-pattern-update"; installationId: string; capabilityId: string; actorId: string }
  | { kind: "stage-pattern-update"; installationId: string; capabilityId: string; sourceVersion: number; resolutions: PatternConflictResolution[]; actorId: string };

export type InquirySurfaceResult = {
  snapshot: InquirySurfaceSnapshot;
  work?: InquiryWork;
  record?: InquiryRecord;
  change?: ChangeReceipt;
  rehearsal?: RehearsalRun;
  patternUpdate?: PatternUpdateProposal;
  patternInstallation?: InquiryPatternInstallationView;
  why?: WhyResult;
  affectedRecordIds?: string[];
  message?: string;
};

export interface InquirySurfaceAdapter {
  getSnapshot(): InquirySurfaceSnapshot;
  execute(action: InquirySurfaceAction): Promise<InquirySurfaceResult> | InquirySurfaceResult;
}
