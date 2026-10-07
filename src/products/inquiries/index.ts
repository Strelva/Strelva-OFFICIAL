/** Public product entry point for inquiry operations used by routes and jobs. */

export { reconcileWorkspaceInquiryProviderEvent } from "./workspace-replies";

export { inquiryOutcomeProofEnabled, readTenantInquiryOutcomeProof } from "./outcome-proof";

export { runDueInquiryFollowUps } from "./follow-up-cron";

export { inquiryReleaseEnabled, inquiryReleaseMayBeOn, inquiryReleaseEnabledForWorkspace, inquiryReleaseEnabledForTenant, inquiryReleasedForCurrentUser } from "./release";
export { discoverInquiryPortfolio, resolveInquiryPatternVersion } from "./portfolio";
export type { ResolveInquiryPatternVersionInput } from "./portfolio";
export { reconcileInquiryProviderEvent } from "./reconciliation";
export {
  commitPatternInstallationAfterVerification,
  commitPatternUpdate,
  getPatternInstallation,
  listPatternInstallations,
  patternShape,
  patternUpdatePublishReadiness,
  proposePatternUpdate,
  registerPatternInstallation,
  resolvePatternUpdate,
  stagePatternUpdate,
} from "./inquiry-pattern-updates";
export type {
  CommitPatternUpdateInput,
  InquiryPatternShape,
  PatternConflictChoice,
  PatternConflictResolution,
  PatternFieldShape,
  PatternInstallation,
  PatternPendingUpdate,
  PatternInstallationStatus,
  PatternUpdateChange,
  PatternUpdateConflict,
  PatternUpdateInput,
  PatternUpdateProposal,
  PatternUpdatePublishReadiness,
  PatternUpdateStatus,
  ResolvedPatternUpdate,
  StagePatternUpdateInput,
  StagePatternUpdateResult,
} from "./inquiry-pattern-updates";
export type {
  InquiryMessageReviewAction,
  InquiryMessageReviewOutcome,
  InquiryMessageReviewOutcomeStatus,
  InquiryMessageReviewPrepareInput,
  InquiryMessageReviewPreview,
} from "./delivery-approval-contract";

export {
  approveInquiryMessageReview,
  authorizeInquiryMessageReviewActor,
  executeInquiryMessageReview,
  getInquiryMessageReviewMetadata,
  INQUIRY_MESSAGE_REVIEW_KIND,
  INQUIRY_MESSAGE_REVIEW_SCHEMA_VERSION,
  isInquiryMessageReviewEvent,
  prepareInquiryMessageReview,
  reconcileInquiryMessageReview,
  InquiryMessageReviewEngineError,
} from "./delivery-approval";
export type {
  InquiryMessageReviewDependencies,
  InquiryMessageReviewEventMetadata,
} from "./delivery-approval";

export { replyFromWorkspace, workspaceInquiryRepliesEnabled, workspaceReplyInput } from "./workspace-replies";
export type { WorkspaceReplyOutcome, WorkspaceReplyStatus } from "./workspace-replies";
export { notifyInquiryOwner, repairInquiryOwnerNotice } from "./owner-notice";

export async function readWorkspaceInquiryInbox(...args: Parameters<typeof import("./workspace-inbox").readWorkspaceInquiryInbox>) {
  return (await import("./workspace-inbox")).readWorkspaceInquiryInbox(...args);
}
export type { WorkspaceLeads } from "./linked-leads";
