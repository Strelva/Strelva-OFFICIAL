import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetEvent = vi.fn();
const mockResolveEvent = vi.fn();
const mockClaimEventAction = vi.fn();
const mockFinishEventAction = vi.fn();
const mockUpdateSuggestion = vi.fn();
const mockExecuteAgentPrompt = vi.fn();
const mockGetDraftContent = vi.fn();
const mockGetContent = vi.fn();
const mockSetContent = vi.fn();
const mockAppendVersion = vi.fn();
const mockClearDraft = vi.fn();
const mockRecordSectionUpdate = vi.fn();
const mockRevalidateClientSite = vi.fn();
const mockUpdateBusinessHours = vi.fn();
const mockCreateGbpPost = vi.fn();
const mockPublishReviewReply = vi.fn();

vi.mock("../lib/events", () => ({
  getEvent: (...args: unknown[]) => mockGetEvent(...args),
  // resolveEventAction now reads the Redis-authoritative event via getEventRaw;
  // in tests it returns the same fixture as getEvent.
  getEventRaw: (...args: unknown[]) => mockGetEvent(...args),
  resolveEvent: (...args: unknown[]) => mockResolveEvent(...args),
  claimEventAction: (...args: unknown[]) => mockClaimEventAction(...args),
  finishEventAction: (...args: unknown[]) => mockFinishEventAction(...args),
  markExecutionExternalAccepted: vi.fn(async () => {}),
}));

vi.mock("../lib/suggestions", () => ({
  updateSuggestion: (...args: unknown[]) => mockUpdateSuggestion(...args),
}));

vi.mock("../lib/agent-executor", () => ({
  executeAgentPrompt: (...args: unknown[]) => mockExecuteAgentPrompt(...args),
}));

vi.mock("../lib/storage", () => ({
  getDraftContent: (...args: unknown[]) => mockGetDraftContent(...args),
  getContent: (...args: unknown[]) => mockGetContent(...args),
  setContent: (...args: unknown[]) => mockSetContent(...args),
  appendVersion: (...args: unknown[]) => mockAppendVersion(...args),
  clearDraft: (...args: unknown[]) => mockClearDraft(...args),
  recordSectionUpdate: (...args: unknown[]) => mockRecordSectionUpdate(...args),
  // Staleness guard added by the H4 audit fix; empty = no manual edit after the
  // queued change, so apply proceeds.
  getSectionTimestamps: () => Promise.resolve({}),
}));

vi.mock("../lib/revalidate-client", () => ({
  revalidateClientSite: (...args: unknown[]) => mockRevalidateClientSite(...args),
}));

vi.mock("../lib/ai-auto-approve", () => ({
  recordApproval: vi.fn(() => Promise.resolve(0)),
  recordRejection: vi.fn(() => Promise.resolve()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("../lib/gbp-management", () => ({
  updateBusinessHours: (...args: unknown[]) => mockUpdateBusinessHours(...args),
  createGbpPost: (...args: unknown[]) => mockCreateGbpPost(...args),
}));

vi.mock("../lib/gbp-replies", () => ({
  publishReviewReply: (...args: unknown[]) => mockPublishReviewReply(...args),
}));

import { resolveEventAction } from "../lib/event-actions";

describe("resolveEventAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClaimEventAction.mockResolvedValue({ acquired: true, attemptId: "attempt_1" });
    mockFinishEventAction.mockResolvedValue(undefined);
    mockRevalidateClientSite.mockResolvedValue(undefined);
  });

  it("does not execute suggestion side effects for already resolved events", async () => {
    mockGetEvent.mockResolvedValue({
      id: "evt_1",
      tenantId: "tenant-a",
      type: "suggestion",
      status: "approved",
      metadata: {
        suggestionId: "sug_1",
        actionPrompt: "Update the hero",
      },
    });
    mockResolveEvent.mockResolvedValue({ changed: false });

    const result = await resolveEventAction("tenant-a", "evt_1", "approved");

    expect(result).toEqual({ changed: false, reason: "already_resolved" });
    expect(mockUpdateSuggestion).not.toHaveBeenCalled();
    expect(mockExecuteAgentPrompt).not.toHaveBeenCalled();
    expect(mockClaimEventAction).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant event resolution", async () => {
    mockGetEvent.mockResolvedValue({
      id: "evt_1",
      tenantId: "tenant-b",
      type: "suggestion",
      status: "pending",
    });

    const result = await resolveEventAction("tenant-a", "evt_1", "dismissed");

    expect(result).toEqual({ changed: false, reason: "wrong_tenant" });
    expect(mockResolveEvent).not.toHaveBeenCalled();
  });

  it("executes an approved pending suggestion once", async () => {
    mockGetEvent.mockResolvedValue({
      id: "evt_1",
      tenantId: "tenant-a",
      type: "suggestion",
      status: "pending",
      metadata: {
        suggestionId: "sug_1",
        actionPrompt: "Update Saturday class",
      },
    });
    mockResolveEvent.mockResolvedValue({ changed: true });

    const result = await resolveEventAction("tenant-a", "evt_1", "approved");

    expect(result).toEqual({ changed: true });
    expect(mockUpdateSuggestion).toHaveBeenCalledWith("tenant-a", "sug_1", "accepted");
    expect(mockExecuteAgentPrompt).toHaveBeenCalledWith("tenant-a", "Update Saturday class");
  });

  it("approves queued agent preview content from durable event metadata when draft cache is missing", async () => {
    mockGetEvent.mockResolvedValue({
      id: "evt_1",
      tenantId: "tenant-a",
      type: "content_update",
      status: "pending",
      metadata: {
        kind: "agent_preview",
        section: "contact",
        proposedData: {
          email: "new@example.com",
          locationTitle: "Studio",
          locationDescription: "Street parking nearby.",
          instagramUrl: "",
          facebookUrl: "",
        },
      },
    });
    mockResolveEvent.mockResolvedValue({ changed: true });
    mockGetDraftContent.mockResolvedValue(null);
    mockGetContent.mockResolvedValue({ email: "old@example.com" });

    const result = await resolveEventAction("tenant-a", "evt_1", "approved");

    expect(result).toEqual({ changed: true });
    expect(mockSetContent).toHaveBeenCalledWith(
      "contact",
      {
        email: "new@example.com",
        locationTitle: "Studio",
        locationDescription: "Street parking nearby.",
        instagramUrl: "",
        facebookUrl: "",
      },
      "tenant-a"
    );
    expect(mockClearDraft).toHaveBeenCalledWith("contact", "tenant-a");
    expect(mockSetContent.mock.invocationCallOrder[0]).toBeLessThan(
      mockResolveEvent.mock.invocationCallOrder[0],
    );
  });

  it("does not run an effect when another approver owns the action claim", async () => {
    mockGetEvent.mockResolvedValue({
      id: "evt_busy",
      tenantId: "tenant-a",
      type: "newsletter_draft",
      status: "pending",
      metadata: { subject: "News", body: "Body" },
    });
    mockClaimEventAction.mockResolvedValue({ acquired: false, reason: "action_in_progress" });

    const result = await resolveEventAction("tenant-a", "evt_busy", "approved");

    expect(result).toEqual({ changed: false, reason: "action_in_progress" });
    expect(mockResolveEvent).not.toHaveBeenCalled();
  });

  it("keeps content pending when the authoritative live write fails", async () => {
    mockGetEvent.mockResolvedValue({
      id: "evt_write_fail",
      tenantId: "tenant-a",
      source: "ai",
      type: "content_update",
      status: "pending",
      createdAt: "2026-07-01T00:00:00.000Z",
      metadata: { kind: "agent_preview", section: "contact", proposedData: { email: "new@example.com" } },
    });
    mockGetDraftContent.mockResolvedValue(null);
    mockGetContent.mockResolvedValue({ email: "old@example.com" });
    mockSetContent.mockRejectedValue(new Error("database unavailable"));

    await expect(resolveEventAction("tenant-a", "evt_write_fail", "approved")).rejects.toThrow(
      "database unavailable",
    );
    expect(mockResolveEvent).not.toHaveBeenCalled();
    expect(mockFinishEventAction).toHaveBeenCalledWith(
      "evt_write_fail",
      "attempt_1",
      expect.objectContaining({ state: "failed" }),
    );
  });

  // GBP hours: governed — the real Google write happens on approval, never
  // auto-published, and a failed/invalid write must leave the item pending.
  it("pushes hours to Google then resolves on an approved gbp_hours_draft", async () => {
    mockGetEvent.mockResolvedValue({
      id: "evt_h",
      tenantId: "tenant-a",
      type: "content_update",
      status: "pending",
      metadata: {
        kind: "gbp_hours_draft",
        hours: [{ day: "monday", open: "09:00", close: "17:00" }],
      },
    });
    mockUpdateBusinessHours.mockResolvedValue({ success: true });
    mockResolveEvent.mockResolvedValue({ changed: true });

    const result = await resolveEventAction("tenant-a", "evt_h", "approved");

    expect(result).toEqual({ changed: true });
    expect(mockUpdateBusinessHours).toHaveBeenCalledWith("tenant-a", {
      regularHours: {
        periods: [
          {
            openDay: "MONDAY",
            openTime: { hours: 9, minutes: 0 },
            closeDay: "MONDAY",
            closeTime: { hours: 17, minutes: 0 },
          },
        ],
      },
    });
    expect(mockResolveEvent).toHaveBeenCalledWith("evt_h", "approved", { actor: "user" });
  });

  it("resolves an approved gbp_post_draft even when read-back verification fails (write succeeded — re-approval would duplicate)", async () => {
    mockGetEvent.mockResolvedValue({
      id: "evt_p",
      tenantId: "tenant-a",
      type: "content_update",
      status: "pending",
      metadata: { kind: "gbp_post_draft", summary: "We're open Saturdays now" },
    });
    // Google accepted the post (success) but the read-back couldn't confirm it.
    // createGbpPost has already emitted its own change_verify_failed event; the
    // approval must still resolve so a re-approval can't create a second post.
    mockCreateGbpPost.mockResolvedValue({ success: true, verified: false });
    mockResolveEvent.mockResolvedValue({ changed: true });

    const result = await resolveEventAction("tenant-a", "evt_p", "approved");

    expect(result).toEqual({ changed: true });
    expect(mockCreateGbpPost).toHaveBeenCalledOnce();
    expect(mockResolveEvent).toHaveBeenCalledWith("evt_p", "approved", { actor: "user" });
  });

  it("leaves a gbp_hours_draft pending and skips the Google write when hours are malformed", async () => {
    mockGetEvent.mockResolvedValue({
      id: "evt_h",
      tenantId: "tenant-a",
      type: "content_update",
      status: "pending",
      metadata: { kind: "gbp_hours_draft", hours: [{ day: "monday", open: "nope", close: "17:00" }] },
    });

    const result = await resolveEventAction("tenant-a", "evt_h", "approved");

    expect(result).toEqual({ changed: false, reason: "gbp_hours_invalid" });
    expect(mockUpdateBusinessHours).not.toHaveBeenCalled();
    expect(mockResolveEvent).not.toHaveBeenCalled();
  });

  it("does not resolve a gbp_hours_draft when the Google write fails", async () => {
    mockGetEvent.mockResolvedValue({
      id: "evt_h",
      tenantId: "tenant-a",
      type: "content_update",
      status: "pending",
      metadata: { kind: "gbp_hours_draft", hours: [{ day: "friday", open: "08:00", close: "12:00" }] },
    });
    mockUpdateBusinessHours.mockResolvedValue({ success: false });

    const result = await resolveEventAction("tenant-a", "evt_h", "approved");

    expect(result).toEqual({ changed: false, reason: "gbp_hours_failed" });
    expect(mockResolveEvent).not.toHaveBeenCalled();
  });

  it("does not touch Google when a gbp_hours_draft is dismissed, just resolves it", async () => {
    mockGetEvent.mockResolvedValue({
      id: "evt_h",
      tenantId: "tenant-a",
      type: "content_update",
      status: "pending",
      metadata: { kind: "gbp_hours_draft", hours: [{ day: "monday", open: "09:00", close: "17:00" }] },
    });
    mockResolveEvent.mockResolvedValue({ changed: true });

    const result = await resolveEventAction("tenant-a", "evt_h", "dismissed");

    expect(result).toEqual({ changed: true });
    expect(mockUpdateBusinessHours).not.toHaveBeenCalled();
    expect(mockResolveEvent).toHaveBeenCalledWith("evt_h", "dismissed", { actor: "user" });
  });

  // Review reply: owner approval through the queue publishes to Google, and a
  // failed publish must leave the draft pending (never falsely "handled").
  const reviewDraft = () => ({
    id: "evt_rr",
    tenantId: "tenant-a",
    type: "review",
    status: "pending",
    body: "Thank you!",
    metadata: { kind: "review_reply_draft", reviewId: "rev_9", draftedReply: "Thank you!" },
  });

  it("publishes a review reply to Google then resolves on approval", async () => {
    mockGetEvent.mockResolvedValue(reviewDraft());
    mockPublishReviewReply.mockResolvedValue({ published: true, verified: true });
    mockResolveEvent.mockResolvedValue({ changed: true });

    const result = await resolveEventAction("tenant-a", "evt_rr", "approved");

    expect(result).toEqual({ changed: true });
    expect(mockPublishReviewReply).toHaveBeenCalledWith("tenant-a", "rev_9", "Thank you!");
    expect(mockResolveEvent).toHaveBeenCalledWith("evt_rr", "approved", { actor: "user" });
  });

  it("leaves a review reply pending when the Google publish fails", async () => {
    mockGetEvent.mockResolvedValue(reviewDraft());
    mockPublishReviewReply.mockResolvedValue({ published: false });

    const result = await resolveEventAction("tenant-a", "evt_rr", "approved");

    expect(result).toEqual({ changed: false, reason: "review_reply_failed" });
    expect(mockResolveEvent).not.toHaveBeenCalled();
  });

  it("dismisses a review reply draft without publishing to Google", async () => {
    mockGetEvent.mockResolvedValue(reviewDraft());
    mockResolveEvent.mockResolvedValue({ changed: true });

    const result = await resolveEventAction("tenant-a", "evt_rr", "dismissed");

    expect(result).toEqual({ changed: true });
    expect(mockPublishReviewReply).not.toHaveBeenCalled();
    expect(mockResolveEvent).toHaveBeenCalledWith("evt_rr", "dismissed", { actor: "user" });
  });
});
