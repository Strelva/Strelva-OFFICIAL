import { describe, expect, it } from "vitest";

import type { InquiryCapabilityState, InquiryCapabilityStatus, InquiryRecordStatus } from "@/products/inquiries/contracts";
import { hasLiveIntent, inquiryCurrentness } from "@/products/inquiries/currentness";

const BUSINESS = "acme-business";
const CAPABILITY = "cap_inquiry";

function capability(status: InquiryCapabilityStatus, liveVersion: number | null = 2): InquiryCapabilityState {
  return {
    id: CAPABILITY,
    businessId: BUSINESS,
    status,
    live: liveVersion === null ? null : { id: CAPABILITY, businessId: BUSINESS, version: liveVersion } as InquiryCapabilityState["live"],
    previousLive: null,
    activeRequestId: null,
    updatedAt: "2026-09-11T12:00:00.000Z",
  };
}

function check(
  capabilities: InquiryCapabilityState[],
  inquiry: { capabilityId?: string | null; capabilityVersion?: number | null; status?: InquiryRecordStatus | null },
) {
  return inquiryCurrentness({ capabilities }, BUSINESS, inquiry);
}

describe("current inquiry rule", () => {
  it.each([
    ["draft", false],
    ["live_unverified", true],
    ["live", true],
    ["paused", false],
    ["failed", false],
  ] as const)("treats %s as live intent: %s", (status, expected) => {
    expect(hasLiveIntent(status)).toBe(expected);
    const result = check([capability(status)], { capabilityId: CAPABILITY, capabilityVersion: 2, status: "new" });
    expect(result.current).toBe(expected);
    if (!result.current) expect(result).toMatchObject({ reason: "not_live", capturedRevision: 2, liveRevision: 2 });
  });

  it("requires the captured revision to be the live one", () => {
    expect(check([capability("live", 3)], { capabilityId: CAPABILITY, capabilityVersion: 2 }))
      .toEqual({ current: false, reason: "revision_changed", capturedRevision: 2, liveRevision: 3 });
    expect(check([capability("live", 3)], { capabilityId: CAPABILITY, capabilityVersion: null }))
      .toMatchObject({ current: false, reason: "revision_changed" });
  });

  it("requires the inquiry to be open", () => {
    for (const status of ["handled", "blocked"] as const) {
      expect(check([capability("live")], { capabilityId: CAPABILITY, capabilityVersion: 2, status }))
        .toMatchObject({ current: false, reason: "inquiry_closed" });
    }
    for (const status of ["new", "assigned", "follow_up_pending"] as const) {
      expect(check([capability("live")], { capabilityId: CAPABILITY, capabilityVersion: 2, status }).current).toBe(true);
    }
  });

  it("rejects a missing intake, another business's intake, or one with no live definition", () => {
    expect(check([], { capabilityId: CAPABILITY, capabilityVersion: 2 })).toMatchObject({ current: false, reason: "capability_missing" });
    expect(check([{ ...capability("live"), businessId: "other" }], { capabilityId: CAPABILITY, capabilityVersion: 2 }))
      .toMatchObject({ current: false, reason: "capability_missing" });
    expect(check([capability("live", null)], { capabilityId: CAPABILITY, capabilityVersion: 2 }))
      .toMatchObject({ current: false, reason: "not_live", liveRevision: null });
  });

  it("returns the live definition for a current inquiry", () => {
    const result = check([capability("live_unverified")], { capabilityId: CAPABILITY, capabilityVersion: 2 });
    expect(result.current && result.definition.version).toBe(2);
    expect(result.current && result.capability.id).toBe(CAPABILITY);
  });
});
