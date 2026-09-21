/**
 * Server entry point for the AI Visibility product.
 *
 * This is the only public product import that exposes scoring, provider calls,
 * and Redis-backed scorecard persistence. Public request authentication and
 * lead lifecycle wiring remain owned by their route layers; the private
 * workspace assessment use case owns its workspace preflight and budget.
 */

export { gradeFor, scoreAiVisibility } from "./score";
export {
  runPrivateAiVisibilityAssessment,
  PrivateAiVisibilityAssessmentRateLimitError,
  savePublicAiVisibilityResult,
  PublicAiVisibilityImportRateLimitError,
  PublicAiVisibilityResultUnavailableError,
} from "./usecase";
export {
  getAiVisibilityResult,
  recordAiVisibilityResultView,
  saveAiVisibilityResult,
} from "./results";
export { probeStatusLine, renderAiVisibilityHtml, slugify } from "./html";
export {
  AI_VISIBILITY_ASSESSMENT_PAYLOAD_SCHEMA,
  AI_VISIBILITY_ASSESSMENT_RESOURCE_KIND,
  AI_VISIBILITY_PRIVATE_WORK_RESOURCE_KIND,
  AI_VISIBILITY_PRIVATE_RESOURCE_KIND,
  AI_VISIBILITY_PRODUCT_ID,
  AI_VISIBILITY_RESOURCE_KIND,
  AI_VISIBILITY_WORK_RESOURCE_KINDS,
  aiVisibilityAssessmentPayloadSchema,
  isAiVisibilityWorkResourceKind,
  parsePrivateAiVisibilityWorkPayload,
  parseAiVisibilityAssessmentPayload,
} from "./work";
export type {
  AiVisibilityResult,
  CitationProbe,
  Grade,
  MeasurementStatus,
  ScoreInput,
  Signal,
  StoredAiVisibilityResult,
} from "./contracts";
export type {
  AiVisibilityAssessmentPayload,
  AiVisibilityWorkResourceKind,
  PrivateAiVisibilityWorkPayload,
} from "./work";
