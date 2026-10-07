import { z } from "zod";

/**
 * The Google listing System: "The Mooney Firm on Google". Reviews, replies,
 * hours, info and posts, each outside write through approval with a receipt.
 * Spec: docs/capabilities/publishing/publishing-spec-2026-10-06.md.
 *
 * Receipts mirror public.google_listing_receipts
 * (supabase/migrations/20261007170000_workspace_account_bindings.sql).
 */

export const LISTING_ACTIONS = [
  "reply_post", "reply_update", "reply_delete", "hours_patch", "info_patch", "post_create", "post_delete",
] as const;
export type ListingAction = (typeof LISTING_ACTIONS)[number];

/** Receipt states. `posted_unverified` and `held_by_google` mean Google took
 * the write: approval is done and the write is never retried. */
export const RECEIPT_STATUSES = ["posting", "posted", "posted_unverified", "held_by_google", "failed", "undone"] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

/** Draft output states for a reply, post or info change, end to end. The
 * first four live with the approval (today the Redis event); the rest are
 * receipts. */
export const DRAFT_OUTPUT_STATES = [
  "drafted", "needs_you", "approved", "declined", "posting", "posted", "posted_unverified", "failed", "withdrawn",
] as const;
export type DraftOutputState = (typeof DRAFT_OUTPUT_STATES)[number];

/** Who or what allowed a write. Holding the Google token is never one of these. */
export const authoritySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("owner_approval"), actor: z.string().min(1).max(200), approvalRef: z.string().max(200).optional() }).strict(),
  z.object({ kind: z.literal("operator_instruction"), actor: z.string().min(1).max(200), instructionRef: z.string().min(1).max(200) }).strict(),
  /** Only a review reply to a 3-star or better review, in `auto` mode. */
  z.object({ kind: z.literal("auto_reply_policy"), rating: z.number().int().min(3).max(5) }).strict(),
  z.object({ kind: z.literal("owner_undo"), actor: z.string().min(1).max(200) }).strict(),
  z.object({ kind: z.literal("operator_undo"), actor: z.string().min(1).max(200) }).strict(),
]);
export type ListingAuthority = z.infer<typeof authoritySchema>;

export type UndoDescriptor =
  | { kind: "delete_reply"; reviewId: string }
  | { kind: "restore_reply"; reviewId: string; previous: string }
  | { kind: "delete_post"; postName: string }
  | { kind: "patch_snapshot"; updateMask: string[]; snapshot: Record<string, unknown> };

export type Readback = "matched" | "differs" | "failed" | "held_by_google";

export interface ListingReceipt {
  id: string;
  workspaceId: string;
  bindingId: string | null;
  locationId: string;
  action: ListingAction;
  targetRef: string | null;
  status: ReceiptStatus;
  authority: ListingAuthority;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  readback: Readback | null;
  providerRef: string | null;
  undo: UndoDescriptor | null;
  undoesReceiptId: string | null;
  undoneByReceiptId: string | null;
  idempotencyKey: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

/** Health is separate from lifecycle (spec section 4). */
export const LISTING_HEALTH = [
  "ok", "google_disconnected", "scope_missing", "api_access_pending", "edits_pending", "profile_suspended", "stale",
] as const;
export type ListingHealth = (typeof LISTING_HEALTH)[number];

export const REVIEW_REPLY_MAX_BYTES = 4096;
export const POST_SUMMARY_MAX_CHARS = 1500;

export const postInputSchema = z.object({
  topicType: z.enum(["STANDARD", "EVENT", "OFFER"]),
  summary: z.string().trim().min(1).max(POST_SUMMARY_MAX_CHARS),
  callToAction: z.object({
    actionType: z.enum(["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"]),
    url: z.string().url().optional(),
  }).strict().optional(),
  event: z.object({
    title: z.string().trim().min(1).max(58),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict().optional(),
  offer: z.object({
    couponCode: z.string().max(58).optional(),
    redeemOnlineUrl: z.string().url().optional(),
    termsConditions: z.string().max(5000).optional(),
  }).strict().optional(),
}).strict().superRefine((post, context) => {
  if (post.topicType !== "STANDARD" && !post.event) context.addIssue({ code: "custom", path: ["event"], message: "Events and offers need a title and dates" });
  if (post.topicType !== "OFFER" && post.offer) context.addIssue({ code: "custom", path: ["offer"], message: "Only an offer carries offer details" });
  if (post.callToAction && post.callToAction.actionType !== "CALL" && !post.callToAction.url) {
    context.addIssue({ code: "custom", path: ["callToAction", "url"], message: "This button needs a link" });
  }
});
export type ListingPostInput = z.infer<typeof postInputSchema>;

/** Google's own hours shape (Business Information v1). */
export interface GoogleTimeOfDay { hours?: number; minutes?: number }
export type GoogleDay = "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY";
export interface GoogleTimePeriod { openDay: GoogleDay; openTime: GoogleTimeOfDay; closeDay: GoogleDay; closeTime: GoogleTimeOfDay }
export interface GoogleDate { year: number; month: number; day: number }
export interface GoogleSpecialPeriod { startDate: GoogleDate; endDate?: GoogleDate; openTime?: GoogleTimeOfDay; closeTime?: GoogleTimeOfDay; closed?: boolean }
export interface GoogleHours {
  regularHours?: { periods: GoogleTimePeriod[] };
  specialHours?: { specialHourPeriods: GoogleSpecialPeriod[] };
}
export interface GoogleInfo {
  phoneNumbers?: { primaryPhone?: string };
  websiteUri?: string;
  profile?: { description?: string };
}

export const listingControlSchema = z.object({
  workspaceId: z.string().uuid(), locationId: z.string(), paused: z.boolean(), accessPending: z.boolean(), updatedAt: z.string().nullable(),
});
export type ListingControl = z.infer<typeof listingControlSchema>;

export const googleDraftInputSchema = z.object({ workspaceId: z.string().uuid(), tenantId: z.string().min(1).max(120), locationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), kind: z.enum(["hours", "info", "post"]), post: postInputSchema.optional(), commandId: z.string().uuid().optional(), expectedRecordRevision: z.number().int().nonnegative().optional() }).strict();
