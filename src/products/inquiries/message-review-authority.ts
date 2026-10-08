import { inquiryRecordsEnabled, inquiryRecordsRpc } from "@/platform/infra/inquiry-records";
import { tenantEventRevision, commitmentSignals } from "@/platform/needs-you";
import type { ResponsibilityPolicy } from "./contracts";
import { metadataFromEvent } from "./message-review-event";
import { assertResponsibilitySponsor, throwCode } from "./delivery-approval-primitives";
import type { InquiryMessageReviewAction } from "./delivery-approval-contract";

type ReviewEvent = Parameters<typeof tenantEventRevision>[0];
type EventAction = "approved" | "dismissed";
export interface InquiryActorAuthorityDependencies {
  ownerLinkAuthorized?: (tenantId: string, event: ReviewEvent, actorId: string, eventAction?: EventAction) => Promise<boolean>;
  operatorReviewAuthorized?: (tenantId: string, actorId: string) => Promise<boolean>;
}
const authorityEnabled = () => process.env.STRELVA_INQUIRY_OWNER_NOTICES === "1" && inquiryRecordsEnabled();

/** Actor labels grant nothing. The recorded decision binds a signed owner to
 * this exact source revision and distinguishes approval from Not yet. */
export async function authorizeSignedInquiryMessageDecision(input: {
  tenantId: string; event: ReviewEvent; actorId: string; eventAction: EventAction; deps?: InquiryActorAuthorityDependencies;
}): Promise<boolean> {
  if (!authorityEnabled() || !input.actorId.startsWith("owner-link:") || input.event.tenantId !== input.tenantId
    || input.event.status !== "pending" || !metadataFromEvent(input.event)) return false;
  try {
    if (input.deps?.ownerLinkAuthorized) return await input.deps.ownerLinkAuthorized(input.tenantId,input.event,input.actorId,input.eventAction);
    return await inquiryRecordsRpc("authorize_inquiry_owner_link_message_action", {
      p_tenant_id: input.tenantId, p_event_id: input.event.id, p_revision: tenantEventRevision(input.event),
      p_recipient: input.actorId.slice("owner-link:".length), p_action: input.eventAction,
    }) === true;
  } catch { return false; }
}

/** Current source, responsibility and role authority for the immutable message.
 * The caller separately verifies the rendered payload and current decision route. */
export async function bindInquiryReviewActor(input: {
  tenantId: string; businessId: string; inquiryId: string; action: InquiryMessageReviewAction; actorId: string;
  responsibility: ResponsibilityPolicy; event?: ReviewEvent; eventAction?: EventAction; deps: InquiryActorAuthorityDependencies;
}): Promise<{ ownerDecisionActor?: string; operatorReviewActor?: string }> {
  if (input.responsibility.sponsorId === input.actorId) return {};
  if (input.actorId.startsWith("owner-link:") && input.event) {
    if (!await authorizeSignedInquiryMessageDecision({tenantId:input.tenantId,event:input.event,actorId:input.actorId,eventAction:input.eventAction??"approved",deps:input.deps})) {
      throwCode("permission_denied", "This message has no current approved owner decision.");
    }
    return { ownerDecisionActor: input.actorId };
  }
  if (input.event) {
    const metadata = metadataFromEvent(input.event);
    if (!authorityEnabled() || input.event.tenantId !== input.tenantId || input.event.status !== "pending" || !metadata
      || input.event.metadata?.reviewAudience !== "operator" || metadata.requestedBy !== input.responsibility.sponsorId || input.responsibility.trust !== "supervised"
      || metadata.businessId !== input.businessId || metadata.inquiryId !== input.inquiryId || metadata.action !== input.action
      || commitmentSignals(`${metadata.subject}\n${metadata.messageBody}`).length > 0
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.actorId)) {
      throwCode("permission_denied", "This message has no current delegated operator review authority.");
    }
    const authorized = await (input.deps.operatorReviewAuthorized ?? (async (tenantId, actorId) =>
      await inquiryRecordsRpc("authorize_inquiry_operator_actor", { p_tenant_id: tenantId, p_actor_id: actorId }) === true
    ))(input.tenantId,input.actorId).catch(() => false);
    if (!authorized) throwCode("permission_denied", "This message has no current operator approval.");
    return { operatorReviewActor: input.actorId };
  }
  assertResponsibilitySponsor(input.responsibility,input.actorId);
  return {};
}
