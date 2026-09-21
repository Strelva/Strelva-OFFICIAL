import { z } from "zod";

export const ONBOARDING_VERSION = 1 as const;
export const ONBOARDING_PRODUCT_ID = "onboarding" as const;
export const ONBOARDING_RESOURCE_KIND = "case" as const;

const id = z.string().uuid();
const shortText = (max: number) => z.string().trim().min(1).max(max);
const fieldValues = z.record(z.string().trim().min(1).max(120), z.string().max(4_000));

export const onboardingSubjectTypeSchema = z.enum(["customer", "employee", "supplier"]);
export type OnboardingSubjectType = z.infer<typeof onboardingSubjectTypeSchema>;

export const onboardingRequirementStatusSchema = z.enum(["missing", "supplied", "correction", "accepted"]);
export type OnboardingRequirementStatus = z.infer<typeof onboardingRequirementStatusSchema>;

export const onboardingCaseStatusSchema = z.enum(["in_progress", "complete"]);
export type OnboardingCaseStatus = z.infer<typeof onboardingCaseStatusSchema>;

export const onboardingFieldSchema = z.object({
  key: z.string().trim().min(1).max(120).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  label: shortText(160),
}).strict();
export type OnboardingField = z.infer<typeof onboardingFieldSchema>;

export const onboardingExtractionSchema = z.object({
  status: z.enum(["available", "unavailable"]),
  provider: z.enum(["local-text", "existing-document", "none"]),
  message: z.string().trim().min(1).max(500),
  truncated: z.boolean(),
}).strict();
export type OnboardingExtraction = z.infer<typeof onboardingExtractionSchema>;

export const onboardingFileProvenanceSchema = z.object({
  source: z.literal("upload"),
  storageBoundary: z.literal("saved_product_work"),
  storageKey: shortText(240),
  originalName: shortText(180),
  contentType: shortText(120),
  size: z.number().int().nonnegative().max(2_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  uploadedAt: z.string().datetime(),
}).strict();
export type OnboardingFileProvenance = z.infer<typeof onboardingFileProvenanceSchema>;

const uploadedDocumentReferenceSchema = z.object({
  workId: id,
  revision: z.number().int().nonnegative(),
  title: shortText(160),
  source: z.literal("upload").default("upload"),
  provenance: onboardingFileProvenanceSchema,
  extraction: onboardingExtractionSchema,
}).strict();

const savedDocumentReferenceSchema = z.object({
  workId: id,
  revision: z.number().int().nonnegative(),
  title: shortText(160),
  source: z.literal("saved_document"),
  provenance: z.null(),
  extraction: onboardingExtractionSchema,
}).strict();

export const onboardingDocumentReferenceSchema = z.union([
  uploadedDocumentReferenceSchema,
  savedDocumentReferenceSchema,
]);
export type OnboardingDocumentReference = z.infer<typeof onboardingDocumentReferenceSchema>;

export const onboardingRequirementSchema = z.object({
  id,
  key: z.string().trim().min(1).max(120).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  label: shortText(160),
  fields: z.array(onboardingFieldSchema).max(20),
  status: onboardingRequirementStatusSchema,
  document: onboardingDocumentReferenceSchema.nullable(),
  proposedData: fieldValues,
  reviewedData: fieldValues.nullable(),
  acceptedRevision: z.number().int().nonnegative().nullable(),
  acceptedAt: z.string().datetime().nullable(),
  stale: z.boolean().default(false),
}).strict();
export type OnboardingRequirement = z.infer<typeof onboardingRequirementSchema>;

export const onboardingHistoryEntrySchema = z.object({
  revision: z.number().int().positive(),
  kind: z.enum(["created", "assigned", "supplied", "reviewed", "correction_requested", "accepted"]),
  actorId: id,
  at: z.string().datetime(),
  requirementId: id.nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  note: z.string().trim().max(500).nullable(),
}).strict();
export type OnboardingHistoryEntry = z.infer<typeof onboardingHistoryEntrySchema>;

export const onboardingAssigneeSchema = z.object({
  userId: id.optional(),
  email: z.string().trim().toLowerCase().email().max(254),
}).strict();
export type OnboardingAssignee = z.infer<typeof onboardingAssigneeSchema>;

export const onboardingCaseSchema = z.object({
  version: z.literal(ONBOARDING_VERSION),
  revision: z.number().int().nonnegative(),
  title: shortText(160),
  subjectType: onboardingSubjectTypeSchema,
  subjectLabel: shortText(200),
  status: onboardingCaseStatusSchema,
  assignee: onboardingAssigneeSchema.nullable(),
  requirements: z.array(onboardingRequirementSchema).min(1).max(50),
  history: z.array(onboardingHistoryEntrySchema).max(500),
  createdBy: id,
  createdAt: z.string().datetime(),
}).strict();
export type OnboardingCase = z.infer<typeof onboardingCaseSchema>;

export const createOnboardingCaseInputSchema = z.object({
  workspaceId: id,
  title: shortText(160),
  subjectType: onboardingSubjectTypeSchema,
  subjectLabel: shortText(200),
  requirements: z.array(z.object({
    key: z.string().trim().min(1).max(120).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
    label: shortText(160),
    fields: z.array(onboardingFieldSchema).max(20).default([]),
  }).strict()).min(1).max(50),
}).strict();
export type CreateOnboardingCaseInput = z.infer<typeof createOnboardingCaseInputSchema>;

export const onboardingReviewValuesSchema = fieldValues;

export interface OnboardingCaseRecord {
  workId: string;
  workspaceId: string;
  case: OnboardingCase;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingDocumentRecord {
  workId: string;
  workspaceId: string;
  title: string;
  text: string;
  provenance: OnboardingFileProvenance;
  extraction: OnboardingExtraction;
}

export interface OnboardingAttachableDocument {
  workId: string;
  workspaceId: string;
  title: string;
  revision: number;
  updatedAt: string;
}
