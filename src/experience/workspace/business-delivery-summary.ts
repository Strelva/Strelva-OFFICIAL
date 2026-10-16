import type { ServiceRequest } from "@/platform/service-requests/types";
import { recordedActor, type RecordedActor } from "@/platform/presentation/actor";
import { deliveryCommitmentStatus } from "@/platform/service-requests/delivery-commitment";

/**
 * Where a request stands, in the owner's words. A request is only agreed work
 * once scope and deadline are accepted; before that it is "asked".
 */
export type BusinessRequestStage = "asked" | "needs_you" | "in_progress" | "ready_for_review" | "done" | "closed";

export interface BusinessDeliveryItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  attention: boolean;
  handling: boolean;
  stage: BusinessRequestStage;
  /** Who is doing the work. Agency names resolve where the caller knows them. */
  provider: ServiceRequest["provider"];
  /** Recorded serving agency, returned with the read; unrelated to viewer membership. */
  servingAgencyName?: string | null;
  dueAt: string | null;
  updatedAt: string;
  /** The delivery the agency recorded for this request, when there is one (its decision's source). */
  deliveryId?: string | null;
  /** XA · O5. The System the request is about, when the ask named one. */
  systemId?: string | null;
  /** Who asked, as recorded when the request was made. Absent stays unnamed. */
  askedBy?: RecordedActor | null;
  createdAt?: string;
}

export const REQUEST_STAGE_LABELS: Record<BusinessRequestStage, string> = {
  asked: "Asked",
  needs_you: "Needs you",
  in_progress: "In progress",
  ready_for_review: "Ready for your review",
  done: "Done",
  closed: "Closed",
};

export function requestStage(request: ServiceRequest): BusinessRequestStage {
  if (request.status === "withdrawn" || request.providerAcceptance.status === "declined") return "closed";
  const commitment = request.deliveryCommitment;
  if (request.providerAcceptance.status !== "accepted" || !commitment) return "asked";
  if (commitment.status === "proposed") return "needs_you";
  if (commitment.status === "submitted") return "ready_for_review";
  if (commitment.status === "accepted") return "done";
  if (commitment.status === "cancelled") return "closed";
  return "in_progress";
}

/** Display persisted authority and work state. A pending request is not execution. */
export function businessDeliveryItems(requests: readonly ServiceRequest[], agencyNames: ReadonlyMap<string, string | null> = new Map()): BusinessDeliveryItem[] {
  return requests.filter(request => request.status !== "draft").map(request => {
    const commitment = request.deliveryCommitment;
    const stage = requestStage(request);
    const detail = commitment ? deliveryCommitmentStatus(commitment)
      : request.status === "withdrawn" ? "Request withdrawn"
      : request.providerAcceptance.status === "declined" ? "Agency declined the request"
      : request.providerAcceptance.status === "accepted" ? "Accepted for review; no delivery deadline agreed"
      : "Awaiting agency review; delivery has not started";
    return {
      id: request.id,
      title: request.outcome,
      detail,
      href: `/workspace/delivery/${request.id}`,
      attention: stage === "needs_you" || stage === "ready_for_review",
      handling: stage === "in_progress",
      stage,
      provider: request.provider,
      servingAgencyName: agencyNames.get(request.id) ?? null,
      dueAt: commitment?.dueAt ?? null,
      updatedAt: request.updatedAt,
      deliveryId: request.deliveryId,
      systemId: typeof request.context?.systemId === "string" ? request.context.systemId : null,
      askedBy: recordedActor(request.context?.actor),
      createdAt: request.createdAt,
    };
  });
}

/** One lifecycle, with the awaited person named at each zoom. */
export function requestStageLabel(stage: BusinessRequestStage, audience: { businessName: string; agencyName?: string; agencySeat?: boolean }): string {
  if (audience.agencySeat && (stage === "needs_you" || stage === "ready_for_review")) return `Waiting on ${audience.businessName}`;
  if (audience.agencySeat && stage === "asked") return audience.agencyName ? `Ready for ${audience.agencyName}'s review` : "Agency identity unavailable";
  return REQUEST_STAGE_LABELS[stage];
}
