import { describe, expect, it } from "vitest";
import { activationStepSchema } from "@/platform/make-real/contracts";
import { assertExtendedProviderReference, activationProviderReferenceSchema, googleProviderReferenceSchema } from "@/platform/make-real/google-provider-reference";
const businessId = "10000000-0000-4000-8000-000000000001", receiptId = "10000000-0000-4000-8000-000000000002";
const request = { tenantId: `workspace-${businessId}`, locationId: "native-place", eventId: "native-approved-event", draftDigest: "a".repeat(64) };
const ref = JSON.stringify({ businessId, request, receiptId });
describe("durable Google provider reference checkpoint", () => {
  it("retains exact native and historical JSON references beyond 240 through receipt parsing", () => {
    for (const tenantId of [request.tenantId, "legacy-frozen-tenant"]) {
      const providerRef = JSON.stringify({ businessId, request: { ...request, tenantId }, receiptId });
      expect(providerRef.length).toBeGreaterThan(240);
      const parsed = activationStepSchema.parse({ id: "effect:google", kind: "effect", target: "google", label: "Google", dependsOn: [], reversibility: "compensable", idempotencyKey: "exact-approved-event", status: "completed", effect: "accepted", attempts: 1, receipt: { providerRef, adapterMode: "live", acceptedAt: "2026-10-09T00:00:00.000Z" } });
      expect(parsed.receipt?.providerRef).toBe(providerRef);
      expect(googleProviderReferenceSchema.parse(JSON.parse(parsed.receipt!.providerRef!)).request.draftDigest).toBe(request.draftDigest);
    }
  });
  it("rejects overwritten duplicate-key provider content before durable storage", () => {
    const duplicate = `{\"businessId\":${JSON.stringify(businessId)},\"request\":{\"providerContent\":\"private payload\"},\"request\":${JSON.stringify(request)},\"receiptId\":${JSON.stringify(receiptId)}}`;
    expect(activationProviderReferenceSchema.safeParse(duplicate).success).toBe(false);
    expect(() => assertExtendedProviderReference(duplicate, businessId, { channel: "google_listing", request })).toThrow();
  });
  it("binds extended references to the declared channel, business and exact request", () => {
    expect(() => assertExtendedProviderReference(ref, businessId, { channel: "google_listing", request })).not.toThrow();
    for (const channel of ["calendar", "payment", "internal_app", undefined]) expect(() => assertExtendedProviderReference(ref, businessId, { channel, request })).toThrow();
    expect(() => assertExtendedProviderReference(ref, receiptId, { channel: "google_listing", request })).toThrow();
    for (const field of ["tenantId", "locationId", "eventId", "draftDigest"]) expect(() => assertExtendedProviderReference(ref, businessId, { channel: "google_listing", request: { ...request, [field]: field === "draftDigest" ? "b".repeat(64) : "other" } })).toThrow();
    expect(() => assertExtendedProviderReference("historical-opaque", businessId, undefined)).not.toThrow();
  });
  it("compares nested native grant pins structurally and rejects generation drift", () => {
    const native = { ...request, nativeGrant: { bindingId: receiptId, accountId: "accounts/exact", grantGeneration: "a".repeat(64) } };
    const canonical = JSON.stringify({ businessId, request: native, receiptId });
    expect(() => assertExtendedProviderReference(canonical, businessId, { channel: "google_listing", request: JSON.parse(JSON.stringify(native)) })).not.toThrow();
    expect(() => assertExtendedProviderReference(canonical, businessId, { channel: "google_listing", request: { ...native, nativeGrant: { ...native.nativeGrant, grantGeneration: "b".repeat(64) } } })).toThrow();
  });
  it("keeps other references bounded and rejects provider content or corrupted Google metadata", () => {
    expect(activationProviderReferenceSchema.safeParse("x".repeat(240)).success).toBe(true);
    for (const value of ["x".repeat(241), JSON.stringify({ ...JSON.parse(ref), content: "provider payload" }), JSON.stringify({ ...JSON.parse(ref), receiptId: "wrong" }), ref + "x", JSON.stringify({ businessId, request: { ...request, draftDigest: "wrong" }, receiptId })]) expect(activationProviderReferenceSchema.safeParse(value).success).toBe(false);
    const maximallyEscaped = JSON.stringify({ businessId, request: { tenantId: "\u0001".repeat(200), locationId: "\u0001".repeat(64), eventId: "\u0001".repeat(200), draftDigest: "a".repeat(64) }, receiptId });
    expect(maximallyEscaped.length).toBeLessThan(4096);
    expect(activationProviderReferenceSchema.safeParse(maximallyEscaped).success).toBe(true);
  });
});
