/**
 * Global kill-switch for ALL outbound customer/prospect email.
 *
 * Sending is OFF unless `EMAIL_SENDING_ENABLED === "true"`. This is intentional:
 * email stays paused during the scaffoldweb -> strelva domain cutover and while
 * the live tenants are still test accounts, so nothing goes out until it's
 * deliberately switched on in prod. Every guarded send logs loudly when it
 * suppresses, so a paused pipeline is never a silent mystery (the opposite of
 * the unset-env bugs this codebase has been burned by).
 *
 * To resume: set EMAIL_SENDING_ENABLED=true in Vercel prod and do a fresh
 * `vercel deploy --prod` (env changes need a fresh deploy, not a redeploy).
 */
export function emailSendingEnabled(): boolean {
  return process.env.EMAIL_SENDING_ENABLED === "true";
}

/**
 * True when sending is paused. Convenience inverse for guard sites that read
 * better as an early-return.
 */
export function emailSendingPaused(): boolean {
  return !emailSendingEnabled();
}

/**
 * OPERATOR notifications (new signup, lead intake, failed payment) are on a
 * SEPARATE switch from the client `emailSendingPaused()` gate above. Operators
 * (Noah + Jacob) must keep getting alerted about what's happening even while
 * customer/prospect email stays paused during the test-tenant phase — that's
 * the entire point of an operator notification. So this DEFAULTS ON and is only
 * silenced by an explicit `OPERATOR_EMAILS_ENABLED="false"` (a deliberate kill
 * switch), never by the unset-env default that pauses client mail.
 */
export function operatorEmailsEnabled(): boolean {
  return process.env.OPERATOR_EMAILS_ENABLED !== "false";
}

/**
 * True when operator notifications are explicitly disabled. Convenience inverse
 * for guard sites that read better as an early-return.
 */
export function operatorEmailsPaused(): boolean {
  return !operatorEmailsEnabled();
}

/**
 * END-CUSTOMER transactional email — e.g. a booking confirmation sent to the studio's
 * CUSTOMER, not to the studio owner. This is a THIRD category, distinct from both the
 * client `emailSendingPaused()` gate (owner/prospect mail) and `operatorEmailsEnabled()`
 * (Noah/Jacob alerts): no existing sender ever emailed a tenant's end customer. It DEFAULTS
 * OFF (set `CUSTOMER_EMAIL_ENABLED="true"` to enable) so turning it on is a deliberate call,
 * per AGENTS.md ("the kill-switch guards all send sites"). Until then, any surface that
 * promised the email (e.g. the booking widget) must tell the truth about not having sent it.
 */
export function customerEmailEnabled(): boolean {
  return process.env.CUSTOMER_EMAIL_ENABLED === "true";
}

/**
 * True when end-customer transactional email is paused. Convenience inverse.
 */
export function customerEmailPaused(): boolean {
  return !customerEmailEnabled();
}
