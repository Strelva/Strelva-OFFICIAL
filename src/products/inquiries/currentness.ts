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
  ResponsibilityPolicy,
} from "./contracts";

export function hasLiveIntent(status: InquiryCapabilityStatus): boolean {
  return status === "live" || status === "live_unverified";
}

/** Pausing handling must not close the published form. The legacy projection
 * stays unchanged until the durable inquiry-record rollout is enabled. */
export function inquiryPausedIntakeEnabled(environment: Partial<Record<string, string | undefined>> = process.env): boolean {
  return environment.STRELVA_INQUIRY_RECORDS?.trim() === "1" && environment.DUAL_WRITE_PG !== "0";
}

export function hasInquiryIntakeIntent(status: InquiryCapabilityStatus): boolean {
  return hasLiveIntent(status) || (status === "paused" && inquiryPausedIntakeEnabled());
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

/** Record-only authority. Customer messages keep using inquiryCurrentness,
 * which requires live handling; this seam only retains validated intake. */
export function inquiryIntakeCurrentness(
  state: Pick<InquiryEngineState, "capabilities">,
  businessId: string,
  inquiry: { capabilityId?: string | null; capabilityVersion?: number | null },
): InquiryCurrentness {
  const current = inquiryCurrentness(state, businessId, inquiry);
  if (current.current || current.reason !== "not_live" || !inquiryPausedIntakeEnabled()) return current;
  const capability = state.capabilities.find((item) => item.id === inquiry.capabilityId && item.businessId === businessId);
  if (capability?.status !== "paused" || !capability.live || capability.live.version !== inquiry.capabilityVersion) return current;
  return { current: true, capability, definition: capability.live };
}

/**
 * The inquiry intake's current responsibility. Newest created wins: the engine
 * puts each new responsibility at the front, while updatedAt moves on every
 * receipt, pause and promotion, so ordering by it would switch policies after
 * routine activity. Ties keep state order.
 */
export function currentResponsibility(
  responsibilities: readonly ResponsibilityPolicy[],
  capabilityId: string | null | undefined,
  expectedId?: string,
): ResponsibilityPolicy | null {
  let selected: ResponsibilityPolicy | null = null;
  for (const item of responsibilities) {
    if (!capabilityId || item.capabilityId !== capabilityId || (expectedId && item.id !== expectedId)) continue;
    if (!selected || Date.parse(item.createdAt) > Date.parse(selected.createdAt)) selected = item;
  }
  return selected;
}
