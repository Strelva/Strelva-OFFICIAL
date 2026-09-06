/**
 * Server entry point for the domain-monitor product.
 *
 * Domain scanning and alert summarization remain in the shared monitoring
 * library because they are also used by the uptime surfaces. Alert delivery
 * belongs to this product boundary: the cron only supplies the actionable
 * result and a destination for the operator board.
 */

import { cleanSubjectText } from "@/lib/email/text";
import { sendEmail } from "@/lib/email/send";
import { resolveLeadNotifyRecipients } from "@/lib/delivery-email";

export interface DomainAlertLine {
  siteName: string;
  host: string;
  problem: string;
}

/**
 * "Strelva site alert" — fires when a monitored client domain goes DOWN (parked,
 * 4xx/5xx, unreachable, or a suspicious blank body) or a domain is within 30
 * days of registry expiry. Born from the Orange Crate outage (registrar payment
 * failed → GoDaddy parking page). OPERATOR notification: gates on
 * operatorEmailsEnabled() (ON by default), independent of the client email
 * pause. Recipients default to the operators via resolveLeadNotifyRecipients().
 * Fails soft: returns false on any error so it can never affect the cron's 200.
 */
export async function sendDomainAlertEmail(params: {
  down: DomainAlertLine[];
  expiring: DomainAlertLine[];
  boardUrl: string;
  logPrefix?: string;
}): Promise<boolean> {
  try {
    const { down, expiring } = params;
    const plural = (n: number) => (n === 1 ? "" : "s");
    const recovered = down.length === 0 && expiring.length === 0;

    const rows: { label: string; value: string }[] = [];
    for (const d of down) {
      rows.push({
        label: `DOWN · ${cleanSubjectText(d.siteName)}`,
        value: `${d.host} — ${cleanSubjectText(d.problem)}`,
      });
    }
    for (const e of expiring) {
      rows.push({
        label: `Expiring · ${cleanSubjectText(e.siteName)}`,
        value: `${e.host} — ${cleanSubjectText(e.problem)}`,
      });
    }

    const heading = recovered
      ? "Strelva sites recovered"
      : down.length
        ? `${down.length} Strelva site${plural(down.length)} DOWN`
        : "Strelva domain expiring soon";

    const summary = recovered
      ? "All monitored sites are back up and no domains are within 30 days of expiry."
      : `${down.length} site${plural(down.length)} down · ${expiring.length} domain${plural(expiring.length)} expiring within 30 days.`;

    const subject = recovered
      ? "Strelva: all monitored sites recovered"
      : down.length
        ? `Strelva ALERT: ${down.length} site${plural(down.length)} DOWN`
        : `Strelva: ${expiring.length} domain${plural(expiring.length)} expiring soon`;

    return await sendEmail({
      audience: "operator",
      to: resolveLeadNotifyRecipients(),
      subject,
      options: {
        preheader: summary,
        heading,
        paragraphs: [summary],
        rows: rows.length ? rows : undefined,
        button: { label: "Open uptime board", url: params.boardUrl },
        footerNote: "Operator notification · domain monitor",
      },
    });
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Domain-alert email failed:`, err);
    return false;
  }
}
