import { notifyPreparedInquiryDecision } from "./decision-notice";
import { createHash } from "node:crypto";
import { copyInquiryEvent, inquiryRecordsRpc } from "@/platform/infra/inquiry-records";
import { deliverInquiryAction, getInquiryDeliveryMessageDigest, inquirySubmissionFromLead, normalizeInquiryRoutingPolicy, resolveInquiryRoute, type LeadRecord } from "./delivery";
import type { InquiryDeliveryDependencies, InquiryDeliveryResult, InquiryRoute, ResponsibilityDeliveryGate } from "./delivery-types";
import { inquiryReleaseEnabledForTenant } from "./release";
import { customerEmailEnabled, emailSendingEnabled } from "@/platform/infra/email/enabled";
import { getClientEmailOverride } from "@/platform/infra/email/client-override";

export function inquiryOwnerNoticesEnabled(): boolean {
  return process.env.STRELVA_INQUIRY_OWNER_NOTICES === "1";
}

export interface OwnerNoticeDependencies {
  gates?: (tenantId: string) => Promise<boolean>;
  released?: (tenantId: string) => Promise<boolean>;
  route?: (tenantId: string) => Promise<InquiryRoute>;
  delivery?: InquiryDeliveryDependencies;
  record?: typeof copyInquiryEvent;
}

export async function inquiryNoticeEmailGates(tenantId: string): Promise<boolean> {
  return emailSendingEnabled() && customerEmailEnabled()
    && await getClientEmailOverride(tenantId) !== "off";
}

export function originalNoticeInquiryId(inquiryId: string): string {
  return inquiryId.replace(/_notice_repair_[a-f0-9]{32}$/, "");
}

function recipientDigest(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/** A notice is not an owner decision. Intake and this notice survive a pause
 * of customer handling. Both the release switch and the shared client-email
 * gate must allow it; the inquiry delivery store claims it only once. */
export async function notifyInquiryOwner(input: { tenantId: string; lead: LeadRecord }, deps: OwnerNoticeDependencies = {}): Promise<InquiryDeliveryResult> {
  if (inquiryOwnerNoticesEnabled() && await (deps.released ?? inquiryReleaseEnabledForTenant)(input.tenantId).catch(() => false)) {
    const combined = await notifyPreparedInquiryDecision(input.tenantId, input.lead).catch(() => "none");
    if (combined !== "none") return { inquiryId: input.lead.id, tenantId: input.tenantId, action: "owner_notification",
      status: combined === "sent" ? "accepted_unverified" : combined === "suppressed" ? "suppressed" : "unavailable",
      reason: "notice_in_owner_decision_email", retryable: false };
  }
  return deliverOwnerNotice(input, deps);
}

async function deliverOwnerNotice(input: { tenantId: string; lead: LeadRecord }, deps: OwnerNoticeDependencies, repair?: { originalId: string; actorId: string }): Promise<InquiryDeliveryResult> {
  const base = { inquiryId: input.lead.id, tenantId: input.tenantId, action: "owner_notification" as const, retryable: false };
  if (!inquiryOwnerNoticesEnabled()) return { ...base, status: "disabled", reason: "owner_notices_off" };
  if (!(await (deps.released ?? inquiryReleaseEnabledForTenant)(input.tenantId).catch(() => false))) {
    return { ...base, status: "disabled", reason: "inquiries_not_released" };
  }
  const inquiry = inquirySubmissionFromLead(input.tenantId, input.lead);
  const policy = { version: "inquiry-owner-notice-v1", ownerNotification: "send" as const, paused: false };
  let destinationDigest: string | null = null;
  const route = async (): Promise<InquiryRoute> => {
    const result = deps.route ? await deps.route(input.tenantId) : await resolveInquiryRoute(inquiry, normalizeInquiryRoutingPolicy(policy));
    destinationDigest = result.ownerEmail ? recipientDigest(result.ownerEmail) : null;
    return result;
  };
  let result: InquiryDeliveryResult;
  try {
    if (!(await (deps.gates ?? inquiryNoticeEmailGates)(input.tenantId))) {
      result = { ...base, status: "suppressed", reason: "email_gates_closed" };
    } else {
    result = await deliverInquiryAction(inquiry, "owner_notification", {
      policy,
      deps: {
        ...deps.delivery,
        resolveRoute: route,
        getPolicy: async () => policy,
        getResponsibilityGate: async (_tenant, _inquiry, action, message): Promise<ResponsibilityDeliveryGate> => {
          // Fixed notice authority, never a customer message authorization.
          const now = deps.delivery?.now?.() ?? new Date();
          return { allowed: true, action, evaluation: null,
            budget: { limit: 10_000, timezone: "UTC", policyVersion: policy.version, now: now.toISOString() },
            approval: { inquiryId: inquiry.id, action, explicit: true, actorId: repair?.actorId ?? "strelva:owner-notice", policyVersion: policy.version,
              approvedAt: now.toISOString(), messageDigest: getInquiryDeliveryMessageDigest(message),
              capabilityId: inquiry.capabilityId, capabilityVersion: inquiry.capabilityVersion } };
        },
      },
    });
    }
  } catch {
    result = { ...base, status: "unavailable", reason: "owner_notice_unavailable" };
  }
  await (deps.record ?? copyInquiryEvent)({ tenantId: input.tenantId, inquiryId: repair?.originalId ?? input.lead.id, kind: "delivery", actor: "system",
    detail: { ownerNotice: true, action: "owner_notification", status: result.status, reason: result.reason ?? null,
      recipientDigest: destinationDigest, repairActorId: repair?.actorId ?? null,
      acceptedAt: result.acceptedAt ?? null, providerMessageId: result.providerMessageId ?? null },
    dedupeKey: `owner-notice:${input.lead.id}:${result.status}:${result.providerMessageId ?? "unsent"}`,
  }).catch(() => "failed");
  return result;
}

/** The app authenticates the operator; SQL independently requires an active
 * verified super admin. A fresh purpose belongs only to the corrected notice,
 * leaving every customer reply acceptance closed. */
export async function repairInquiryOwnerNotice(input: { tenantId: string; lead: LeadRecord; actorId: string }, deps: OwnerNoticeDependencies & { authorize?: typeof inquiryRecordsRpc } = {}): Promise<InquiryDeliveryResult> {
  const base = { inquiryId: input.lead.id, tenantId: input.tenantId, action: "owner_notification" as const, retryable: false };
  if (!inquiryOwnerNoticesEnabled()) return { ...base, status: "disabled", reason: "owner_notices_off" };
  if (!(await (deps.released ?? inquiryReleaseEnabledForTenant)(input.tenantId))) return { ...base, status: "disabled", reason: "inquiries_not_released" };
  const inquiry = inquirySubmissionFromLead(input.tenantId, input.lead);
  const route = deps.route ? await deps.route(input.tenantId) : await resolveInquiryRoute(inquiry);
  if (!route.ownerEmail) return { ...base, status: "unavailable", reason: "recipient_unavailable" };
  const digest = recipientDigest(route.ownerEmail);
  const authorized = await (deps.authorize ?? inquiryRecordsRpc)("authorize_inquiry_owner_notice_repair", {
    p_tenant_id: input.tenantId, p_lead_id: input.lead.id, p_actor_id: input.actorId, p_recipient_digest: digest,
  });
  if (authorized !== true) return { ...base, status: "paused", reason: "correct_owner_recipient_before_resending" };
  const purposeLead = { ...input.lead, id: `${input.lead.id}_notice_repair_${digest.slice(0,32)}`, createdAt: (deps.delivery?.now?.() ?? new Date()).toISOString() };
  const result = await deliverOwnerNotice({ tenantId: input.tenantId, lead: purposeLead }, { ...deps,
    route: async () => {
      const fresh = deps.route ? await deps.route(input.tenantId) : await resolveInquiryRoute(inquiry);
      if (!fresh.ownerEmail || recipientDigest(fresh.ownerEmail) !== digest) throw new Error("owner_recipient_changed");
      return fresh;
    },
  }, { originalId: input.lead.id, actorId: input.actorId });
  return { ...result, inquiryId: input.lead.id };
}
