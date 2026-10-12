import { describe, expect, it, vi } from "vitest";
import type { GoogleListingClient, GoogleLocationState, GooglePost, GoogleResult, GoogleReview } from "@/products/google-listing/client";
import { classifyGoogleFailure, createHttpGoogleListingClient, listAllReviews } from "@/products/google-listing/client";
import { createMemoryReceiptStore } from "@/products/google-listing/receipts";
import {
  createListingPost,
  postReviewReply,
  receiptHeadline,
  routeReviewReply,
  syncHoursFromRecord,
  syncInfoFromRecord,
  undoListingChange,
  withdrawReviewReply,
  type ListingContext,
} from "@/products/google-listing/service";
import { hoursToGoogle, infoToGoogle, recordDrift } from "@/products/google-listing/record";

// The Google listing System's writes, against a fake Google. No live calls.

const WORKSPACE = "ab000000-0000-4000-8000-000000000010";
const OWNER = { kind: "owner_approval" as const, actor: "owner@mooneyfirm.example", approvalRef: "evt_1" };
const UNDO = { kind: "owner_undo" as const, actor: "owner@mooneyfirm.example" };

const ok = <T,>(data: T): GoogleResult<T> => ({ ok: true, data });
const fail = (status: number, detail: string): GoogleResult<never> => ({ ok: false, kind: classifyGoogleFailure(status, detail), status, detail });

/** A tiny in-memory Google with the knobs the failure paths need. */
function fakeGoogle(options: { holdEdits?: boolean; replyLag?: boolean; quotaZero?: boolean } = {}) {
  const reviews = new Map<string, GoogleReview>([
    ["rev-dana", { reviewId: "rev-dana", reviewer: { displayName: "Dana" }, starRating: "FIVE", comment: "Great firm" }],
    ["rev-low", { reviewId: "rev-low", reviewer: { displayName: "Lee" }, starRating: "TWO", comment: "Slow" }],
    ["rev-replied", { reviewId: "rev-replied", starRating: "FOUR", reviewReply: { comment: "Thanks, Sam." } }],
  ]);
  let location: GoogleLocationState = {
    title: "The Mooney Firm",
    regularHours: { periods: [{ openDay: "MONDAY", openTime: { hours: 9 }, closeDay: "MONDAY", closeTime: { hours: 17 } }] },
    phoneNumbers: { primaryPhone: "(716) 555-0100" },
    websiteUri: "https://attymooney.example",
    metadata: { hasPendingEdits: false },
  };
  const posts = new Map<string, GooglePost>();
  const writes: string[] = [];
  const quota = () => (options.quotaZero ? fail(403, "Business Profile API has not been used in project 1 before (accessNotConfigured)") : null);
  const client: GoogleListingClient = {
    listReviews: vi.fn(async (_loc, pageToken?: string) => ok(pageToken
      ? { reviews: [reviews.get("rev-replied")!] }
      : { reviews: [reviews.get("rev-dana")!, reviews.get("rev-low")!], nextPageToken: "page-2" })),
    getReview: vi.fn(async (_loc, id: string) => (reviews.has(id) ? ok({ ...reviews.get(id)! }) : fail(404, "not found"))),
    updateReply: vi.fn(async (_loc, id: string, comment: string) => {
      const blocked = quota(); if (blocked) return blocked;
      writes.push(`updateReply:${id}`);
      if (!options.replyLag) reviews.set(id, { ...reviews.get(id)!, reviewReply: { comment } });
      return ok({ comment });
    }),
    deleteReply: vi.fn(async (_loc, id: string) => {
      writes.push(`deleteReply:${id}`);
      const { reviewReply: _removed, ...rest } = reviews.get(id)!;
      reviews.set(id, rest);
      return ok(null);
    }),
    getLocation: vi.fn(async () => ok(JSON.parse(JSON.stringify(location)) as GoogleLocationState)),
    patchLocation: vi.fn(async (_loc, mask: string[], body: Record<string, unknown>) => {
      const blocked = quota(); if (blocked) return blocked;
      writes.push(`patch:${mask.join(",")}`);
      if (options.holdEdits) location = { ...location, metadata: { hasPendingEdits: true } };
      else {
        const next = { ...location } as Record<string, unknown>;
        for (const field of mask) next[field] = body[field];
        location = next as GoogleLocationState;
      }
      return ok(location);
    }),
    createPost: vi.fn(async (_loc, post: Record<string, unknown>) => {
      writes.push("createPost");
      const name = `accounts/111/locations/333/localPosts/p${posts.size + 1}`;
      posts.set(name, { name, summary: String(post.summary), state: "LIVE" });
      return ok(posts.get(name)!);
    }),
    getPost: vi.fn(async (name: string) => (posts.has(name) ? ok(posts.get(name)!) : fail(404, "not found"))),
    deletePost: vi.fn(async (name: string) => { writes.push(`deletePost:${name}`); posts.delete(name); return ok(null); }),
  };
  return { client, writes, reviews, location: () => location };
}

function context(google = fakeGoogle(), over: Partial<ListingContext> = {}) {
  const receipts = createMemoryReceiptStore();
  const ctx: ListingContext = {
    workspaceId: WORKSPACE, bindingId: "binding-1", location: { accountId: "accounts/111", locationId: "333" },
    lifecycle: "live", client: google.client, receipts, checkUrl: async () => undefined, ...over,
  };
  return { ctx, receipts, google };
}

describe("review replies", () => {
  it("posts an approved reply, reads it back, and keeps a delete-based undo", async () => {
    const { ctx, google } = context();
    const result = await postReviewReply(ctx, { reviewId: "rev-dana", text: "Thank you, Dana.", authority: OWNER });
    expect(result.status).toBe("posted");
    if (result.status !== "posted") return;
    expect(result.receipt).toMatchObject({ action: "reply_post", readback: "matched", before: { reply: null }, after: { reply: "Thank you, Dana." }, undo: { kind: "delete_reply" } });
    expect(receiptHeadline(result.receipt, "Dana")).toBe("Replied to Dana's review on Google.");
    expect(google.writes).toEqual(["updateReply:rev-dana"]);
  });

  it("never writes twice for the same approval", async () => {
    const { ctx, google } = context();
    await postReviewReply(ctx, { reviewId: "rev-dana", text: "Thank you, Dana.", authority: OWNER, idempotencyKey: "approval:evt_1" });
    const again = await postReviewReply(ctx, { reviewId: "rev-dana", text: "Thank you again.", authority: OWNER, idempotencyKey: "approval:evt_1" });
    expect(again.status).toBe("posted");
    expect(google.writes).toEqual(["updateReply:rev-dana"]);
  });

  it("records posted_unverified when Google takes the reply but doesn't show it, and never retries", async () => {
    const { ctx, google } = context(fakeGoogle({ replyLag: true }));
    const result = await postReviewReply(ctx, { reviewId: "rev-dana", text: "Thank you, Dana.", authority: OWNER, idempotencyKey: "approval:evt_2" });
    expect(result.status).toBe("posted_unverified");
    expect(result.message).toBe("Posted. Google hasn't shown it yet.");
    await postReviewReply(ctx, { reviewId: "rev-dana", text: "Thank you, Dana.", authority: OWNER, idempotencyKey: "approval:evt_2" });
    expect(google.writes).toEqual(["updateReply:rev-dana"]);
  });

  it("auto mode posts a 5-star reply on policy but refuses a 2-star one", async () => {
    const { ctx, google } = context();
    expect((await postReviewReply(ctx, { reviewId: "rev-dana", text: "Thanks, Dana!", authority: { kind: "auto_reply_policy", rating: 5 } })).status).toBe("posted");
    const low = await postReviewReply(ctx, { reviewId: "rev-low", text: "Sorry, Lee.", authority: { kind: "auto_reply_policy", rating: 2 } as never });
    expect(low).toMatchObject({ status: "refused", reason: "authority" });
    // A forged rating doesn't help: the policy is checked against Google's own rating.
    const forged = await postReviewReply(ctx, { reviewId: "rev-low", text: "Sorry, Lee.", authority: { kind: "auto_reply_policy", rating: 5 } });
    expect(forged).toMatchObject({ status: "refused", reason: "authority" });
    expect(google.writes).toEqual(["updateReply:rev-dana"]);
  });

  it("routes 1 and 2 star replies to the owner even in auto mode", () => {
    expect(routeReviewReply("auto", 5)).toBe("auto");
    expect(routeReviewReply("auto", 3)).toBe("auto");
    expect(routeReviewReply("auto", 2)).toBe("owner");
    expect(routeReviewReply("auto", 1)).toBe("owner");
    expect(routeReviewReply("auto", null)).toBe("owner");
    expect(routeReviewReply("approve", 5)).toBe("owner");
    expect(routeReviewReply("off", 5)).toBe("none");
  });

  it("edits a published reply with updateReply and undo restores the old text", async () => {
    const { ctx, google } = context();
    const edit = await postReviewReply(ctx, { reviewId: "rev-replied", text: "Thank you so much, Sam.", authority: OWNER });
    expect(edit.status).toBe("posted");
    if (edit.status !== "posted") return;
    expect(edit.receipt).toMatchObject({ action: "reply_update", undo: { kind: "restore_reply", previous: "Thanks, Sam." } });
    const undone = await undoListingChange(ctx, { receiptId: edit.receipt.id, authority: UNDO });
    expect(undone.status).toBe("posted");
    expect(google.reviews.get("rev-replied")?.reviewReply?.comment).toBe("Thanks, Sam.");
    expect((await ctx.receipts.get(edit.receipt.id, WORKSPACE))?.status).toBe("undone");
    // The undo is itself not undoable, and the original can't be undone twice.
    expect(await undoListingChange(ctx, { receiptId: edit.receipt.id, authority: UNDO })).toMatchObject({ status: "refused", reason: "not_undoable" });
  });

  it("withdraws a reply with deleteReply, and undo puts it back", async () => {
    const { ctx, google } = context();
    const withdrawn = await withdrawReviewReply(ctx, { reviewId: "rev-replied", authority: OWNER });
    expect(withdrawn.status).toBe("posted");
    expect(google.reviews.get("rev-replied")?.reviewReply).toBeUndefined();
    if (withdrawn.status !== "posted") return;
    await undoListingChange(ctx, { receiptId: withdrawn.receipt.id, authority: UNDO });
    expect(google.reviews.get("rev-replied")?.reviewReply?.comment).toBe("Thanks, Sam.");
  });

  it("undoes a first reply with deleteReply", async () => {
    const { ctx, google } = context();
    const posted = await postReviewReply(ctx, { reviewId: "rev-dana", text: "Thank you, Dana.", authority: OWNER });
    if (posted.status !== "posted") throw new Error("expected posted");
    expect((await undoListingChange(ctx, { receiptId: posted.receipt.id, authority: UNDO })).status).toBe("posted");
    expect(google.writes).toEqual(["updateReply:rev-dana", "deleteReply:rev-dana"]);
  });
  it("retries a definitively rejected undo but blocks an uncertain undo across retries", async () => {
    const { ctx, google } = context();
    const posted = await postReviewReply(ctx, { reviewId: "rev-dana", text: "Thank you.", authority: OWNER });
    if (posted.status !== "posted") throw new Error("expected posted");
    vi.mocked(google.client.deleteReply).mockResolvedValueOnce(fail(403, "Permission denied"));
    const input = { receiptId: posted.receipt.id, authority: UNDO, retryFailed: true };
    expect((await undoListingChange(ctx, input)).status).toBe("failed");
    vi.mocked(google.client.deleteReply).mockRejectedValueOnce(new Error("Response lost"));
    expect((await undoListingChange(ctx, input)).status).toBe("write_unconfirmed");
    expect((await undoListingChange(ctx, input)).status).toBe("write_unconfirmed");
    expect(google.client.deleteReply).toHaveBeenCalledTimes(2);
  });

  it("refuses every write while the listing is paused", async () => {
    const { ctx, google } = context(undefined, { lifecycle: "paused" });
    expect(await postReviewReply(ctx, { reviewId: "rev-dana", text: "Hi", authority: OWNER })).toMatchObject({ status: "refused", reason: "paused" });
    expect(await createListingPost(ctx, { post: { topicType: "STANDARD", summary: "Hi" }, authority: OWNER })).toMatchObject({ reason: "paused" });
    expect(google.writes).toEqual([]);
  });

  it("refuses a reply over Google's 4,096 byte limit", async () => {
    const { ctx } = context();
    expect(await postReviewReply(ctx, { reviewId: "rev-dana", text: "é".repeat(2100), authority: OWNER })).toMatchObject({ status: "refused", reason: "invalid" });
  });

  it("reports quota 0 as access pending, with a failed receipt and no undo", async () => {
    const { ctx } = context(fakeGoogle({ quotaZero: true }));
    const result = await postReviewReply(ctx, { reviewId: "rev-dana", text: "Thank you, Dana.", authority: OWNER });
    expect(result).toMatchObject({ status: "failed", accessPending: true });
    if (result.status === "failed") expect(result.receipt).toMatchObject({ status: "failed", undo: null });
  });
});

describe("hours and info from the business record", () => {
  it("clears removed hours using both update masks and supports undo", async () => {
    const { ctx, google } = context();
    const result = await syncHoursFromRecord(ctx, { hours: null, authority: OWNER });
    expect(result.status).toBe("posted");
    expect(google.client.patchLocation).toHaveBeenCalledWith(ctx.location, ["regularHours", "specialHours"], {});
    if (result.status !== "posted") throw new Error("expected cleared hours");
    await undoListingChange(ctx, { receiptId: result.receipt.id, authority: UNDO });
    expect(google.location().regularHours?.periods[0]?.openDay).toBe("MONDAY");
  });
  const hours = {
    timezone: "America/New_York",
    weekly: [{ day: 1, opens: "09:00", closes: "17:00" }, { day: 2, opens: "09:00", closes: "17:00" }],
    overrides: [{ date: "2026-11-27", closed: true, label: "Day after Thanksgiving" }],
  };

  it("converts record hours to Google's shape (0 is Sunday)", () => {
    expect(hoursToGoogle({ timezone: "UTC", weekly: [{ day: 0, opens: "10:00", closes: "24:00" }] }).regularHours.periods[0])
      .toEqual({ openDay: "SUNDAY", openTime: { hours: 10, minutes: 0 }, closeDay: "SUNDAY", closeTime: { hours: 24, minutes: 0 } });
  });

  it("patches the location, reads it back, and undo patches back to the snapshot", async () => {
    const { ctx, google } = context();
    const result = await syncHoursFromRecord(ctx, { hours, authority: OWNER });
    expect(result.status).toBe("posted");
    if (result.status !== "posted") return;
    expect(result.message).toBe("Updated your hours on Google.");
    expect(result.receipt.undo).toMatchObject({ kind: "patch_snapshot", updateMask: ["regularHours", "specialHours"] });
    expect(google.location().specialHours?.specialHourPeriods).toHaveLength(1);
    expect((await undoListingChange(ctx, { receiptId: result.receipt.id, authority: UNDO })).status).toBe("posted");
    expect(google.location().regularHours?.periods).toHaveLength(1);
    expect(google.location().specialHours).toBeUndefined();
  });

  it("says Google is reviewing when it holds the edit, not done", async () => {
    const { ctx } = context(fakeGoogle({ holdEdits: true }));
    const result = await syncHoursFromRecord(ctx, { hours, authority: OWNER });
    expect(result).toMatchObject({ status: "held_by_google", message: "Google is reviewing this change." });
  });

  it("does nothing when Google already matches the record", async () => {
    const { ctx, google } = context();
    const same = { timezone: "UTC", weekly: [{ day: 1, opens: "09:00", closes: "17:00" }] };
    expect(await syncHoursFromRecord(ctx, { hours: same, authority: OWNER })).toMatchObject({ status: "refused", reason: "nothing_to_change" });
    expect(google.writes).toEqual([]);
  });

  it("refuses without an authority that covers it", async () => {
    const { ctx } = context();
    expect(await syncHoursFromRecord(ctx, { hours, authority: { kind: "auto_reply_policy", rating: 5 } })).toMatchObject({ reason: "authority" });
    expect(await syncHoursFromRecord(ctx, { hours, authority: UNDO })).toMatchObject({ reason: "authority" });
  });

  it("refuses when it can't snapshot Google first", async () => {
    const google = fakeGoogle();
    google.client.getLocation = vi.fn(async () => fail(500, "backend error"));
    const { ctx } = context(google);
    expect(await syncHoursFromRecord(ctx, { hours, authority: OWNER })).toMatchObject({ status: "refused", reason: "snapshot_unavailable" });
    expect(google.writes).toEqual([]);
  });

  it("syncs phone, website and description, new at 1.0.0", async () => {
    const { ctx, google } = context();
    const result = await syncInfoFromRecord(ctx, {
      record: { phone: "716-555-0199", description: "Estate planning in Buffalo.", links: [{ kind: "website", url: "https://attymooney.example" }] },
      authority: OWNER,
    });
    expect(result.status).toBe("posted");
    expect(google.writes).toEqual(["patch:phoneNumbers,websiteUri,profile"]);
    expect(google.location().profile?.description).toBe("Estate planning in Buffalo.");
  });

  it("refuses an unsafe website link", async () => {
    const { ctx } = context(undefined, { checkUrl: async () => { throw new Error("private address"); } });
    expect(await syncInfoFromRecord(ctx, { record: { links: [{ kind: "website", url: "http://10.0.0.1" }] }, authority: OWNER }))
      .toMatchObject({ status: "refused", reason: "unsafe_url" });
  });

  it("clears removed record facts without touching facts absent from the change", () => {
    expect(infoToGoogle({ description: null })).toEqual({ body: { profile: { description: "" } }, updateMask: ["profile"] });
    expect(infoToGoogle({ phone: null, links: null })).toEqual({ body: { phoneNumbers: {}, websiteUri: "" }, updateMask: ["phoneNumbers", "websiteUri"] });
    expect(infoToGoogle({})).toEqual({ body: {}, updateMask: [] });
  });

  it("names drift between the record and Google", () => {
    expect(recordDrift({ hours, phone: "(716) 555-0100" }, { regularHours: { periods: [] }, phoneNumbers: { primaryPhone: "+1 716-555-0100" } }))
      .toEqual(["Google hours differ from your record."]);
  });
});

describe("posts", () => {
  it("creates a post, reads it back, and undo deletes it", async () => {
    const { ctx, google } = context();
    const result = await createListingPost(ctx, {
      post: { topicType: "OFFER", summary: "Free consult in November", event: { title: "November consults", startDate: "2026-11-01", endDate: "2026-11-30" },
        offer: { termsConditions: "New clients only" }, callToAction: { actionType: "BOOK", url: "https://attymooney.example/book" } },
      authority: OWNER,
    });
    expect(result.status).toBe("posted");
    if (result.status !== "posted") return;
    expect(result.receipt.providerRef).toBe("accounts/111/locations/333/localPosts/p1");
    expect((await undoListingChange(ctx, { receiptId: result.receipt.id, authority: UNDO })).status).toBe("posted");
    expect(google.writes).toEqual(["createPost", "deletePost:accounts/111/locations/333/localPosts/p1"]);
  });

  it("refuses an event without dates and a button without a link", async () => {
    const { ctx } = context();
    expect(await createListingPost(ctx, { post: { topicType: "EVENT", summary: "Open house" }, authority: OWNER })).toMatchObject({ reason: "invalid" });
    expect(await createListingPost(ctx, { post: { topicType: "STANDARD", summary: "Hi", callToAction: { actionType: "BOOK" } }, authority: OWNER })).toMatchObject({ reason: "invalid" });
  });

  it("refuses impossible calendar dates and an end before the start without a write", async () => {
    const { ctx, google } = context();
    for (const [startDate, endDate] of [["2026-02-30", "2026-03-01"], ["2026-11-30", "2026-11-01"]] as const) {
      expect(await createListingPost(ctx, { post: { topicType: "EVENT", summary: "Open house", event: { title: "Open house", startDate, endDate } }, authority: OWNER })).toMatchObject({ reason: "invalid" });
    }
    expect(google.writes).toEqual([]);
  });
});

describe("the receipt store", () => {
  it("keeps accepted writes from going back to failed", async () => {
    const store = createMemoryReceiptStore();
    const { receipt } = await store.record({ workspaceId: WORKSPACE, bindingId: null, locationId: "333", action: "reply_post", targetRef: "r", authority: OWNER, before: null, after: null, idempotencyKey: "reply:r:aaaa" });
    await store.settle(receipt.id, WORKSPACE, { status: "posted_unverified", readback: "differs" });
    await expect(store.settle(receipt.id, WORKSPACE, { status: "failed" })).rejects.toThrow("google_receipt_transition_invalid");
    await expect(store.get(receipt.id, "ab000000-0000-4000-8000-000000000099")).resolves.toBeNull();
  });
});

describe("the HTTP client", () => {
  it("reads every page of reviews", async () => {
    const google = fakeGoogle();
    const result = await listAllReviews(google.client, { accountId: "accounts/111", locationId: "333" });
    expect(result.ok && result.data.map((review) => review.reviewId)).toEqual(["rev-dana", "rev-low", "rev-replied"]);
  });

  it("builds v4 and v1 URLs without doubling accounts/, and classifies quota 0", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => ({
      ok: !String(url).includes("localPosts"), status: 403, text: async () => "accessNotConfigured", json: async () => ({ reviewId: "x" }),
    })) as unknown as typeof fetch;
    const client = createHttpGoogleListingClient("token", fetchImpl);
    await client.getReview({ accountId: "accounts/111", locationId: "333" }, "x");
    await client.getLocation({ accountId: "accounts/111", locationId: "333" }, ["regularHours"]);
    const post = await client.createPost({ accountId: "111", locationId: "333" }, {});
    const urls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([url]) => String(url));
    expect(urls[0]).toBe("https://mybusiness.googleapis.com/v4/accounts/111/locations/333/reviews/x");
    expect(urls[1]).toBe("https://mybusinessbusinessinformation.googleapis.com/v1/locations/333?readMask=regularHours");
    expect(urls[2]).toBe("https://mybusiness.googleapis.com/v4/accounts/111/locations/333/localPosts");
    expect(post).toMatchObject({ ok: false, kind: "setup_pending" });
    await expect(client.deletePost("accounts/1/locations/2/localPosts/../../x")).rejects.toThrow("google_post_name_invalid");
  });
});

describe("an agency writing for the business (#255)", () => {
  const AGENCY = { kind: "operator_instruction", actor: "staff@agency.example.test", instructionRef: "instruction-1" } as const;

  it("refuses an operator instruction with no acting-provider check, and writes nothing", async () => {
    const { ctx, google, receipts } = context();
    const result = await postReviewReply(ctx, { reviewId: "rev-dana", text: "Thank you, Dana.", authority: AGENCY });
    expect(result).toMatchObject({ status: "refused", reason: "provider" });
    expect(google.writes).toEqual([]);
    expect(receipts.all()).toHaveLength(0);
  });

  it("refuses when the person is not the acting provider for this location", async () => {
    const { ctx, google, receipts } = context(undefined, { authorizeProvider: async () => { throw new Error("acting_provider_no_mandate"); } });
    expect(await postReviewReply(ctx, { reviewId: "rev-dana", text: "Thank you, Dana.", authority: AGENCY })).toMatchObject({ status: "refused", reason: "provider" });
    expect(google.writes).toEqual([]);
    expect(receipts.all()).toHaveLength(0);
  });

  it("rechecks just before the write; a mandate ended in between stops it with a failed receipt", async () => {
    const authorizeProvider = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new Error("acting_provider_no_mandate"));
    const { ctx, google } = context(undefined, { authorizeProvider });
    const result = await postReviewReply(ctx, { reviewId: "rev-dana", text: "Thank you, Dana.", authority: AGENCY });
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.receipt.status).toBe("failed");
    expect(result.receipt.error).toMatch(/permission ended before the write/);
    expect(google.writes).toEqual([]);
    expect(authorizeProvider).toHaveBeenCalledTimes(2);
  });

  it("writes for the acting provider, checking twice", async () => {
    const authorizeProvider = vi.fn(async () => undefined);
    const { ctx, google } = context(undefined, { authorizeProvider });
    expect((await postReviewReply(ctx, { reviewId: "rev-dana", text: "Thank you, Dana.", authority: AGENCY })).status).toBe("posted");
    expect(google.writes).toEqual(["updateReply:rev-dana"]);
    expect(authorizeProvider).toHaveBeenCalledTimes(2);
  });

  it("leaves the owner's path unchanged: no provider check", async () => {
    const authorizeProvider = vi.fn(async () => { throw new Error("never"); });
    const { ctx } = context(undefined, { authorizeProvider });
    expect((await postReviewReply(ctx, { reviewId: "rev-dana", text: "Thank you, Dana.", authority: OWNER })).status).toBe("posted");
    expect(authorizeProvider).not.toHaveBeenCalled();
  });
});


describe("Google receipt actor presentation", () => {
  it("names the recorded executor and carries agency credit in the string projection", () => {
    expect(receiptHeadline({ status: "posted", action: "hours_patch", actor: { kind: "agency", displayName: "Acme Marketing" } })).toBe("Acme Marketing updated your hours on Google. Runs on Strelva.");
    expect(receiptHeadline({ status: "posted", action: "hours_patch", actor: { kind: "operator", displayName: "Taylor" } })).toBe("Taylor (platform support) updated your hours on Google.");
    expect(receiptHeadline({ status: "posted_unverified", action: "hours_patch", actor: { kind: "agency", displayName: "Acme Marketing" } })).toBe("Acme Marketing posted. Google hasn't shown it yet. Runs on Strelva.");
  });
});
