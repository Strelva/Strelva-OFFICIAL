import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InquiryMessageReview, messageReviewCompletionCopy } from "@/experience/inquiries/InquiryMessageReview";
import type { InquiryMessageReviewOutcome, InquiryMessageReviewPreview } from "@/experience/inquiries/message-review-contract";

const review: InquiryMessageReviewPreview = {
  reviewToken: "review-token",
  inquiryId: "inquiry-1",
  action: "reply",
  recipient: "customer@example.com",
  subject: "We received your message for Alder Realty",
  body: "Hi Sam,\n\nAlder Realty received your message.\n\nThis is an automatic confirmation.",
  messageDigest: "d".repeat(64),
  policyVersion: "responsibility-v2",
  capabilityId: "capability-1",
  capabilityVersion: 3,
  preparedAt: "2026-09-11T16:00:00.000Z",
  expiresAt: "2026-09-11T17:00:00.000Z",
};

function render(initialReview = review): string {
  return renderToStaticMarkup(createElement(InquiryMessageReview, {
    tenantId: "tenant-a",
    businessId: "business-a",
    inquiryId: review.inquiryId,
    initialReview,
    autoPrepare: false,
  }));
}

describe("InquiryMessageReview", () => {
  it("renders the exact server-provided recipient, subject, and body before approval", () => {
    const html = render();
    expect(html).toContain("Review before sending");
    expect(html).toContain("customer@example.com");
    expect(html).toContain("We received your message for Alder Realty");
    expect(html).toContain("Hi Sam,\n\nAlder Realty received your message.");
    expect(html).toContain("Send this message");
    expect(html).toContain("Prepare again");
    expect(html).toContain("data-review-recipient");
    expect(html).toContain("data-review-subject");
    expect(html).toContain("data-review-body");
  });

  it("keeps preparation explicit when a record has no server-hydrated review", () => {
    const html = renderToStaticMarkup(createElement(InquiryMessageReview, {
      tenantId: "tenant-a",
      inquiryId: review.inquiryId,
      autoPrepare: false,
    }));
    expect(html).toContain("Review current message");
    expect(html).not.toContain("Send this message");
  });

  it("does not render a review from another inquiry", () => {
    const html = renderToStaticMarkup(createElement(InquiryMessageReview, {
      tenantId: "tenant-a",
      inquiryId: review.inquiryId,
      initialReview: { ...review, inquiryId: "other-inquiry" },
      autoPrepare: false,
    }));
    expect(html).toContain("belongs to another inquiry");
    expect(html).toContain("Review current message");
    expect(html).not.toContain("customer@example.com");
  });

  it("does not display an approval control when the provider accepted without verification", () => {
    const outcome: InquiryMessageReviewOutcome = {
      inquiryId: review.inquiryId,
      action: review.action,
      status: "accepted_unverified",
      reason: "provider read-back unavailable",
      retryable: false,
    };
    const copy = messageReviewCompletionCopy(outcome);
    expect(copy.title).toContain("accepted");
    expect(copy.detail).toContain("Do not retry");
    expect(outcome.retryable).toBe(false);
  });

  it("keeps ambiguous provider outcomes from claiming acceptance", () => {
    const copy = messageReviewCompletionCopy({
      inquiryId: review.inquiryId,
      action: review.action,
      status: "reconciliation_required",
      retryable: false,
    });
    expect(copy.title).toBe("We could not confirm what happened to this message.");
    expect(copy.title).not.toContain("accepted");
    expect(copy.detail).toContain("Do not send it again");
  });

  it("distinguishes provider delivery failures from a message that was never sent", () => {
    expect(messageReviewCompletionCopy({ inquiryId: review.inquiryId, action: review.action, status: "bounced", retryable: false }).title).toContain("bounce");
    expect(messageReviewCompletionCopy({ inquiryId: review.inquiryId, action: review.action, status: "deferred", retryable: true }).title).toContain("deferred");
    expect(messageReviewCompletionCopy({ inquiryId: review.inquiryId, action: review.action, status: "suppressed", retryable: false }).title).toContain("suppressed");
  });

  it("keeps unknown expiry honest instead of inventing a deadline", () => {
    expect(render({ ...review, expiresAt: null })).toContain("No expiry recorded");
  });
});
