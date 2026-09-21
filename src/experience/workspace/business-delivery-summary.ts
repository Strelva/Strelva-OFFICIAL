import type { ServiceRequest } from "@/platform/service-requests/types";
import { deliveryCommitmentStatus } from "@/platform/service-requests/delivery-commitment";

export interface BusinessDeliveryItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  attention: boolean;
  handling: boolean;
}
/** Display persisted authority and work state. A pending request is not execution. */
export function businessDeliveryItems(requests: readonly ServiceRequest[]): BusinessDeliveryItem[] {
  return requests.filter(request => request.status !== "draft").map(request => {
    const commitment = request.deliveryCommitment;
    const active = request.status === "requested" && request.providerAcceptance.status === "accepted";
    const attention = Boolean(active && commitment && ["proposed", "submitted"].includes(commitment.status));
    const handling = Boolean(active && commitment && ["running", "changes_requested"].includes(commitment.status));
    const detail = commitment ? deliveryCommitmentStatus(commitment)
      : request.status === "withdrawn" ? "Request withdrawn"
      : request.providerAcceptance.status === "declined" ? "Provider declined the request"
      : request.providerAcceptance.status === "accepted" ? "Accepted for review; no delivery deadline agreed"
      : "Awaiting provider review; delivery has not started";
    return { id: request.id, title: request.outcome, detail, href: `/workspace/delivery/${request.id}`, attention, handling };
  });
}
