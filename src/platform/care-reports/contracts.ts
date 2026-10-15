import { z } from "zod";
import { BUSINESS_EFFORT_CATEGORIES } from "@/platform/business-effort/types";

/**
 * Care plan reports contracts. Browser-safe: zod only. The facts mirror
 * care_report_facts in 20261028100400_care_reports.sql key for key.
 */

export const CARE_CHECKS = ["confirmed", "not_confirmed", "not_checked"] as const;
export type CareCheck = (typeof CARE_CHECKS)[number];
export const CARE_SOURCES = ["website_deploy", "website_document", "website_content", "website_restore", "website_code", "system"] as const;
export type CareSource = (typeof CARE_SOURCES)[number];

const uuid = z.string().uuid();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const count = z.number().int().nonnegative();

export const careReportChangeSchema = z.object({
  systemId: uuid,
  systemName: z.string(),
  systemKind: z.string(),
  release: z.number().int().positive(),
  summary: z.string().nullable(),
  at: z.string(),
  check: z.enum(CARE_CHECKS),
  source: z.enum(CARE_SOURCES),
}).strict();
export type CareReportChange = z.infer<typeof careReportChangeSchema>;

export const CARE_REQUEST_KINDS = ["delivery", "website_change"] as const;
export const careReportRequestSchema = z.object({
  id: uuid,
  request: z.string(),
  doneAt: z.string(),
  kind: z.enum(CARE_REQUEST_KINDS),
}).strict();
export type CareReportRequest = z.infer<typeof careReportRequestSchema>;

export const SITE_CHECK_STATES = ["up", "down", "parked", "unreachable", "unknown"] as const;
export const careSiteCheckSchema = z.object({
  host: z.string().min(1).max(253),
  state: z.enum(SITE_CHECK_STATES),
  checkedAt: z.string(),
}).strict();
export type CareSiteCheck = z.infer<typeof careSiteCheckSchema>;
/** Site checks a caller read from its stored domain snapshot, by business workspace id. */
export type CareReportSiteChecks = Record<string, CareSiteCheck[]>;

export const careReportOutcomesSchema = z.discriminatedUnion("available", [
  z.object({ available: z.literal(true), month: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ available: z.literal(false), reason: z.enum(["no_member", "read_failed"]) }).strict(),
]);

export const careReportFactsSchema = z.object({
  version: z.literal(1),
  month,
  from: z.string(),
  through: z.string(),
  generatedAt: z.string(),
  business: z.object({ workspaceId: uuid, name: z.string() }).strict(),
  agency: z.object({ workspaceId: uuid, name: z.string() }).strict(),
  changes: z.object({ total: count, confirmed: count, notConfirmed: count, notChecked: count, items: z.array(careReportChangeSchema).max(100) }).strict(),
  requests: z.object({ doneCount: count, openCount: count, askedCount: count, done: z.array(careReportRequestSchema).max(50) }).strict(),
  outcomes: careReportOutcomesSchema,
  siteChecks: z.object({
    hosted: z.object({ checks: count, healthy: count, lastCheckedAt: z.string().nullable() }).strict(),
    readBacks: z.object({ confirmed: count, notConfirmed: count, notChecked: count }).strict(),
    latest: z.array(careSiteCheckSchema).max(10),
  }).strict(),
  usage: z.object({ calls: count, byPurpose: z.record(z.string(), count) }).strict(),
  time: z.object({ minutes: count, entries: count, byCategory: z.record(z.string(), count) }).strict(),
}).strict();
export type CareReportFacts = z.infer<typeof careReportFactsSchema>;

export const careReportReleaseSnapshotSchema = careReportFactsSchema.extend({
  agencyNote: z.string().nullable(),
  release: z.number().int().positive(),
  publishedAt: z.string(),
}).strict();
export type CareReportReleaseSnapshot = z.infer<typeof careReportReleaseSnapshotSchema>;

// Responses (CR2 D).
const deliveryStatus = z.enum(["reserved", "accepted", "suppressed", "unknown"]);

export const careReportListSchema = z.object({
  agencyWorkspaceId: uuid,
  month,
  canGenerate: z.boolean(),
  clients: z.array(z.object({
    workspaceId: uuid,
    name: z.string(),
    canWrite: z.boolean(),
    tenantIds: z.array(z.string()),
    report: z.object({
      id: uuid,
      revision: z.number().int().positive(),
      generatedAt: z.string(),
      latestRelease: z.object({ number: z.number().int().positive(), publishedAt: z.string() }).strict().nullable(),
      lastDelivery: z.object({ status: deliveryStatus, reason: z.string().nullable(), recordedAt: z.string() }).strict().nullable(),
    }).strict().nullable(),
    soFar: z.object({ releasesRecorded: count, changesVerified: count }).strict(),
  }).strict()),
}).strict();
export type CareReportList = z.infer<typeof careReportListSchema>;
/** What GET /api/workspace/care-reports returns: the list plus which switches are on. */
export const careReportListResponseSchema = careReportListSchema.extend({ emailOn: z.boolean(), shareLinksOn: z.boolean() });

const releaseRow = z.object({ id: uuid, number: z.number().int().positive(), publishedAt: z.string(), snapshot: z.record(z.string(), z.unknown()) }).strict();

export const careReportAgencyViewSchema = z.object({
  audience: z.literal("agency"),
  canWrite: z.boolean(),
  report: z.object({
    id: uuid, agencyWorkspaceId: uuid, businessWorkspaceId: uuid, businessName: z.string(), month,
    revision: z.number().int().positive(), draft: z.record(z.string(), z.unknown()), agencyNote: z.string().nullable(),
    generatedAt: z.string(), updatedAt: z.string(),
  }).strict(),
  releases: z.array(releaseRow).max(24),
  deliveries: z.array(z.object({ releaseNumber: z.number().int().positive(), status: deliveryStatus, reason: z.string().nullable(), recordedAt: z.string() }).strict()).max(24),
  shareLink: z.object({ createdAt: z.string() }).strict().nullable(),
}).strict();
export type CareReportAgencyView = z.infer<typeof careReportAgencyViewSchema>;
/** What GET /api/workspace/care-reports/<id> returns for an agency: the view plus which switches are on. */
export const careReportAgencyViewResponseSchema = careReportAgencyViewSchema.extend({ emailOn: z.boolean(), shareLinksOn: z.boolean() });

export const careReportOwnerViewSchema = z.object({
  audience: z.literal("owner"),
  report: z.object({ id: uuid, agencyWorkspaceId: uuid, businessWorkspaceId: uuid, businessName: z.string(), month }).strict(),
  releases: z.array(releaseRow).min(1).max(24),
}).strict();
export type CareReportOwnerView = z.infer<typeof careReportOwnerViewSchema>;

export const careReportViewSchema = z.discriminatedUnion("audience", [careReportAgencyViewSchema, careReportOwnerViewSchema]);
export type CareReportView = z.infer<typeof careReportViewSchema>;

export const careReportSharedSchema = z.object({
  agencyWorkspaceId: uuid,
  businessName: z.string(),
  month,
  releases: z.array(z.object({ number: z.number().int().positive(), publishedAt: z.string() }).strict()),
  release: z.object({ number: z.number().int().positive(), publishedAt: z.string(), snapshot: z.record(z.string(), z.unknown()) }).strict(),
}).strict().nullable();
export type CareReportShared = z.infer<typeof careReportSharedSchema>;

export const ownerCareReportListSchema = z.array(z.object({
  reportId: uuid,
  agencyWorkspaceId: uuid,
  agencyName: z.string(),
  month,
  latestRelease: z.object({ number: z.number().int().positive(), publishedAt: z.string() }).strict(),
}).strict());
export type OwnerCareReportList = z.infer<typeof ownerCareReportListSchema>;
export type OwnerCareReportItem = OwnerCareReportList[number];

export const agencyTimeEntrySchema = z.object({
  id: uuid,
  minutes: z.number().int().min(1).max(1440),
  category: z.enum(BUSINESS_EFFORT_CATEGORIES),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().nullable(),
  recordedAt: z.string(),
}).strict();
export type AgencyTimeEntry = z.infer<typeof agencyTimeEntrySchema>;

export const agencyTimeListSchema = z.array(z.object({
  id: uuid,
  minutes: z.number().int().min(1).max(1440),
  category: z.enum(BUSINESS_EFFORT_CATEGORIES),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().nullable(),
  recordedBy: z.string(),
  recordedAt: z.string(),
  voided: z.boolean(),
}).strict());
export type AgencyTimeList = z.infer<typeof agencyTimeListSchema>;

export const generateResultSchema = z.object({
  reports: z.array(z.object({ reportId: uuid, workspaceId: uuid, revision: z.number().int().positive() }).strict()),
  skipped: z.array(z.object({ workspaceId: uuid, reason: z.enum(["not_allowed", "failed"]) }).strict()),
}).strict();
export type GenerateResult = z.infer<typeof generateResultSchema>;

// Commands.
export const generateCommandSchema = z.object({
  agencyWorkspaceId: uuid,
  month,
  workspaceIds: z.array(uuid).min(1).max(200).optional(),
}).strict();
export type GenerateCommand = z.infer<typeof generateCommandSchema>;

export const noteCommandSchema = z.object({ action: z.literal("note"), note: z.string().max(2000), expectedRevision: z.number().int().positive() }).strict();
export const publishCommandSchema = z.object({ action: z.literal("publish"), expectedRevision: z.number().int().positive() }).strict();
export const shareCommandSchema = z.object({ action: z.literal("share_link") }).strict();
export const revokeCommandSchema = z.object({ action: z.literal("revoke_link") }).strict();
export const sendCommandSchema = z.object({ action: z.literal("send"), release: z.number().int().positive() }).strict();
export const reportActionSchema = z.discriminatedUnion("action", [noteCommandSchema, publishCommandSchema, shareCommandSchema, revokeCommandSchema, sendCommandSchema]);
export type ReportAction = z.infer<typeof reportActionSchema>;

export const timeEntryCommandSchema = z.object({
  agencyWorkspaceId: uuid,
  workspaceId: uuid,
  id: uuid,
  minutes: z.number().int().min(1).max(1440),
  category: z.enum(BUSINESS_EFFORT_CATEGORIES),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().min(1).max(280).optional(),
}).strict();
export type TimeEntryCommand = z.infer<typeof timeEntryCommandSchema>;

export const voidTimeCommandSchema = z.object({ agencyWorkspaceId: uuid, id: uuid, reason: z.string().min(1).max(280) }).strict();
export type VoidTimeCommand = z.infer<typeof voidTimeCommandSchema>;
