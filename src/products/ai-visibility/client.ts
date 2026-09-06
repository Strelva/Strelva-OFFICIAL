/**
 * Browser-safe AI Visibility work contract.
 *
 * This entry intentionally contains no provider, Redis, or React-module
 * dependency. Shared workspace presentation can consume it without pulling
 * server operations or the public acquisition page into its module graph.
 */
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
  AiVisibilityAssessmentPayload,
  AiVisibilityResult,
  PrivateAiVisibilityWorkPayload,
  AiVisibilityWorkResourceKind,
} from "./work";
