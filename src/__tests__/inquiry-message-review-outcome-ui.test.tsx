// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InquiryMessageReview } from "@/experience/inquiries/InquiryMessageReview";
import type { InquiryMessageReviewPreview } from "@/experience/inquiries/message-review-contract";
import { classifyInquiryMessageOutcome } from "@/products/inquiries/message-outcome";

const review: InquiryMessageReviewPreview = {
  reviewToken: "review-token",
  inquiryId: "inquiry-1",
  action: "reply",
  recipient: "customer@example.com",
  subject: "We received your message for Alder Realty",
  body: "Hi Sam,\n\nAlder Realty received your message.",
  messageDigest: "d".repeat(64),
  policyVersion: "responsibility-v2",
  capabilityId: "capability-1",
  capabilityVersion: 3,
  preparedAt: "2026-09-11T16:00:00.000Z",
  expiresAt: "2026-09-11T17:00:00.000Z",
};

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

/** Render the review, approve it, and return the screen after the server's outcome lands. */
async function approveWithOutcome(outcome: Record<string, unknown>): Promise<HTMLElement> {
  const request = vi.fn(async () => new Response(JSON.stringify({ outcome }), { status: 200, headers: { "Content-Type": "application/json" } }));
  const node = document.createElement("div");
  document.body.appendChild(node);
  const root = createRoot(node);
  roots.push(root);
  await act(async () => {
    root.render(createElement(InquiryMessageReview, {
      tenantId: "tenant-a",
      inquiryId: review.inquiryId,
      initialReview: review,
      request,
    }));
  });
  const form = node.querySelector("form");
  expect(form).not.toBeNull();
  await act(async () => {
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(request).toHaveBeenCalledTimes(1);
  return node;
}

const base = { inquiryId: review.inquiryId, action: review.action };
const accepted = { acceptedAt: "2026-09-11T16:05:00.000Z", providerMessageId: "provider-1" };

describe("message review outcome after the provider accepted the message", () => {
  it("tells the owner a deferred message needs nothing and offers no new review", async () => {
    const node = await approveWithOutcome({ ...base, ...accepted, status: "deferred", retryable: true });
    expect(node.textContent).toContain("The provider is still trying to deliver this message.");
    expect(node.textContent).toContain("Nothing to do");
    expect(node.textContent).not.toContain("Prepare a new review");
    expect(node.textContent).not.toContain("failed attempt");
  });

  it.each([
    ["bounced", { ...base, ...accepted, status: "bounced", retryable: false }],
    ["suppressed", { ...base, ...accepted, status: "suppressed", retryable: false }],
    ["failed by the provider after acceptance", { ...base, ...accepted, status: "failed", retryable: true }],
  ])("explains a %s message was accepted but not delivered and offers no new review", async (_label, outcome) => {
    const node = await approveWithOutcome(outcome);
    expect(node.textContent).toContain("accepted but not delivered");
    expect(node.textContent).toContain("Contact the customer another way");
    expect(node.textContent).not.toContain("Prepare a new review");
    expect(node.textContent).not.toContain("failed attempt");
  });

  it("uses the server's delivery classification when the outcome carries one", async () => {
    const node = await approveWithOutcome({ ...base, status: "failed", retryable: false, delivery: "undeliverable", retryAllowed: false });
    expect(node.textContent).toContain("accepted but not delivered");
    expect(node.textContent).not.toContain("Prepare a new review");
  });

  it("explains a different message already went out and offers no new review", async () => {
    // The route classifies the server outcome before the screen sees it.
    const server = { ...base, status: "blocked", reason: "different_message_already_sent", retryable: false };
    const routed = { ...server, ...classifyInquiryMessageOutcome(server) };
    expect(routed.retryAllowed).toBe(false);
    const node = await approveWithOutcome(routed);
    expect(node.textContent).toContain("A different reply was already sent for this inquiry.");
    expect(node.textContent).not.toContain("different_message_already_sent");
    expect(node.textContent).not.toContain("Prepare a new review");
  });

  it("still offers a new review for a rejected message the provider never accepted", async () => {
    const node = await approveWithOutcome({ ...base, status: "failed", reason: "Provider refused the request.", retryable: true });
    expect(node.textContent).toContain("Message delivery failed.");
    expect(node.textContent).toContain("Prepare a new review");
  });
});
