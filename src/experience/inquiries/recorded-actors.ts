import { ACTOR_NOT_RECORDED, actorPresentation, recordedActor } from "@/platform/presentation/actor";
import type { InquirySurfaceSnapshot } from "./contracts";
import type { ReceiptActor } from "@/products/inquiries/contracts";

/** Legacy receipt labels are action-time snapshots, never current account names. */
export function inquiryActorLabel(actor: ReceiptActor): string {
  const snapshot = actor.kind === "strelva"
    ? recordedActor({ kind: "platform" })
    : (actor.kind === "person" || actor.kind === "customer") && actor.label?.trim()
      ? recordedActor({ kind: "person", displayName: actor.label })
      : null;
  const { name, credit } = actorPresentation(snapshot);
  return name ? `${name}${credit ? ` · ${credit}` : ""}` : ACTOR_NOT_RECORDED;
}

/** Resolve only retained identities in the receipt's own request and form scope. */
export function inquiryChangeActorLabels(
  snapshot: InquirySurfaceSnapshot,
  receipt: Pick<InquirySurfaceSnapshot["state"]["changes"][number], "actorIds" | "requestId" | "capabilityId" | "businessId" | "createdAt" | "updatedAt">,
): string {
  const startedAt = Date.parse(receipt.createdAt), endedAt = Date.parse(receipt.updatedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return ACTOR_NOT_RECORDED;
  const labels = [...new Set(receipt.actorIds)].map(id => {
    const candidates = snapshot.state.actionReceipts.filter(event => event.businessId === receipt.businessId
      && event.requestId === receipt.requestId && event.capabilityId === receipt.capabilityId && event.actor.id === id
      && Number.isFinite(Date.parse(event.createdAt)) && Date.parse(event.createdAt) >= startedAt && Date.parse(event.createdAt) <= endedAt);
    const names = [...new Set(candidates.map(event => inquiryActorLabel(event.actor)).filter(name => name !== ACTOR_NOT_RECORDED))];
    // Conflicting snapshots do not establish one historical display identity.
    return names.length === 1 ? names[0]! : ACTOR_NOT_RECORDED;
  });
  return [...new Set(labels)].join(" · ") || ACTOR_NOT_RECORDED;
}
