import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleListingClient, GoogleResult, GoogleReview } from "@/products/google-listing/client";
import { createMemoryReceiptStore, type ListingReceiptStore } from "@/products/google-listing/receipts";
import type { TenantReplyDeps } from "@/products/google-listing/tenant-replies";
import type { GoogleGrant } from "@/lib/google-access";

/**
 * The tenant approve path for review replies, moved onto the Google listing
 * System: a linked tenant (release on) posts through the listing System and
 * records one google_listing_receipts row, never an outside-write receipt and
 * never through the legacy publisher. An unlinked tenant keeps the legacy
 * publisher. A failed post leaves the approval pending; an accepted post whose
 * read-back fails is done and never retried.
 */

const mockGetEvent = vi.fn();
const mockResolveEvent = vi.fn();
const mockClaimEventAction = vi.fn();
const mockFinishEventAction = vi.fn();
const mockMark = vi.fn();
const mockPublishReviewReply = vi.fn();
const mockRecordOutsideWrite = vi.fn();
const mockAssertActingProvider = vi.fn();
let deps: TenantReplyDeps;

vi.mock("@/platform/workspaces/acting-provider", () => ({
  assertActingProvider: (...args: unknown[]) => mockAssertActingProvider(...args),
}));
vi.mock("@/platform/infra/db/client", () => ({
  getSupabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { email: "staff@agency.example.test" } }) }) }) }) }),
}));

vi.mock("../lib/events", () => ({
  getEvent: (...args: unknown[]) => mockGetEvent(...args),
  getEventRaw: (...args: unknown[]) => mockGetEvent(...args),
  resolveEvent: (...args: unknown[]) => mockResolveEvent(...args),
  claimEventAction: (...args: unknown[]) => mockClaimEventAction(...args),
  finishEventAction: (...args: unknown[]) => mockFinishEventAction(...args),
  markExecutionExternalAccepted: (...args: unknown[]) => mockMark(...args),
  updateEvent: vi.fn(),
}));
vi.mock("@/products/inquiries", () => ({
  isInquiryMessageReviewEvent: () => false,
  authorizeInquiryMessageReviewActor: vi.fn(),
  executeInquiryMessageReview: vi.fn(),
  reconcileInquiryMessageReview: vi.fn(),
}));
vi.mock("@/products/inquiries/server", () => ({ executeInquiryPublication: vi.fn() }));
vi.mock("@/products/publishing/server", () => ({ executePublishingEvent: async () => null, publishingReleaseEnabled: () => true }));
vi.mock("../lib/suggestions", () => ({ updateSuggestion: vi.fn() }));
vi.mock("../lib/agent-executor", () => ({ executeAgentPrompt: vi.fn() }));
vi.mock("../lib/storage", () => ({
  getDraftContent: vi.fn(), getContent: vi.fn(), setContent: vi.fn(), appendVersion: vi.fn(), clearDraft: vi.fn(),
  recordSectionUpdate: vi.fn(), logActivity: vi.fn(), getSectionTimestamps: () => Promise.resolve({}),
}));
vi.mock("../lib/reviews", () => ({ replyToReviewByExternalId: vi.fn(async () => undefined) }));
vi.mock("../lib/review-replies", () => ({ markReviewReplyDeclined: vi.fn(async () => undefined) }));
vi.mock("../lib/gbp-replies", () => ({ publishReviewReply: (...args: unknown[]) => mockPublishReviewReply(...args) }));
vi.mock("@/platform/operator-queue/receipts", () => ({ recordOutsideWrite: (...args: unknown[]) => mockRecordOutsideWrite(...args) }));
vi.mock("@/products/google-listing/tenant-replies", async (original) => ({
  ...(await original<typeof import("@/products/google-listing/tenant-replies")>()),
  defaultTenantReplyDeps: async () => deps,
}));

import { AUTO_REPLY_ACTOR, agencyStaffActorId, isDelegateActor, isOperatorActor, operatorActorId, resolveEventAction } from "../lib/event-actions";

const WORKSPACE = "ab000000-0000-4000-8000-000000000010";
const ok = <T,>(data: T): GoogleResult<T> => ({ ok: true, data });

function fakeGoogle(options: { readbackFails?: boolean; refuse?: boolean; rating?: GoogleReview["starRating"] } = {}) {
  const review: GoogleReview = { reviewId: "rev_9", starRating: options.rating ?? "FIVE", comment: "Great" };
  const writes: string[] = [];
  let reads = 0;
  const client = {
    getReview: vi.fn(async () => {
      reads += 1;
      // The first read is the snapshot; a later one is the read-back.
      if (options.readbackFails && reads > 1) return { ok: false, kind: "error", status: 500, detail: "boom" } as const;
      return ok({ ...review });
    }),
    updateReply: vi.fn(async (_loc: unknown, _id: string, comment: string) => {
      if (options.refuse) return { ok: false, kind: "error", status: 400, detail: "bad request" } as const;
      writes.push(comment);
      review.reviewReply = { comment };
      return ok({ comment });
    }),
  } as unknown as GoogleListingClient;
  return { client, writes };
}

function grant(): GoogleGrant {
  return {
    source: "binding", tenantId: "tenant-a", status: "connected", scopes: ["https://www.googleapis.com/auth/business.manage"],
    accessToken: "token", refreshToken: null, expiresAt: null, bindingId: "binding-1", workspaceId: WORKSPACE,
    location: { accountId: "accounts/111", locationId: "333" }, connection: null,
  };
}

function setup(over: Partial<TenantReplyDeps> = {}, google = fakeGoogle(), receipts: ListingReceiptStore & { all(): unknown[] } = createMemoryReceiptStore()) {
  deps = {
    releaseEnabled: () => true,
    bindingTarget: async () => ({ workspaceId: WORKSPACE }),
    grant: async () => grant(),
    location: async (_t, g) => g.location,
    accessToken: async () => "token",
    client: () => google.client,
    receipts: () => receipts,
    notify: vi.fn(),
    ...over,
  };
  return { google, receipts };
}

const reviewDraft = (metadata: Record<string, unknown> = {}) => ({
  id: "evt_rr", tenantId: "tenant-a", type: "review", status: "pending", body: "Thank you!",
  metadata: { kind: "review_reply_draft", reviewId: "rev_9", draftedReply: "Thank you!", rating: 5, ...metadata },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockClaimEventAction.mockResolvedValue({ acquired: true, attemptId: "attempt_1" });
  mockResolveEvent.mockResolvedValue({ changed: true });
  mockGetEvent.mockResolvedValue(reviewDraft());
});

describe("review reply approve on the listing System", () => {
  it("posts through the listing System with one listing receipt and no outside-write receipt", async () => {
    const { google, receipts } = setup();
    const result = await resolveEventAction("tenant-a", "evt_rr", "approved", "owner-user-1");
    expect(result).toEqual({ changed: true });
    expect(google.writes).toEqual(["Thank you!"]);
    expect(receipts.all()).toHaveLength(1);
    expect(receipts.all()[0]).toMatchObject({
      workspaceId: WORKSPACE, bindingId: "binding-1", action: "reply_post", status: "posted", readback: "matched",
      authority: { kind: "owner_approval", actor: "owner-user-1", approvalRef: "event:evt_rr" },
      idempotencyKey: "review-reply:evt_rr",
    });
    expect(mockPublishReviewReply).not.toHaveBeenCalled();
    expect(mockRecordOutsideWrite).not.toHaveBeenCalled();
    expect(mockMark).toHaveBeenCalledWith("evt_rr");
    expect(mockResolveEvent).toHaveBeenCalledWith("evt_rr", "approved", { actor: "user" });
  });

  it("leaves the approval pending when Google refuses, with the refusal in the listing ledger only", async () => {
    const { receipts } = setup({}, fakeGoogle({ refuse: true }));
    const result = await resolveEventAction("tenant-a", "evt_rr", "approved", "owner-user-1");
    expect(result).toEqual({ changed: false, reason: "review_reply_failed" });
    expect(receipts.all()).toEqual([expect.objectContaining({ status: "failed" })]);
    expect(mockMark).not.toHaveBeenCalled();
    expect(mockResolveEvent).not.toHaveBeenCalled();
    expect(mockRecordOutsideWrite).not.toHaveBeenCalled();
  });

  it("sends nothing and records nothing when the grant is gone", async () => {
    const { google, receipts } = setup({ grant: async () => null });
    const result = await resolveEventAction("tenant-a", "evt_rr", "approved", "owner-user-1");
    expect(result).toEqual({ changed: false, reason: "review_reply_failed" });
    expect(google.writes).toEqual([]);
    expect(receipts.all()).toHaveLength(0);
    expect(deps.notify).toHaveBeenCalled();
  });

  it("an accepted post whose read-back fails is done, unverified, and never retried", async () => {
    const { google, receipts } = setup({}, fakeGoogle({ readbackFails: true }));
    const result = await resolveEventAction("tenant-a", "evt_rr", "approved", "owner-user-1");
    expect(result).toEqual({ changed: true, reason: "accepted_unverified" });
    expect(receipts.all()).toEqual([expect.objectContaining({ status: "posted_unverified", readback: "failed" })]);
    // Acceptance is marked before resolving: a later claim refuses instead of re-posting.
    expect(mockMark).toHaveBeenCalledWith("evt_rr");
    expect(google.writes).toHaveLength(1);
    expect(mockRecordOutsideWrite).not.toHaveBeenCalled();
  });

  it("a receipt store that fails after Google took the reply still counts as done", async () => {
    const memory = createMemoryReceiptStore();
    const broken = { ...memory, all: memory.all, settle: async () => { throw new Error("google_receipt_store_failed"); } };
    const { google } = setup({}, fakeGoogle(), broken);
    const result = await resolveEventAction("tenant-a", "evt_rr", "approved", "owner-user-1");
    expect(result).toEqual({ changed: true, reason: "accepted_unverified" });
    expect(google.writes).toHaveLength(1);
    expect(mockMark).toHaveBeenCalledWith("evt_rr");
  });

  it("auto mode posts under the auto-reply policy, never as an owner approval", async () => {
    const { receipts } = setup();
    const result = await resolveEventAction("tenant-a", "evt_rr", "approved", AUTO_REPLY_ACTOR);
    expect(result).toEqual({ changed: true });
    expect(receipts.all()[0]).toMatchObject({ authority: { kind: "auto_reply_policy", rating: 5 } });
  });

  it("auto mode never posts a 1-2 star reply: the listing System refuses and it stays pending", async () => {
    mockGetEvent.mockResolvedValue(reviewDraft({ rating: 2 }));
    const { google, receipts } = setup({}, fakeGoogle({ rating: "TWO" }));
    const result = await resolveEventAction("tenant-a", "evt_rr", "approved", AUTO_REPLY_ACTOR);
    expect(result).toEqual({ changed: false, reason: "review_reply_needs_owner" });
    expect(google.writes).toEqual([]);
    expect(receipts.all()).toHaveLength(0);
  });

  it("an operator's reply is an operator instruction naming the operator, never the owner's approval", async () => {
    const operator = operatorActorId("10000000-0000-4000-8000-0000000000aa");
    const authorizeProvider = vi.fn(async () => undefined);
    const { google, receipts } = setup({ authorizeProvider });
    const result = await resolveEventAction("tenant-a", "evt_rr", "approved", operator);
    expect(result).toEqual({ changed: true });
    expect(google.writes).toEqual(["Thank you!"]);
    expect(receipts.all()).toHaveLength(1);
    expect(receipts.all()[0]).toMatchObject({
      authority: { kind: "operator_instruction", actor: "operator:10000000-0000-4000-8000-0000000000aa", instructionRef: "event:evt_rr" },
    });
    expect(receipts.all()[0]).not.toMatchObject({ authority: { kind: "owner_approval" } });
    expect(mockClaimEventAction).toHaveBeenCalledWith("evt_rr", "approved", operator);
    expect(mockResolveEvent).toHaveBeenCalledWith("evt_rr", "approved", { actor: operator });
    // The operator acts for the business as its acting provider (#255), checked before the receipt and the write.
    expect(authorizeProvider).toHaveBeenCalledWith(WORKSPACE, "10000000-0000-4000-8000-0000000000aa", expect.any(String));
    expect(authorizeProvider).toHaveBeenCalledTimes(2);
  });

  it("an operator who is not the business's acting provider sends nothing (#255)", async () => {
    const operator = operatorActorId("10000000-0000-4000-8000-0000000000aa");
    const { google, receipts } = setup({ authorizeProvider: async () => { throw new Error("acting_provider_no_mandate"); } });
    expect(await resolveEventAction("tenant-a", "evt_rr", "approved", operator)).not.toEqual({ changed: true });
    expect(google.writes).toEqual([]);
    expect(receipts.all()).toHaveLength(0);
    const unwired = setup();
    expect(await resolveEventAction("tenant-a", "evt_rr", "approved", operator)).not.toEqual({ changed: true });
    expect(unwired.google.writes).toEqual([]);
  });

  it("an operator's reply on the legacy publisher names the operator in its receipt", async () => {
    const operator = operatorActorId("10000000-0000-4000-8000-0000000000aa");
    setup({ bindingTarget: async () => null });
    mockPublishReviewReply.mockResolvedValue({ published: true, verified: true });
    expect(await resolveEventAction("tenant-a", "evt_rr", "approved", operator)).toEqual({ changed: true });
    expect(mockPublishReviewReply).toHaveBeenCalledWith("tenant-a", "rev_9", "Thank you!", { actor: `${operator} approved event evt_rr` });
    expect(mockResolveEvent).toHaveBeenCalledWith("evt_rr", "approved", { actor: operator });
  });

  it("agency staff's reply is an operator instruction naming the agency and the person, never the owner's approval", async () => {
    const staff = agencyStaffActorId("10000000-0000-4000-8000-0000000000cc", "10000000-0000-4000-8000-0000000000bb");
    const authorizeProvider = vi.fn(async () => undefined);
    const { google, receipts } = setup({ authorizeProvider });
    expect(await resolveEventAction("tenant-a", "evt_rr", "approved", staff)).toEqual({ changed: true });
    expect(google.writes).toEqual(["Thank you!"]);
    expect(receipts.all()[0]).toMatchObject({
      authority: { kind: "operator_instruction", actor: "agency-staff:10000000-0000-4000-8000-0000000000cc:10000000-0000-4000-8000-0000000000bb", instructionRef: "event:evt_rr" },
    });
    expect(receipts.all()[0]).not.toMatchObject({ authority: { kind: "owner_approval" } });
    expect(mockResolveEvent).toHaveBeenCalledWith("evt_rr", "approved", { actor: staff });
    expect(authorizeProvider).toHaveBeenCalledWith(WORKSPACE, "10000000-0000-4000-8000-0000000000bb", "333", "10000000-0000-4000-8000-0000000000cc");
    expect(authorizeProvider).toHaveBeenCalledTimes(2);
  });

  it("agency staff without provider authorization sends nothing", async () => {
    const staff = agencyStaffActorId("10000000-0000-4000-8000-0000000000cc", "10000000-0000-4000-8000-0000000000bb");
    const { google, receipts } = setup();
    expect(await resolveEventAction("tenant-a", "evt_rr", "approved", staff)).toEqual({ changed: false, reason: "review_reply_failed" });
    expect(google.writes).toEqual([]);
    expect(receipts.all()).toHaveLength(0);
  });

  it("rechecks the named agency before dispatch and keeps a provider swap from writing", async () => {
    const agency = "10000000-0000-4000-8000-0000000000cc";
    const userId = "10000000-0000-4000-8000-0000000000bb";
    const staff = agencyStaffActorId(agency, userId);
    const { defaultTenantReplyDeps } = await vi.importActual<typeof import("@/products/google-listing/tenant-replies")>("@/products/google-listing/tenant-replies");
    const production = await defaultTenantReplyDeps();
    mockAssertActingProvider.mockResolvedValueOnce(agency).mockResolvedValue("10000000-0000-4000-8000-0000000000dd");
    const { google, receipts } = setup({ authorizeProvider: production.authorizeProvider });
    expect(await resolveEventAction("tenant-a", "evt_rr", "approved", staff)).toEqual({ changed: false, reason: "review_reply_failed" });
    expect(mockAssertActingProvider).toHaveBeenCalledTimes(2);
    expect(mockAssertActingProvider).toHaveBeenCalledWith({ userId, verifiedEmail: "staff@agency.example.test" }, WORKSPACE, { effect: "google", kind: "google_location", ref: "333" });
    expect(google.writes).toEqual([]);
    expect(receipts.all()).toEqual([expect.objectContaining({ status: "failed", error: expect.stringMatching(/permission ended before the write/) })]);
    expect(mockMark).not.toHaveBeenCalled();
    expect(mockResolveEvent).not.toHaveBeenCalled();
  });

  it("only a verified agency and user id become an agency staff actor", () => {
    expect(() => agencyStaffActorId("not-a-uuid", "10000000-0000-4000-8000-0000000000bb")).toThrow("agency_staff_actor_invalid");
    expect(() => agencyStaffActorId("10000000-0000-4000-8000-0000000000cc", "")).toThrow("agency_staff_actor_invalid");
    expect(isDelegateActor("agency-staff:x:y")).toBe(false);
    expect(isDelegateActor("10000000-0000-4000-8000-0000000000bb")).toBe(false);
    expect(isDelegateActor(agencyStaffActorId("10000000-0000-4000-8000-0000000000cc", "10000000-0000-4000-8000-0000000000bb"))).toBe(true);
    expect(isOperatorActor(agencyStaffActorId("10000000-0000-4000-8000-0000000000cc", "10000000-0000-4000-8000-0000000000bb"))).toBe(false);
  });

  it("only a verified operator id becomes an operator actor", () => {
    expect(() => operatorActorId("user")).toThrow("operator_actor_invalid");
    expect(() => operatorActorId("")).toThrow("operator_actor_invalid");
    expect(isOperatorActor("owner-user-1")).toBe(false);
    expect(isOperatorActor("operator:not-a-uuid")).toBe(false);
    expect(isOperatorActor(operatorActorId("10000000-0000-4000-8000-0000000000aa"))).toBe(true);
  });

  it("an owner may still approve a 1-2 star reply", async () => {
    mockGetEvent.mockResolvedValue(reviewDraft({ rating: 1 }));
    const { google } = setup({}, fakeGoogle({ rating: "ONE" }));
    const result = await resolveEventAction("tenant-a", "evt_rr", "approved", "owner-user-1");
    expect(result).toEqual({ changed: true });
    expect(google.writes).toEqual(["Thank you!"]);
  });

  it("an unlinked tenant keeps the legacy publisher and writes no listing receipt", async () => {
    const { google, receipts } = setup({ bindingTarget: async () => null });
    mockPublishReviewReply.mockResolvedValue({ published: true, verified: true });
    const result = await resolveEventAction("tenant-a", "evt_rr", "approved", "owner-user-1");
    expect(result).toEqual({ changed: true });
    expect(mockPublishReviewReply).toHaveBeenCalledWith("tenant-a", "rev_9", "Thank you!", { actor: "approved event evt_rr" });
    expect(google.writes).toEqual([]);
    expect(receipts.all()).toHaveLength(0);
  });

  it("an unreadable link or the release off keeps the legacy publisher", async () => {
    mockPublishReviewReply.mockResolvedValue({ published: true, verified: true });
    const first = setup({ bindingTarget: async () => { throw new Error("schema_missing"); } });
    await resolveEventAction("tenant-a", "evt_rr", "approved", "owner-user-1");
    const second = setup({ releaseEnabled: () => false });
    await resolveEventAction("tenant-a", "evt_rr", "approved", "owner-user-1");
    expect(mockPublishReviewReply).toHaveBeenCalledTimes(2);
    expect(first.receipts.all()).toHaveLength(0);
    expect(second.receipts.all()).toHaveLength(0);
  });

  it("dismissing never reaches Google on either path", async () => {
    const { google, receipts } = setup();
    const result = await resolveEventAction("tenant-a", "evt_rr", "dismissed", "owner-user-1");
    expect(result).toEqual({ changed: true });
    expect(google.writes).toEqual([]);
    expect(receipts.all()).toHaveLength(0);
    expect(mockPublishReviewReply).not.toHaveBeenCalled();
  });
});
