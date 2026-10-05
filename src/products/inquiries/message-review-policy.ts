import type { InquiryCapabilityDefinition, ResponsibilityPolicy } from "./contracts";
import { normalizeInquiryRoutingPolicy, type InquiryRoutingPolicy } from "./delivery";
import type { InquiryMessageReviewAction } from "./delivery-approval-contract";
import { policyVersionFor } from "./delivery-approval-primitives";

/** The routing policy a reviewed inquiry message is sent under. */
export function policyFor(
  definition: InquiryCapabilityDefinition,
  responsibility: ResponsibilityPolicy,
  action?: InquiryMessageReviewAction,
): InquiryRoutingPolicy {
  const followUp = definition.followUp;
  return normalizeInquiryRoutingPolicy({
    version: policyVersionFor(responsibility),
    paused: false,
    autoReply: {
      mode: "approval",
      enabled: true,
      delayHours: 0,
      budgetHours: 24,
      maxAttempts: 1,
    },
    followUp: followUp
      ? {
          mode: "approval",
          enabled: true,
          delayHours: followUp.afterMinutes / 60,
          budgetHours: Math.max(24, followUp.afterMinutes / 60 + 24),
          maxAttempts: followUp.maxAttempts,
          messageTemplate: followUp.messageTemplate,
        }
      : {
          mode: "off",
          enabled: false,
          delayHours: 0,
          budgetHours: 24,
          maxAttempts: 1,
        },
    // The capture path may send a legacy notice, but an explicit review action
    // is its own governed message. It is enabled only while building the owner
    // notification preview, so reply/follow-up previews cannot duplicate it.
    ownerNotification: action === "owner_notification" ? "send" : "legacy",
  });
}
