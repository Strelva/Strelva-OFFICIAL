import { ownerDecisionSchema } from "../../src/platform/needs-you/contracts";
export const workspaceId = "a0000000-0000-4000-8000-000000000001";
export const fictionalAsk = ownerDecisionSchema.parse({
  id: "d0000000-0000-4000-8000-000000000001", workspaceId, systemId: null, kind: "customer.commitment", route: "owner_decides",
  title: "Review the fictional consultation reply", detail: "The consultation is $150.", approveEffect: "The reply sends.", notYetEffect: "Nothing sends.",
  sourceLifecycle: "tenant_event", sourceId: "fictional:reply", revisionHash: "a".repeat(64), urgent: true, signInRequired: false, adminMayDecide: true,
  openHref: null, state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null,
  deliveryState: "suppressed", operatorNote: null, openedAt: "2026-10-09T11:00:00Z", expiresAt: "2026-10-20T11:00:00Z",
  reminded1At: null, reminded2At: null, deliveries: [], review: ["Complete fictional reply."],
});
export function needsYouBrowserRead(state: "partial" | "known" | "complete") {
  return { role: "owner" as const, items: state === "known" ? [fictionalAsk] : [], complete: state === "complete", handled: [], handledAvailable: state !== "partial" };
}
