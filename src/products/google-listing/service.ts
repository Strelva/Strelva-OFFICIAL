import { createHash } from "node:crypto";
import type { FactValues } from "@/platform/business-record/contracts";
import type { SystemLifecycle } from "@/platform/systems/contracts";
import { autoReplyAllowed } from "@/lib/reviews/auto-reply-rule";
import type { GoogleListingClient, GoogleLocationRef, GoogleLocationState, GoogleResult, GoogleReview } from "./client";
import {
  authoritySchema,
  postInputSchema,
  REVIEW_REPLY_MAX_BYTES,
  type GoogleHours,
  type GoogleInfo,
  type ListingAction,
  type ListingAuthority,
  type ListingPostInput,
  type ListingReceipt,
  type UndoDescriptor,
} from "./contracts";
import { authorityAllowedFor, type ListingReceiptStore } from "./receipts";
import { hoursMatch, hoursToGoogle, infoMatches, infoToGoogle, type RecordInfo } from "./record";

/**
 * Every outside write the Google listing System makes. Each one:
 *   1. refuses while the listing is Paused (reviews still sync, nothing posts);
 *   2. needs an authority (owner approval, a recorded operator instruction,
 *      or the auto-reply policy for a 3+ star reply). The Google token is
 *      never authority;
 *   3. reads Google's current state first, as the undo snapshot;
 *   4. records a receipt before calling Google, keyed so a replay never
 *      writes twice;
 *   5. writes once, reads back, and settles: posted, posted_unverified
 *      ("Posted. Google hasn't shown it yet.") or held_by_google ("Google is
 *      reviewing this change."). A write Google took is never retried.
 * Undo is its own governed write: deleteReply or updateReply with the prior
 * text, delete for a post, and a patch from the snapshot for hours and info.
 */

export interface ListingContext {
  workspaceId: string;
  bindingId: string | null;
  location: GoogleLocationRef;
  lifecycle: SystemLifecycle;
  client: GoogleListingClient;
  receipts: ListingReceiptStore;
  /** SSRF guard for URLs Google will fetch. Defaults to the audit check. */
  checkUrl?: (url: string) => Promise<void>;
}

export type ListingWriteOutcome =
  | { status: "posted" | "posted_unverified" | "held_by_google"; receipt: ListingReceipt; message: string }
  | { status: "failed"; receipt: ListingReceipt; message: string; accessPending: boolean }
  | { status: "refused"; reason: ListingRefusal; message: string };

export type ListingRefusal = "paused" | "authority" | "invalid" | "snapshot_unavailable" | "not_undoable" | "unsafe_url" | "nothing_to_change";

const MESSAGES = {
  paused: "The Google listing is paused, so Strelva isn't changing it.",
  authority: "This change needs the owner's approval.",
  invalid: "That change can't be sent to Google as written.",
  snapshot_unavailable: "Strelva couldn't read Google's current listing, so nothing was changed.",
  not_undoable: "This change can't be undone.",
  unsafe_url: "That link can't be used on Google.",
  nothing_to_change: "Google already matches.",
} satisfies Record<ListingRefusal, string>;

function refused(reason: ListingRefusal): ListingWriteOutcome {
  return { status: "refused", reason, message: MESSAGES[reason] };
}

function key(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 40);
}

const normalize = (text: string | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

/** Whose call a new review's reply is. 1 and 2 stars always reach the owner. */
export function routeReviewReply(mode: "off" | "approve" | "auto", rating: number | null | undefined): "none" | "owner" | "auto" {
  if (mode === "off") return "none";
  if (mode === "auto" && autoReplyAllowed(rating)) return "auto";
  return "owner";
}

/** The customer-facing line for a receipt. Strelva acts; no AI words. */
export function receiptHeadline(receipt: Pick<ListingReceipt, "status" | "action"> & { error?: string | null }, subject?: string): string {
  const who = subject ? `${subject}'s review` : "a review";
  if (receipt.status === "failed" && receipt.error?.startsWith("Google API access is still pending")) {
    return "Waiting for Google to approve access. Nothing was sent yet.";
  }
  if (receipt.status === "failed") return "Google didn't take this change. Nothing changed on Google.";
  if (receipt.status === "undone") return "Strelva undid this change on Google.";
  if (receipt.status === "posted_unverified") return "Posted. Google hasn't shown it yet.";
  if (receipt.status === "held_by_google") return "Google is reviewing this change.";
  if (receipt.status === "posting") return "Sending to Google.";
  switch (receipt.action) {
    case "reply_post": return `Strelva replied to ${who} on Google.`;
    case "reply_update": return `Strelva updated the reply to ${who} on Google.`;
    case "reply_delete": return `Strelva removed the reply to ${who} on Google.`;
    case "hours_patch": return "Strelva updated your hours on Google.";
    case "info_patch": return "Strelva updated your business info on Google.";
    case "post_create": return "Strelva posted to your Google listing.";
    case "post_delete": return "Strelva removed a post from your Google listing.";
  }
}

interface WritePlan<T> {
  action: ListingAction;
  targetRef: string | null;
  authority: ListingAuthority;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  undoesReceiptId?: string;
  idempotencyKey?: string;
  write(): Promise<GoogleResult<T>>;
  /** Read Google back after the write. */
  verify(written: T): Promise<{ readback: "matched" | "differs" | "failed" | "held_by_google"; after?: Record<string, unknown> }>;
  providerRef?(written: T): string | null;
  undo(written: T): UndoDescriptor | null;
}

async function governedWrite<T>(ctx: ListingContext, plan: WritePlan<T>): Promise<ListingWriteOutcome> {
  const parsed = authoritySchema.safeParse(plan.authority);
  if (!parsed.success || !authorityAllowedFor(plan.action, parsed.data)) return refused("authority");
  const undoKinds = parsed.data.kind === "owner_undo" || parsed.data.kind === "operator_undo";
  if (undoKinds !== Boolean(plan.undoesReceiptId)) return refused("authority");
  const idempotencyKey = plan.idempotencyKey ?? `${plan.action}:${key([plan.targetRef, plan.after, plan.undoesReceiptId ?? null, ctx.location.locationId])}`;
  const { receipt, replayed } = await ctx.receipts.record({
    workspaceId: ctx.workspaceId, bindingId: ctx.bindingId, locationId: ctx.location.locationId, action: plan.action,
    targetRef: plan.targetRef, authority: parsed.data, before: plan.before, after: plan.after,
    undoesReceiptId: plan.undoesReceiptId ?? null, idempotencyKey,
  });
  if (replayed && receipt.status !== "posting") {
    // Already decided. Never a second write.
    return receipt.status === "failed"
      ? { status: "failed", receipt, message: receiptHeadline(receipt), accessPending: false }
      : { status: receipt.status === "undone" ? "posted" : receipt.status as "posted" | "posted_unverified" | "held_by_google", receipt, message: receiptHeadline(receipt) };
  }
  if (replayed) {
    // An earlier attempt stopped mid-way. Google may or may not have it; we
    // never send it again. Record what is known and let a person decide.
    const settled = await ctx.receipts.settle(receipt.id, ctx.workspaceId, {
      status: "failed", error: "An earlier attempt did not finish. Nothing was sent again; check Google before retrying.",
    });
    return { status: "failed", receipt: settled, message: receiptHeadline(settled), accessPending: false };
  }

  const written = await plan.write();
  if (!written.ok) {
    const accessPending = written.kind === "setup_pending";
    const settled = await ctx.receipts.settle(receipt.id, ctx.workspaceId, {
      status: "failed",
      error: accessPending ? "Google API access is still pending." : `Google said ${written.status || "no"}: ${written.detail.slice(0, 200)}`,
      undo: null,
    });
    return {
      status: "failed", receipt: settled, accessPending,
      message: accessPending ? "Google access is still being set up. This will go out once Google approves." : receiptHeadline(settled),
    };
  }

  // Google took it. From here the approval is done and nothing is retried.
  let readback: Awaited<ReturnType<WritePlan<T>["verify"]>>;
  try {
    readback = await plan.verify(written.data);
  } catch {
    readback = { readback: "failed" };
  }
  const status = readback.readback === "matched" ? "posted" : readback.readback === "held_by_google" ? "held_by_google" : "posted_unverified";
  const settled = await ctx.receipts.settle(receipt.id, ctx.workspaceId, {
    status, readback: readback.readback, after: readback.after ?? plan.after,
    providerRef: plan.providerRef?.(written.data) ?? null, undo: plan.undo(written.data),
  });
  return { status, receipt: settled, message: receiptHeadline(settled) };
}

function checkRefusal(ctx: ListingContext): ListingWriteOutcome | null {
  return ctx.lifecycle === "paused" ? refused("paused") : null;
}

async function readReview(ctx: ListingContext, reviewId: string): Promise<GoogleReview | null> {
  const result = await ctx.client.getReview(ctx.location, reviewId);
  return result.ok ? result.data : null;
}

// ---- review replies ----

export async function postReviewReply(ctx: ListingContext, input: {
  reviewId: string; text: string; authority: ListingAuthority; idempotencyKey?: string;
}): Promise<ListingWriteOutcome> {
  const paused = checkRefusal(ctx);
  if (paused) return paused;
  const text = input.text.trim();
  if (!text || Buffer.byteLength(text, "utf8") > REVIEW_REPLY_MAX_BYTES || !/^[A-Za-z0-9_-]{1,300}$/.test(input.reviewId)) return refused("invalid");
  const review = await readReview(ctx, input.reviewId);
  if (!review) return refused("snapshot_unavailable");
  const previous = review.reviewReply?.comment ?? null;
  if (previous !== null && normalize(previous) === normalize(text)) return refused("nothing_to_change");
  const action: ListingAction = previous === null ? "reply_post" : "reply_update";
  // The policy covers a first reply to a 3+ star review, nothing else.
  if (input.authority.kind === "auto_reply_policy") {
    const rating = review.starRating ? { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[review.starRating as "ONE"] : undefined;
    if (action !== "reply_post" || !autoReplyAllowed(rating) || rating !== input.authority.rating) return refused("authority");
  }
  return governedWrite(ctx, {
    action, targetRef: input.reviewId, authority: input.authority, idempotencyKey: input.idempotencyKey,
    before: { reply: previous }, after: { reply: text },
    write: () => ctx.client.updateReply(ctx.location, input.reviewId, text),
    verify: async () => {
      const live = await readReview(ctx, input.reviewId);
      if (!live) return { readback: "failed" };
      return { readback: normalize(live.reviewReply?.comment) === normalize(text) ? "matched" : "differs" };
    },
    undo: () => previous === null
      ? { kind: "delete_reply", reviewId: input.reviewId }
      : { kind: "restore_reply", reviewId: input.reviewId, previous },
  });
}

/** Withdraw a published reply: Google deleteReply, previous text kept for undo. */
export async function withdrawReviewReply(ctx: ListingContext, input: {
  reviewId: string; authority: ListingAuthority; idempotencyKey?: string;
}): Promise<ListingWriteOutcome> {
  const paused = checkRefusal(ctx);
  if (paused) return paused;
  if (input.authority.kind === "auto_reply_policy") return refused("authority");
  const review = await readReview(ctx, input.reviewId);
  if (!review) return refused("snapshot_unavailable");
  const previous = review.reviewReply?.comment ?? null;
  if (previous === null) return refused("nothing_to_change");
  return governedWrite(ctx, {
    action: "reply_delete", targetRef: input.reviewId, authority: input.authority, idempotencyKey: input.idempotencyKey,
    before: { reply: previous }, after: { reply: null },
    write: () => ctx.client.deleteReply(ctx.location, input.reviewId),
    verify: async () => {
      const live = await readReview(ctx, input.reviewId);
      if (!live) return { readback: "failed" };
      return { readback: live.reviewReply?.comment ? "differs" : "matched" };
    },
    undo: () => ({ kind: "restore_reply", reviewId: input.reviewId, previous }),
  });
}

// ---- hours and info, read from the business record ----

function pick(state: GoogleLocationState, mask: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of mask) {
    const value = (state as Record<string, unknown>)[field];
    out[field] = value === undefined ? null : value;
  }
  return out;
}

async function patchFromRecord(ctx: ListingContext, input: {
  action: "hours_patch" | "info_patch"; mask: string[]; body: Record<string, unknown>; authority: ListingAuthority; idempotencyKey?: string;
  matches(state: GoogleLocationState | undefined): boolean;
}): Promise<ListingWriteOutcome> {
  const paused = checkRefusal(ctx);
  if (paused) return paused;
  if (input.authority.kind === "auto_reply_policy") return refused("authority");
  if (!input.mask.length) return refused("nothing_to_change");
  const current = await ctx.client.getLocation(ctx.location, [...input.mask, "metadata"]);
  if (!current.ok) return refused("snapshot_unavailable");
  if (input.matches(current.data)) return refused("nothing_to_change");
  const snapshot = pick(current.data, input.mask);
  return governedWrite(ctx, {
    action: input.action, targetRef: null, authority: input.authority, idempotencyKey: input.idempotencyKey,
    before: snapshot, after: input.body,
    write: () => ctx.client.patchLocation(ctx.location, input.mask, input.body),
    verify: async () => {
      const live = await ctx.client.getLocation(ctx.location, [...input.mask, "metadata"]);
      if (!live.ok) return { readback: "failed" };
      if (input.matches(live.data)) return { readback: "matched", after: pick(live.data, input.mask) };
      // Google may hold an edit for its own review; the receipt says so, not "done".
      return { readback: live.data.metadata?.hasPendingEdits ? "held_by_google" : "differs", after: pick(live.data, input.mask) };
    },
    undo: () => ({ kind: "patch_snapshot", updateMask: input.mask, snapshot }),
  });
}

/** One approval covers the record change; this is its Google half. */
export async function syncHoursFromRecord(ctx: ListingContext, input: {
  hours: FactValues["hours"]; authority: ListingAuthority; idempotencyKey?: string;
}): Promise<ListingWriteOutcome> {
  const body = hoursToGoogle(input.hours) as unknown as Record<string, unknown>;
  const mask = ["regularHours", "specialHours"];
  return patchFromRecord(ctx, {
    action: "hours_patch", mask, body, authority: input.authority, idempotencyKey: input.idempotencyKey,
    matches: (state) => hoursMatch(body as GoogleHours, state),
  });
}

/** Phone, website and description from the record. New at 1.0.0. */
export async function syncInfoFromRecord(ctx: ListingContext, input: {
  record: RecordInfo; authority: ListingAuthority; idempotencyKey?: string;
}): Promise<ListingWriteOutcome> {
  const { body, updateMask } = infoToGoogle(input.record);
  if (body.websiteUri) {
    try {
      await (ctx.checkUrl ?? defaultCheckUrl)(body.websiteUri);
    } catch {
      return refused("unsafe_url");
    }
  }
  return patchFromRecord(ctx, {
    action: "info_patch", mask: updateMask, body: body as Record<string, unknown>, authority: input.authority, idempotencyKey: input.idempotencyKey,
    matches: (state) => infoMatches(body, state as GoogleInfo, updateMask),
  });
}

// ---- posts ----

function googlePostBody(post: ListingPostInput): Record<string, unknown> {
  const date = (value: string) => { const [year, month, day] = value.split("-").map(Number); return { year, month, day }; };
  return {
    languageCode: "en-US",
    summary: post.summary,
    topicType: post.topicType,
    ...(post.callToAction ? { callToAction: post.callToAction } : {}),
    ...(post.event ? { event: { title: post.event.title, schedule: { startDate: date(post.event.startDate), endDate: date(post.event.endDate) } } } : {}),
    ...(post.offer ? { offer: post.offer } : {}),
  };
}

async function defaultCheckUrl(url: string): Promise<void> {
  const { validateUrlSafety } = await import("@/lib/audit/checks");
  await validateUrlSafety(url);
}

export async function createListingPost(ctx: ListingContext, input: {
  post: ListingPostInput; authority: ListingAuthority; idempotencyKey?: string;
}): Promise<ListingWriteOutcome> {
  const paused = checkRefusal(ctx);
  if (paused) return paused;
  if (input.authority.kind === "auto_reply_policy") return refused("authority");
  const parsed = postInputSchema.safeParse(input.post);
  if (!parsed.success) return refused("invalid");
  for (const url of [parsed.data.callToAction?.url, parsed.data.offer?.redeemOnlineUrl]) {
    if (!url) continue;
    try {
      await (ctx.checkUrl ?? defaultCheckUrl)(url);
    } catch {
      return refused("unsafe_url");
    }
  }
  const body = googlePostBody(parsed.data);
  return governedWrite(ctx, {
    action: "post_create", targetRef: null, authority: input.authority, idempotencyKey: input.idempotencyKey,
    before: null, after: body,
    write: () => ctx.client.createPost(ctx.location, body),
    verify: async (created) => {
      const live = await ctx.client.getPost(created.name);
      if (!live.ok) return { readback: "failed" };
      if (live.data.state === "PROCESSING") return { readback: "held_by_google" };
      return { readback: live.data.state === "LIVE" && normalize(live.data.summary) === normalize(parsed.data.summary) ? "matched" : "differs" };
    },
    providerRef: (created) => created.name,
    undo: (created) => ({ kind: "delete_post", postName: created.name }),
  });
}

// ---- undo ----

export async function undoListingChange(ctx: ListingContext, input: {
  receiptId: string; authority: Extract<ListingAuthority, { kind: "owner_undo" | "operator_undo" }>;
}): Promise<ListingWriteOutcome> {
  const paused = checkRefusal(ctx);
  if (paused) return paused;
  const original = await ctx.receipts.get(input.receiptId, ctx.workspaceId);
  if (!original || !original.undo || !["posted", "posted_unverified", "held_by_google"].includes(original.status)) return refused("not_undoable");
  const undo = original.undo;
  const common = { targetRef: original.targetRef, authority: input.authority, undoesReceiptId: original.id, idempotencyKey: `undo:${original.id}` };
  switch (undo.kind) {
    case "delete_reply":
      return governedWrite(ctx, {
        ...common, action: "reply_delete", before: original.after, after: { reply: null },
        write: () => ctx.client.deleteReply(ctx.location, undo.reviewId),
        verify: async () => {
          const live = await readReview(ctx, undo.reviewId);
          return { readback: !live ? "failed" : live.reviewReply?.comment ? "differs" : "matched" };
        },
        undo: () => null,
      });
    case "restore_reply":
      return governedWrite(ctx, {
        ...common, action: "reply_update", before: original.after, after: { reply: undo.previous },
        write: () => ctx.client.updateReply(ctx.location, undo.reviewId, undo.previous),
        verify: async () => {
          const live = await readReview(ctx, undo.reviewId);
          return { readback: !live ? "failed" : normalize(live.reviewReply?.comment) === normalize(undo.previous) ? "matched" : "differs" };
        },
        undo: () => null,
      });
    case "delete_post":
      return governedWrite(ctx, {
        ...common, action: "post_delete", before: original.after, after: null,
        write: () => ctx.client.deletePost(undo.postName),
        verify: async () => {
          const live = await ctx.client.getPost(undo.postName);
          return { readback: !live.ok && live.kind === "not_found" ? "matched" : live.ok ? "differs" : "failed" };
        },
        undo: () => null,
      });
    case "patch_snapshot":
      return governedWrite(ctx, {
        ...common, action: original.action as "hours_patch" | "info_patch", before: original.after, after: undo.snapshot,
        // A field Google didn't have is cleared: it stays in the mask, out of the body.
        write: () => ctx.client.patchLocation(ctx.location, undo.updateMask,
          Object.fromEntries(Object.entries(undo.snapshot).filter(([, value]) => value !== null))),
        verify: async () => {
          const live = await ctx.client.getLocation(ctx.location, [...undo.updateMask, "metadata"]);
          if (!live.ok) return { readback: "failed" };
          const matches = undo.updateMask.includes("regularHours") || undo.updateMask.includes("specialHours")
            ? hoursMatch(undo.snapshot as GoogleHours, live.data)
            : infoMatches(undo.snapshot as GoogleInfo, live.data, undo.updateMask);
          return { readback: matches ? "matched" : live.data.metadata?.hasPendingEdits ? "held_by_google" : "differs" };
        },
        undo: () => null,
      });
  }
}
