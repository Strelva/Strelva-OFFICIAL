import { describe, expect, it, vi } from "vitest";
import { DeliveryCommitmentService } from "@/platform/service-requests/delivery-commitment-service";
import { deliveryCommitmentCommandSchema, deliveryCommitmentSchema, deliveryCommitmentStatus, deliveryReviewUrlSchema, type DeliveryCommitment } from "@/platform/service-requests/delivery-commitment";
import { ServiceRequestValidationError, type ServiceRequest } from "@/platform/service-requests/types";

const actor = { userId: "a9100000-0000-4000-8000-000000000003", verifiedEmail: "operator@example.test" };
const requestId = "a9100000-0000-4000-8000-000000000011";
const base = { action: "delivery_commitment", requestId, expectedRevision: 3, idempotencyKey: "delivery:test" };
const propose = { ...base, change: { kind: "propose", termsReference: "Quote 42", deliveryDefinition: "Tested website at the review URL", inputsReady: true } };
const commitment: DeliveryCommitment = {
  version: 1, status: "running", operatorId: actor.userId, termsReference: "Quote 42",
  deliveryDefinition: "Tested website at the review URL", scope: ["website_delivery"],
  proposedAt: "2026-09-21T12:00:00Z", startedAt: "2026-09-21T12:30:00Z", dueAt: "2026-09-22T12:30:00Z",
  customerAcceptedBy: "a9100000-0000-4000-8000-000000000001", customerAcceptedAt: "2026-09-21T12:30:00Z",
  blocker: null, result: null, decision: null,
};

describe("website delivery commitments", () => {
  it("validates the bounded proposal before calling storage", async () => {
    const saved = { id: requestId } as ServiceRequest;
    const write = vi.fn().mockResolvedValue(saved);
    expect(await new DeliveryCommitmentService(write).execute(actor, propose)).toBe(saved);
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0]![1]).toMatchObject(propose);
    expect(write.mock.calls[0]![1].commandDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps digest stable for exact retries but binds actor, revision, and terms", async () => {
    const write = vi.fn().mockResolvedValue({ id: requestId });
    const service = new DeliveryCommitmentService(write);
    await service.execute(actor, propose);
    await service.execute(actor, propose);
    await service.execute(actor, { ...propose, expectedRevision: 4 });
    await service.execute(actor, { ...propose, change: { ...propose.change, termsReference: "Quote 43" } });
    await service.execute({ ...actor, userId: "a9100000-0000-4000-8000-000000000004" }, propose);
    const hashes = write.mock.calls.map((call) => call[1].commandDigest);
    expect(hashes[0]).toBe(hashes[1]);
    expect(new Set(hashes)).toHaveProperty("size", 4);
  });

  it.each([
    { ...propose, expectedRevision: 0 },
    { ...propose, requestId: "wrong" },
    { ...propose, idempotencyKey: "contains a space" },
    { ...propose, change: { ...propose.change, inputsReady: false } },
    { ...propose, change: { ...propose.change, termsReference: "" } },
    { ...propose, change: { ...propose.change, dueAt: "2026-09-30T00:00:00Z" } },
    { ...propose, change: { kind: "agree", operatorId: actor.userId } },
    { ...propose, change: { kind: "publish" } },
  ])("rejects malformed or authority-expanding commands before storage: %j", async (raw) => {
    const write = vi.fn();
    await expect(new DeliveryCommitmentService(write).execute(actor, raw)).rejects.toBeInstanceOf(ServiceRequestValidationError);
    expect(write).not.toHaveBeenCalled();
  });

  it.each(["agree", "accept_result", "request_changes", "cancel"])("accepts only the defined customer command %s", (kind) => {
    const change = kind === "agree" ? { kind } : { kind, note: "Reviewed the exact result." };
    expect(deliveryCommitmentCommandSchema.safeParse({ ...base, change }).success).toBe(true);
  });

  it("requires full submitted-result evidence", () => {
    const result = {
      websiteBindingId: "a9100000-0000-4000-8000-000000000020", repository: "example/customer-site",
      commitSha: "a".repeat(40), reviewUrl: "https://review.example.com", desktopChecked: true,
      mobileChecked: true, primaryActionChecked: true,
    };
    expect(deliveryCommitmentCommandSchema.safeParse({ ...base, change: { kind: "submit", result } }).success).toBe(true);
    for (const field of ["desktopChecked", "mobileChecked", "primaryActionChecked"] as const) {
      expect(deliveryCommitmentCommandSchema.safeParse({ ...base, change: { kind: "submit", result: { ...result, [field]: false } } }).success).toBe(false);
    }
    expect(deliveryCommitmentCommandSchema.safeParse({ ...base, change: { kind: "submit", result: { ...result, commitSha: "main" } } }).success).toBe(false);
  });

  it.each([
    "http://review.example.com", "https://user:secret@review.example.com", "https://review.example.com?token=secret",
    "https://review.example.com#secret", "https://127.0.0.1", "https://10.1.2.3", "https://192.168.1.1",
    "https://172.16.0.1", "https://169.254.169.254", "https://localhost", "https://app.local",
    "javascript:alert(1)", "https://review.example.com:8443",
  ])("rejects unsafe or token-bearing review links: %s", (value) => {
    expect(deliveryReviewUrlSchema.safeParse(value).success).toBe(false);
  });

  it("accepts a public review path without claiming its contents were verified", () => {
    expect(deliveryReviewUrlSchema.parse("https://preview.example.com/about")).toBe("https://preview.example.com/about");
    expect(deliveryCommitmentSchema.parse(commitment).dueAt).toBe(commitment.dueAt);
  });

  it("derives deadline state without mutating the stored promise", () => {
    const before = JSON.stringify(commitment);
    expect(deliveryCommitmentStatus(commitment, Date.parse("2026-09-22T12:29:59Z"))).toBe("Delivery in progress");
    expect(deliveryCommitmentStatus(commitment, Date.parse("2026-09-22T12:30:00Z"))).toBe("Delivery overdue");
    expect(deliveryCommitmentStatus({ ...commitment, status: "submitted" })).toBe("Ready for customer review");
    expect(deliveryCommitmentStatus({ ...commitment, status: "accepted" })).toBe("Customer accepted this delivery");
    expect(deliveryCommitmentStatus({ ...commitment, status: "cancelled" })).toBe("Delivery cancelled; records retained");
    expect(deliveryCommitmentStatus({ ...commitment, status: "proposed", startedAt: null, dueAt: null })).toBe("Scope and terms need your acceptance");
    expect(deliveryCommitmentStatus({ ...commitment, blocker: { note: "Logo needed", actorId: actor.userId, at: commitment.proposedAt } }, Date.parse("2026-09-21T15:00:00Z"))).toBe("Blocked; deadline unchanged");
    expect(JSON.stringify(commitment)).toBe(before);
  });
});
