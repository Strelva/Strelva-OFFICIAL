/**
 * Server entry point for the domain-monitor product.
 *
 * Domain scanning and alert summarization remain in the shared monitoring
 * library because they are also used by the uptime surfaces. Alert delivery
 * belongs to this product boundary: the cron only supplies the actionable
 * result and a destination for the operator board.
 */

import { sendEmail } from "@/platform/infra/email/send";
import { resolveLeadNotifyRecipients } from "@/lib/delivery-email";
import { domainMonitorPaperEmail, type DomainAlertLine } from "./email";

export type { DomainAlertLine } from "./email";

/**
 * Operator notice: fires when a monitored client domain goes down (parked,
 * 4xx/5xx, unreachable, or a suspicious blank body), when a domain is within
 * 30 days of registry expiry, and once when everything recovers. Born from the
 * Orange Crate outage (registrar payment failed, GoDaddy parking page).
 * Gates on operatorEmailsEnabled() (on by default), independent of the client
 * email pause. Recipients default to the operators. Fails soft: returns false
 * on any error so it can never affect the cron's 200.
 */
export async function sendDomainAlertEmail(params: {
  down: DomainAlertLine[];
  expiring: DomainAlertLine[];
  boardUrl: string;
  logPrefix?: string;
}): Promise<boolean> {
  try {
    const paper = domainMonitorPaperEmail(params);
    return await sendEmail({
      audience: "operator",
      to: resolveLeadNotifyRecipients(),
      subject: paper.subject,
      options: { heading: paper.subject, preheader: paper.preheader, paper },
    });
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Domain-alert email failed:`, err);
    return false;
  }
}
