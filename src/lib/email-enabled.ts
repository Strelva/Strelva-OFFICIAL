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
