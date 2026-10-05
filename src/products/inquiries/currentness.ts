/**
 * The one currentness rule for inquiries. Message review approval, the
 * follow-up sweep, the receive seam and the storefront projection all read it.
 *
 * A current inquiry is still open, its inquiry intake has live intent, and its
 * captured revision is the live one. Live intent is `live` or
 * `live_unverified`: the owner meant this revision to be on the website, and
 * the storefront already serves it before read-back confirms it. Requiring
 * `live` alone would block every inquiry after each publish until
 * verification lands, and forever if it never does.
 */

import type {
  InquiryCapabilityDefinition,
  InquiryCapabilityState,
  InquiryCapabilityStatus,
  InquiryEngineState,
  InquiryRecordStatus,
} from "./contracts";

export function hasLiveIntent(status: InquiryCapabilityStatus): boolean {
  return status === "live" || status === "live_unverified";
}

export type InquiryCurrentness =
  | { current: true; capability: InquiryCapabilityState; definition: InquiryCapabilityDefinition }
  | {
      current: false;
      reason: "capability_missing" | "not_live" | "revision_changed" | "inquiry_closed";
      capturedRevision: number | null;
      liveRevision: number | null;
    };

export function isOpenInquiryStatus(status: InquiryRecordStatus): boolean {
  return status !== "handled" && status !== "blocked";
}

/**
 * Decide whether an inquiry is current. `status` is the inquiry's handling
 * status; leave it out for a submission that is being received right now.
 */
export function inquiryCurrentness(
  state: Pick<InquiryEngineState, "capabilities">,
  businessId: string,
  inquiry: {
    capabilityId?: string | null;
    capabilityVersion?: number | null;
    status?: InquiryRecordStatus | null;
  },
): InquiryCurrentness {
  const capturedRevision = Number.isSafeInteger(inquiry.capabilityVersion) ? inquiry.capabilityVersion as number : null;
  const capabilityId = typeof inquiry.capabilityId === "string" ? inquiry.capabilityId.trim() : "";
  const capability = capabilityId
    ? state.capabilities.find((item) => item.id === capabilityId && item.businessId === businessId)
    : undefined;
  if (!capability) return { current: false, reason: "capability_missing", capturedRevision, liveRevision: null };
  const liveRevision = capability.live?.version ?? null;
  if (!capability.live || !hasLiveIntent(capability.status)) {
    return { current: false, reason: "not_live", capturedRevision, liveRevision };
  }
  if (capturedRevision === null || capturedRevision !== liveRevision) {
    return { current: false, reason: "revision_changed", capturedRevision, liveRevision };
  }
  if (inquiry.status && !isOpenInquiryStatus(inquiry.status)) {
    return { current: false, reason: "inquiry_closed", capturedRevision, liveRevision };
  }
  return { current: true, capability, definition: capability.live };
}
