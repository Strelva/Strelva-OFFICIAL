/**
 * Compatibility entry point for tenant delivery notices. Each concern owns
 * its copy and orchestration under ./delivery-email; all sends still use the
 * shared platform email transport and its audience/tenant/provider gates.
 * Keep this path stable for route callers and their existing mock seams.
 */
export {
  sendUpdateLiveEmail,
  sendWelcomeEmail,
  sendSiteLiveEmail,
  sendHealthRegressionEmail,
} from "./delivery-email/site-lifecycle";
export { sendBookingConfirmation, sendNewBookingOwnerEmail } from "./delivery-email/bookings";
export { sendPaymentPastDueEmail, sendNewSignupEmail, sendPaymentFailedEmail } from "./delivery-email/billing";
export {
  sendNewLeadEmail,
  sendNewIntakeLeadEmail,
  sendDeliveryStatusEmail,
  type IntakeLeadFields,
} from "./delivery-email/leads";
export { sendReviewRequestEmail, sendReviewNeedsReplyEmail } from "./delivery-email/reviews";
export { resolveLeadNotifyRecipients } from "./delivery-email/operator-recipients";
export { sendOpsDigestEmail, type OpsDigestAtRisk } from "@/lib/ops-digest-email";
