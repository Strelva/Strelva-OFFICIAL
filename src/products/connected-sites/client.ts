/** Browser-safe acknowledgement helpers; no storage or provider authority. */
export { exactBusinessPageUrl, expectedConnectedSiteSystemId } from "./acknowledgement";

export { GUIDE_ORDER, installGuide, installStepsText } from "./install-guides";
export { detectSitePlatform, type PlatformDetection } from "./platform-detect";
export { STOPPED_REPORTING_AFTER_MS, connectedSiteHealth, type ConnectedSiteHealth, type ConnectedSiteHealthState } from "./site-health";
export { EDIT_GUIDES, editGuide, editStepsFor, type EditGuide } from "./edit-guides";
export { normalizeForMatch, pageShowsChange, visiblePageText } from "./page-text";
export {
  CONNECTED_SITE_CHANGE_SCOPE, CONNECTED_SITE_CHANGE_SOURCE, CONNECTED_SITE_CHANGE_STAGES, connectedSiteChangeBrief, connectedSiteChangeRequestCommand,
  connectedSiteChangeReleaseRowSchema, connectedSiteChangeReviewSchema, connectedSiteChangeSchema, connectedSiteChangeStage, connectedSiteChangeStepSchema, connectedSiteChangesViewSchema, pendingConnectedSiteRequestSchema, planInputSchema,
  type ConnectedSiteChange, type ConnectedSiteChangeReleaseRow, type ConnectedSiteChangeReview, type ConnectedSiteChangeStage, type ConnectedSiteChangeStep, type ConnectedSiteChangesView, type PendingConnectedSiteRequest, type PlanInput,
} from "./change-model";
