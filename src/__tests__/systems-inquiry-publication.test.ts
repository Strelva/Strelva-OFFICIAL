import { describe, expect, it } from "vitest";
import { inquiryPublicationObservation } from "@/experience/systems/server";
import type { InquiryWorkspaceSnapshot } from "@/products/inquiries/server";

const OLD = "2026-09-01T12:00:00.000Z";
const NEW = "2026-10-08T12:00:00.000Z";
function snapshot(forms: Array<{ id: string; version?: number; verified?: boolean; checkedAt?: string; receiptVersion?: number; live?: boolean }>): InquiryWorkspaceSnapshot {
  // Only publication evidence is relevant to this read-only projection.
  return { state: {
    capabilities: forms.map(form => ({ id: form.id, live: form.live === false ? null : { version: form.version ?? 2 } })),
    changes: forms.flatMap(form => form.verified === undefined ? [] : [{ capabilityId: form.id, verification: { version: form.receiptVersion ?? form.version ?? 2, verified: form.verified, checkedAt: form.checkedAt ?? NEW } }]),
  } } as InquiryWorkspaceSnapshot;
}
const good = { id: "first", verified: true };
describe("all live inquiry forms publication evidence", () => {
  it.each([false, true])("does not hide a failed sibling, reversed=%s", reverse => {
    const forms = [good, { id: "second", verified: false }];
    expect(inquiryPublicationObservation("system", snapshot(reverse ? forms.reverse() : forms)).outcome).toBe("fail");
  });
  it("does not hide an unchecked sibling or a receipt for an older version", () => {
    for (const second of [{ id: "second" }, { id: "second", verified: true, receiptVersion: 1 }]) {
      expect(inquiryPublicationObservation("system", snapshot([good, second]))).toMatchObject({ outcome: "unknown", observedAt: null });
    }
  });
  it("uses the oldest readback so a fresh form cannot hide stale evidence", () => {
    expect(inquiryPublicationObservation("system", snapshot([good, { id: "second", verified: true, checkedAt: OLD }]))).toMatchObject({ outcome: "pass", observedAt: OLD });
  });
  it("requires a valid date for every successful readback", () => {
    expect(inquiryPublicationObservation("system", snapshot([good, { id: "second", verified: true, checkedAt: "invalid" }]))).toMatchObject({ outcome: "unknown", observedAt: null });
  });
  it("keeps failure visible alongside missing evidence", () => {
    expect(inquiryPublicationObservation("system", snapshot([{ id: "unchecked" }, { id: "failed", verified: false }])).outcome).toBe("fail");
  });
  it("does not require readback for a capability with no live definition", () => {
    expect(inquiryPublicationObservation("system", snapshot([good, { id: "draft", live: false }])).outcome).toBe("pass");
    expect(inquiryPublicationObservation("system", snapshot([])).outcome).toBe("unknown");
    expect(inquiryPublicationObservation("system", null).outcome).toBe("unknown");
  });
});
