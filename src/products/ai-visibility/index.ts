/**
 * Browser-safe AI Visibility entry point.
 *
 * Routes and client components can use this entry without importing the scorer
 * or Redis-backed persistence. Server callers that need execution or storage
 * should import `./server` instead.
 */

export { AiVisibilityPage } from "./AiVisibilityPage";
export { AiVisibilityResultView } from "./AiVisibilityResultView";
export { AiVisibilityAssessmentForm } from "./AiVisibilityAssessmentForm";
export { AiVisibilityAssessmentResult } from "./AiVisibilityAssessmentResult";
export { probeStatusLine, renderAiVisibilityHtml, slugify } from "./html";
export {
  AI_VISIBILITY_ASSESSMENT_PAYLOAD_SCHEMA,
  AI_VISIBILITY_ASSESSMENT_RESOURCE_KIND,
  AI_VISIBILITY_PRIVATE_WORK_RESOURCE_KIND,
  AI_VISIBILITY_PRIVATE_RESOURCE_KIND,
  AI_VISIBILITY_PRODUCT_ID,
  AI_VISIBILITY_RESOURCE_KIND,
  AI_VISIBILITY_WORK_PRESENTATION,
  AI_VISIBILITY_WORK_RESOURCE_KINDS,
  aiVisibilityAssessmentPayloadSchema,
  aiVisibilityWorkPresentation,
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
  AiVisibilityAssessmentFormProps,
  SubmitAiVisibilityAssessment,
} from "./AiVisibilityAssessmentForm";
export type {
  AiVisibilityAssessmentResultProps,
  AiVisibilityAssessmentWork,
} from "./AiVisibilityAssessmentResult";
export type {
  AiVisibilityAssessmentPayload,
  AiVisibilityWorkResourceKind,
  PrivateAiVisibilityWorkPayload,
} from "./work";
