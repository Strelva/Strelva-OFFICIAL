import { z } from "zod";
import { siteDocumentSchema } from "./site-document-schema";
import { websiteLaunchReceiptSchema, websiteCapabilitySelectionSchema } from "./contracts";
import { rebuildAuditSchema, rebuildAuditSnapshotSchema } from "./rebuild-audit-contracts";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().datetime({ offset: true });
const requestId = z.string().trim().min(8).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
export const rebuildInputSchema = z.union([
  z.object({ requestId, url: z.string().trim().min(1).max(2048) }).strict(),
  z.object({ requestId, description: z.string().trim().min(1).max(4000), businessName: z.string().trim().min(1).max(160) }).strict(),
]);
export type RebuildInput = z.infer<typeof rebuildInputSchema>;
export const rebuildSelectionSchema = z.object({
  expectedRevision: z.number().int().nonnegative(), candidateRevision: z.number().int().positive(), candidateContentHash: hash,
}).strict();
export const rebuildFactInputSchema = rebuildSelectionSchema.extend({
  action: z.enum(["confirm", "edit", "remove"]), text: z.string().trim().min(1).max(500).optional(),
}).refine(value => value.action !== "edit" || Boolean(value.text), "Supply the corrected fact text");
export const rebuildStageSchema = z.object({
  stage: z.string().min(1).max(80), status: z.enum(["pending", "running", "completed", "failed"]), message: z.string().max(1000), at: instant,
}).strict();
export const rebuildSkippedPathSchema = z.object({
  url: z.string().url().max(2048), reason: z.enum(["robots", "external", "limit", "unreachable", "javascript_only", "not_html"]),
}).strict();
export const websiteRebuildSchema = z.object({
  version: z.literal(2), revision: z.number().int().nonnegative(), title: z.string().trim().min(1).max(160), input: rebuildInputSchema,
  status: z.enum(["building", "review_ready", "approved", "published", "failed"]), stages: z.array(rebuildStageSchema).max(100),
  checkpoint: z.unknown().nullable(),
  sourceAudit: rebuildAuditSnapshotSchema.nullable().default(null),
  audit: rebuildAuditSchema.nullable().default(null),
  pageMapping: z.array(z.object({ sourceUrl: z.string().url(), targetPath: z.string(), carriedOver: z.boolean() }).strict()).max(25).default([]),
  skippedPaths: z.array(rebuildSkippedPathSchema).max(200).default([]),
  candidate: z.object({ revision: z.number().int().positive(), contentHash: hash, document: siteDocumentSchema, previewHref: z.string().startsWith("/api/websites/") }).strict().nullable(),
  approvedCandidateRevision: z.number().int().positive().nullable(), tenantId: z.string().regex(/^[a-z0-9-]+$/).nullable(),
  publishedCapabilitySelection: websiteCapabilitySelectionSchema.optional(),
  launch: z.object({ receipt: websiteLaunchReceiptSchema.nullable(), readBack: z.object({ status: z.enum(["verified", "failed", "pending"]), checkedAt: instant, message: z.string().max(1000) }).strict().nullable() }).strict(),
  lastError: z.string().max(1000).nullable(), createdBy: z.string().min(1), createdAt: instant,
  history: z.array(z.object({ revision: z.number().int().positive(), kind: z.string().min(1).max(80), actorId: z.string().min(1), at: instant }).strict()).max(500),
}).strict();
export type WebsiteRebuild = z.infer<typeof websiteRebuildSchema>;
export interface WebsiteRebuildRecord { workId: string; workspaceId: string; rebuild: WebsiteRebuild }
export interface WebsiteDomainView { hostname: string; status: string; checkedAt: string; records: Array<{ type: string; name: string; value: string }>; error?: string }
