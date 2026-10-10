import { buildOpsDigestEmailOptions, type OpsDigestAtRisk } from "@/platform/infra/email/ops-digest";
import { sendEmail } from "@/platform/infra/email/send";
import { resolveLeadNotifyRecipients } from "@/lib/delivery-email";

export type { OpsDigestAtRisk };

/**
 * "Strelva daily ops" — one digest a day summarizing the portfolio for the
 * operators (Noah + Jacob): unworked leads, at-risk clients (with the top
 * reason), and recent signups. OPERATOR notification: gates on
 * operatorEmailsEnabled() (ON by default), independent of the client email
 * pause. Recipients default to jacob@strelva.com via resolveLeadNotifyRecipients().
 * Fails soft: returns false on any error so a failed digest can never affect the
 * cron's 200.
 */
export async function sendOpsDigestEmail(params: {
  totalLeads: number;
  unworkedLeads: number;
  atRisk: OpsDigestAtRisk[];
  recentSignups: string[];
  opsUrl: string;
  logPrefix?: string;
}): Promise<boolean> {
  try {
    const opts = buildOpsDigestEmailOptions(params);

    return await sendEmail({
      audience: "operator",
      to: resolveLeadNotifyRecipients(),
      subject: "Strelva daily ops",
      options: opts,
    });
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Ops-digest email failed:`, err);
    return false;
  }
}
