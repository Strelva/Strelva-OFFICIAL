import { z } from "zod";

export const WEBSITE_VERSION = 1 as const;
export const WEBSITE_RENDERER_CONTRACT_VERSION = "v1" as const;
export const WEBSITE_PRODUCT_ID = "websites" as const;
export const WEBSITE_RESOURCE_KIND = "website" as const;

export const websiteLifecycleSchema = z.enum([
  "draft",
  "preview_ready",
  "approved",
  "launch_pending",
  "published",
  "failed",
]);
export type WebsiteLifecycle = z.infer<typeof websiteLifecycleSchema>;

const shortText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const contentHash = z.string().regex(/^[a-f0-9]{64}$/, "Expected a SHA-256 content hash");
const publicTenant = z.string().trim().regex(/^[a-z0-9-]+$/, "Expected a public tenant slug");
const publicCapabilityId = z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/, "Expected a published capability id");
const publicHttpUrl = z.string().trim().url().refine(value => /^https?:\/\//i.test(value), "Expected an HTTP(S) service URL");
const publicDateTime = z.string().datetime({ offset: true });

const websiteInquiryBindingSchema = z.object({
  capabilityId: publicCapabilityId,
  version: z.number().int().positive(),
}).strict();

const websiteBookingBindingSchema = z.object({
  capabilityId: publicCapabilityId,
  version: z.number().int().positive(),
  range: z.object({ from: publicDateTime, to: publicDateTime }).strict()
    .refine(value => Date.parse(value.to) > Date.parse(value.from), "Booking range must end after it starts"),
}).strict();

/**
 * Server-selected public capability projection for a generated client site.
 * The brief never carries these fields. The client receives no workspace,
 * provider, or grant identifier.
 */
export const websitePublishedCapabilitiesSchema = z.object({
  baseUrl: publicHttpUrl,
  tenant: publicTenant,
  inquiry: websiteInquiryBindingSchema.optional(),
  booking: websiteBookingBindingSchema.optional(),
}).strict().refine(value => Boolean(value.inquiry || value.booking), "At least one published capability is required");
export type WebsitePublishedCapabilities = z.infer<typeof websitePublishedCapabilitiesSchema>;

/**
 * A customer-selected connection for one saved website. These ids are only
 * references; the server rechecks them against the active native projections
 * before each generation. They never come from a brief or model result.
 */
export const websiteCapabilitySelectionSchema = z.object({
  tenantId: publicTenant,
  inquiryCapabilityId: publicCapabilityId.optional(),
  bookingGrantId: z.string().uuid().optional(),
}).strict().refine(value => Boolean(value.inquiryCapabilityId || value.bookingGrantId), "Choose an inquiry or booking capability");
export type WebsiteCapabilitySelection = z.infer<typeof websiteCapabilitySelectionSchema>;

const websiteInquiryOptionSchema = z.object({
  capabilityId: publicCapabilityId,
  version: z.number().int().positive(),
  name: shortText(160),
}).strict();

const websiteBookingOptionSchema = z.object({
  grantId: z.string().uuid(),
  capabilityId: publicCapabilityId,
  version: z.number().int().positive(),
  name: shortText(160),
  provider: z.enum(["outlook", "google"]),
  range: z.object({ from: publicDateTime, to: publicDateTime }).strict(),
}).strict();

export const websiteCapabilityOptionsSchema = z.object({
  tenants: z.array(z.object({
    tenantId: publicTenant,
    siteName: shortText(160),
    inquiry: z.array(websiteInquiryOptionSchema),
    booking: z.array(websiteBookingOptionSchema),
  }).strict()),
}).strict();
export type WebsiteCapabilityOptions = z.infer<typeof websiteCapabilityOptionsSchema>;

export const websiteBriefSchema = z.object({
  businessName: shortText(160),
  description: shortText(4_000),
  audience: shortText(1_000).optional(),
  primaryGoal: shortText(1_000).optional(),
  primaryCallToAction: shortText(300).default("Contact us"),
  contactEmail: z.string().trim().toLowerCase().email().max(254).optional(),
  notes: optionalText(4_000),
}).strict();
export type WebsiteBrief = z.infer<typeof websiteBriefSchema>;

/**
 * Provider-owned structured site data. These fields deliberately retain the
 * native ContentMap and SitePageConfig projections used by the existing
 * renderer, so preview/export do not convert through a second website model.
 */
export const websiteSpecSchema = z.object({
  version: z.literal(1),
  siteName: shortText(160),
  content: z.record(z.string(), z.unknown()),
  pages: z.record(z.string(), z.unknown()),
  theme: z.record(z.string(), z.unknown()),
  publishedCapabilities: websitePublishedCapabilitiesSchema.optional(),
}).strict().superRefine((value, ctx) => {
  const keys = Object.keys(value.pages);
  if (!keys.some(key => key === "home" || key === "/")) {
    ctx.addIssue({ code: "custom", path: ["pages"], message: "Website specs must include a home page" });
  }
  for (const key of keys) {
    const normalized = key === "/" ? "home" : key.replace(/^\/+/, "");
    if (!normalized || !/^[a-zA-Z0-9_-]+$/.test(normalized)) {
      ctx.addIssue({ code: "custom", path: ["pages", key], message: "Website page keys must be safe path segments" });
    }
  }
});
export type WebsiteSpec = z.infer<typeof websiteSpecSchema>;

export const websitePreviewSchema = z.object({
  href: z.string().trim().min(1).max(2_048).refine(value => (/^\/(?!\/)/.test(value)) || /^https:\/\//i.test(value), "Preview must be an internal path or HTTPS URL"),
  revision: z.number().int().positive(),
  contentHash,
}).strict();
export type WebsitePreview = z.infer<typeof websitePreviewSchema>;

export const websiteArtifactSchema = z.object({
  kind: z.literal("website_candidate"),
  revision: z.number().int().positive(),
  spec: websiteSpecSchema,
  contentHash,
  rendererDigest: contentHash,
  artifactDigest: contentHash,
  preview: websitePreviewSchema,
  generatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((value, ctx) => {
  if (value.preview.revision !== value.revision) ctx.addIssue({ code: "custom", path: ["preview", "revision"], message: "Preview must use the candidate revision" });
  if (value.preview.contentHash !== value.contentHash) ctx.addIssue({ code: "custom", path: ["preview", "contentHash"], message: "Preview must use the candidate content hash" });
});
export type WebsiteArtifact = z.infer<typeof websiteArtifactSchema>;

export const websiteLaunchReceiptSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("pending"),
    receiptId: shortText(256),
    provider: shortText(120),
    // External adapters return HTTPS URLs. The local adapter returns the
    // private, server-owned export path for this exact candidate.
    providerUrl: z.string().trim().max(2_048).refine(value => (/^\/(?!\/)/.test(value)) || /^https:\/\//i.test(value), "Expected a server-owned path or HTTPS provider URL"),
    evidence: shortText(1_000),
    artifactHash: contentHash,
    candidateRevision: z.number().int().positive(),
    preparedAt: z.string().datetime({ offset: true }),
  }).strict(),
  z.object({
    status: z.literal("published"),
    receiptId: shortText(256),
    provider: shortText(120),
    providerUrl: z.string().trim().url().max(2_048),
    evidence: shortText(1_000),
    artifactHash: contentHash,
    candidateRevision: z.number().int().positive(),
    publishedAt: z.string().datetime({ offset: true }),
  }).strict(),
]);
export type WebsiteLaunchReceipt = z.infer<typeof websiteLaunchReceiptSchema>;

export const websiteLaunchSchema = z.object({
  status: z.enum(["not_requested", "pending", "published", "failed"]),
  candidateRevision: z.number().int().positive().nullable(),
  receipt: websiteLaunchReceiptSchema.nullable(),
  failure: z.string().trim().max(1_000).nullable(),
}).strict();
export type WebsiteLaunch = z.infer<typeof websiteLaunchSchema>;

export const websiteHistoryEntrySchema = z.object({
  revision: z.number().int().positive(),
  kind: z.enum(["created", "revised", "candidate_generated", "candidate_failed", "approved", "launch_started", "launch_prepared", "launch_confirmed", "launch_failed"]),
  actorId: z.string().min(1),
  at: z.string().datetime({ offset: true }),
  candidateRevision: z.number().int().positive().nullable(),
  note: z.string().trim().max(1_000).nullable(),
}).strict();
export type WebsiteHistoryEntry = z.infer<typeof websiteHistoryEntrySchema>;

export const websiteErrorSchema = z.object({
  stage: z.enum(["artifact", "launch"]),
  message: shortText(1_000),
  at: z.string().datetime({ offset: true }),
}).strict();
export type WebsiteError = z.infer<typeof websiteErrorSchema>;

export const websiteSchema = z.object({
  version: z.literal(WEBSITE_VERSION),
  revision: z.number().int().nonnegative(),
  title: shortText(160),
  brief: websiteBriefSchema,
  publishedCapabilitySelection: websiteCapabilitySelectionSchema.optional(),
  status: websiteLifecycleSchema,
  candidate: websiteArtifactSchema.nullable(),
  approvedCandidateRevision: z.number().int().positive().nullable(),
  launch: websiteLaunchSchema,
  lastError: websiteErrorSchema.nullable(),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  history: z.array(websiteHistoryEntrySchema).max(500),
}).strict();
export type Website = z.infer<typeof websiteSchema>;

const requestId = z.string().trim().min(8).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);

export const createWebsiteInputSchema = z.object({
  requestId,
  brief: websiteBriefSchema,
}).strict();
export type CreateWebsiteInput = z.infer<typeof createWebsiteInputSchema>;

export const reviseWebsiteInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  brief: websiteBriefSchema,
}).strict();
export type ReviseWebsiteInput = z.infer<typeof reviseWebsiteInputSchema>;

export const approveWebsiteInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  candidateRevision: z.number().int().positive(),
  candidateContentHash: contentHash,
}).strict();
export type ApproveWebsiteInput = z.infer<typeof approveWebsiteInputSchema>;

export const prepareWebsiteLaunchInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  candidateRevision: z.number().int().positive(),
  candidateContentHash: contentHash,
}).strict();
export type PrepareWebsiteLaunchInput = z.infer<typeof prepareWebsiteLaunchInputSchema>;

export const connectWebsiteCapabilitiesInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  selection: websiteCapabilitySelectionSchema.nullable(),
}).strict();
export type ConnectWebsiteCapabilitiesInput = z.infer<typeof connectWebsiteCapabilitiesInputSchema>;

export interface WebsiteRecord {
  workId: string;
  workspaceId: string;
  website: Website;
  createdAt: string;
  updatedAt: string;
}
