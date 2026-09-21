import { z } from "zod";
import type { ProductWorkPresentation } from "@/platform/products/contracts";
import type { AiVisibilityResult } from "./contracts";

export type { AiVisibilityResult } from "./contracts";

/** Stable product and resource identifiers used by saved workspace work. */
export const AI_VISIBILITY_PRODUCT_ID = "ai_visibility" as const;
/** The identifier used by the public assessment and by existing saved rows. */
export const AI_VISIBILITY_ASSESSMENT_RESOURCE_KIND = "ai_visibility_assessment" as const;
/** Canonical identifier for a private, account-owned assessment. */
export const AI_VISIBILITY_PRIVATE_WORK_RESOURCE_KIND = "private_ai_visibility_work" as const;
/** Alias for callers that use "private resource" terminology. */
export const AI_VISIBILITY_PRIVATE_RESOURCE_KIND = AI_VISIBILITY_PRIVATE_WORK_RESOURCE_KIND;

/**
 * Resource identifiers accepted by the workspace presentation during the
 * migration. The assessment identifier is intentionally retained: the first
 * workspace writer persisted it even though the product catalog later named
 * the private resource `private_ai_visibility_work`.
 */
export const AI_VISIBILITY_WORK_RESOURCE_KINDS = Object.freeze([
  AI_VISIBILITY_PRIVATE_WORK_RESOURCE_KIND,
  AI_VISIBILITY_ASSESSMENT_RESOURCE_KIND,
] as const);

/** Backward-compatible shorthand for callers that only need the old wire id. */
export const AI_VISIBILITY_RESOURCE_KIND = AI_VISIBILITY_ASSESSMENT_RESOURCE_KIND;

export type AiVisibilityWorkResourceKind = (typeof AI_VISIBILITY_WORK_RESOURCE_KINDS)[number];

export function isAiVisibilityWorkResourceKind(value: string): value is AiVisibilityWorkResourceKind {
  return (AI_VISIBILITY_WORK_RESOURCE_KINDS as readonly string[]).includes(value);
}

const signalSchema = z.object({
  id: z.string(),
  label: z.string(),
  pass: z.boolean(),
  detail: z.string(),
  weight: z.number(),
});

const citationSchema = z.object({
  probed: z.boolean(),
  mentioned: z.boolean(),
  recommended: z.boolean(),
  note: z.string(),
});

/**
 * Private saved-work payload contract.
 *
 * This is deliberately a stripped object schema. Persisted JSON may contain
 * fields added by a newer scorer, but a workspace response must expose only
 * the fields this renderer understands. The parser below is the sole gateway
 * from untrusted stored JSON to the browser-safe result contract.
 */
export const aiVisibilityAssessmentPayloadSchema = z.object({
  business: z.string(),
  url: z.string().optional(),
  score: z.number(),
  grade: z.enum(["A", "B", "C", "D", "F"]),
  verdict: z.string(),
  topFix: z.string(),
  measurementStatus: z.enum(["measured", "partial", "unavailable"]).optional(),
  readinessMeasured: z.boolean().optional(),
  measurementNote: z.string().optional(),
  signals: z.array(signalSchema),
  citation: citationSchema,
});

/** Alias with an explicit all-caps name for schema-oriented consumers. */
export const AI_VISIBILITY_ASSESSMENT_PAYLOAD_SCHEMA = aiVisibilityAssessmentPayloadSchema;

export type AiVisibilityAssessmentPayload = z.infer<typeof aiVisibilityAssessmentPayloadSchema>;

/** Descriptive alias for callers dealing with the private workspace copy. */
export type PrivateAiVisibilityWorkPayload = AiVisibilityAssessmentPayload;

/** Browser-safe result parser for persisted private work. */
export function parseAiVisibilityAssessmentPayload(payload: unknown): AiVisibilityResult | null {
  const parsed = aiVisibilityAssessmentPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

/** Alias that names the private-work boundary explicitly. */
export const parsePrivateAiVisibilityWorkPayload = parseAiVisibilityAssessmentPayload;

export const aiVisibilityWorkPresentation: ProductWorkPresentation<AiVisibilityResult> = {
  productId: AI_VISIBILITY_PRODUCT_ID,
  resourceKinds: AI_VISIBILITY_WORK_RESOURCE_KINDS,
  parsePayload: parseAiVisibilityAssessmentPayload,
  titleForPayload: (payload) => {
    const business = payload?.business.trim();
    return business || undefined;
  },
};

/** Uppercase alias for registry-style imports. */
export const AI_VISIBILITY_WORK_PRESENTATION = aiVisibilityWorkPresentation;
