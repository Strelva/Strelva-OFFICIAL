/** Compatibility path: legacy site/review/billing copy and platform-owned booking/operator notices. */
import { workspacePorts } from "./workspace-ports";
import type { BookingConfirmationInput, BookingOwnerNoticeInput, NewIntakeLeadInput, NewSignupInput, PaymentFailedInput } from "@/platform/infra/email/notice-contracts";
export type { IntakeLeadFields } from "@/platform/infra/email/notice-contracts";
export { sendUpdateLiveEmail, sendWelcomeEmail, sendSiteLiveEmail, sendHealthRegressionEmail } from "./delivery-email/site-lifecycle";
export { sendPaymentPastDueEmail } from "./delivery-email/billing";
export { sendNewLeadEmail, sendDeliveryStatusEmail } from "./delivery-email/leads";
export { sendReviewRequestEmail, sendReviewNeedsReplyEmail } from "./delivery-email/reviews";
export { sendOpsDigestEmail, type OpsDigestAtRisk } from "@/lib/ops-digest-email";

/** Legacy synchronous API for the platform-owned operator recipient rule. */
export function resolveLeadNotifyRecipients(): string[] {
  return workspacePorts().operatorNoticeRecipients().resolveLeadNotifyRecipients();
}

/** Legacy API; the owning platform module keeps the complete send behavior. */
export async function sendBookingConfirmation(params: BookingConfirmationInput): Promise<boolean> {
  try {
    return await (await workspacePorts().bookingEmails()).sendBookingConfirmation(params);
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Booking confirmation failed:`, err);
    return false;
  }
}

/** Legacy API; the owning platform module keeps the complete send behavior. */
export async function sendNewBookingOwnerEmail(params: BookingOwnerNoticeInput): Promise<boolean> {
  try {
    return await (await workspacePorts().bookingEmails()).sendNewBookingOwnerEmail(params);
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} New-booking email failed:`, err);
    return false;
  }
}

/** Legacy API; the owning platform module keeps the complete send behavior. */
export async function sendNewIntakeLeadEmail(params: NewIntakeLeadInput): Promise<boolean> {
  try {
    return await (await workspacePorts().operatorNotices()).sendNewIntakeLeadEmail(params);
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} New-intake-lead email failed:`, err);
    return false;
  }
}

/** Legacy API; the owning platform module keeps the complete send behavior. */
export async function sendNewSignupEmail(params: NewSignupInput): Promise<boolean> {
  try {
    return await (await workspacePorts().operatorNotices()).sendNewSignupEmail(params);
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} New-signup email failed:`, err);
    return false;
  }
}

/** Legacy API; the owning platform module keeps the complete send behavior. */
export async function sendPaymentFailedEmail(params: PaymentFailedInput): Promise<boolean> {
  try {
    return await (await workspacePorts().operatorNotices()).sendPaymentFailedEmail(params);
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Payment-failed email failed:`, err);
    return false;
  }
}
