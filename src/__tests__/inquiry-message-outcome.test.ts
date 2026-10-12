import { describe, expect, it } from "vitest";
import { classifyInquiryMessage } from "@/products/inquiries/message-outcome";

const acceptance = { acceptedAt: "2026-09-11T16:05:00.000Z", providerMessageId: "provider-1" };

describe("classifyInquiryMessage", () => {
  it.each([
    // Accepted is final: every provider report leaves the message accepted.
    [{ status: "accepted" }, { accepted: true, delivery: "unconfirmed", retryAllowed: false }],
    [{ status: "accepted_unverified" }, { accepted: true, delivery: "unconfirmed", retryAllowed: false }],
    [{ status: "verified" }, { accepted: true, delivery: "confirmed", retryAllowed: false }],
    [{ status: "delivered" }, { accepted: true, delivery: "delivered", retryAllowed: false }],
    [{ status: "deferred" }, { accepted: true, delivery: "deferred", retryAllowed: false }],
    [{ status: "bounced" }, { accepted: true, delivery: "undeliverable", retryAllowed: false }],
    [{ status: "suppressed" }, { accepted: true, delivery: "undeliverable", retryAllowed: false }],
    [{ status: "failed", providerOutcome: "failed" }, { accepted: true, delivery: "undeliverable", retryAllowed: false }],
    [{ status: "failed", ...acceptance }, { accepted: true, delivery: "undeliverable", retryAllowed: false }],
    [{ status: "reconciliation_required", ...acceptance }, { accepted: true, delivery: "unconfirmed", retryAllowed: false }],
    // An attempt may have reached the provider: treated as possibly accepted.
    [{ status: "sending" }, { accepted: false, delivery: "unknown", retryAllowed: false }],
    [{ status: "unknown" }, { accepted: false, delivery: "unknown", retryAllowed: false }],
    [{ status: "reconciliation_required" }, { accepted: false, delivery: "unknown", retryAllowed: false }],
    // Never accepted: only these may have another attempt.
    [{ status: "failed" }, { accepted: false, delivery: "none", retryAllowed: true }],
    [{ status: "retry_exhausted" }, { accepted: false, delivery: "none", retryAllowed: true }],
    [{ status: "blocked" }, { accepted: false, delivery: "none", retryAllowed: true }],
  ] as const)("classifies %j", (input, expected) => {
    expect(classifyInquiryMessage(input)).toEqual(expected);
  });
});
