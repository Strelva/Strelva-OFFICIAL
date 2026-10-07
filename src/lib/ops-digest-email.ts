import type { EmailOptions, EmailRow } from "@/platform/infra/email/layout";
import { sendEmail } from "@/platform/infra/email/send";
import { cleanSubjectText } from "@/platform/infra/email/text";
import { resolveLeadNotifyRecipients } from "@/lib/delivery-email";

/** One at-risk client line in the ops digest: business name + its top reason. */
export interface OpsDigestAtRisk {
  name: string;
  reason: string;
}

function buildOpsDigestEmailOptions(params: {
  totalLeads: number;
  unworkedLeads: number;
  atRisk: OpsDigestAtRisk[];
  recentSignups: string[];
  opsUrl: string;
}): EmailOptions {
  const plural = (n: number) => (n === 1 ? "" : "s");
  const rows: EmailRow[] = [
    { label: "Unworked leads", value: `${params.unworkedLeads} of ${params.totalLeads}` },
    { label: "At-risk clients", value: String(params.atRisk.length) },
  ];
  // One row per at-risk client (name → top reason), capped so a bad day can't
  // blow the email up.
  for (const client of params.atRisk.slice(0, 12)) {
    rows.push({ label: cleanSubjectText(client.name), value: cleanSubjectText(client.reason) });
  }
  rows.push({
    label: "New signups (7d)",
    value: params.recentSignups.length
      ? params.recentSignups.map((n) => cleanSubjectText(n)).join(", ")
      : "None",
  });
  const summary =
    `${params.unworkedLeads} unworked lead${plural(params.unworkedLeads)} of ${params.totalLeads} total · ` +
    `${params.atRisk.length} client${plural(params.atRisk.length)} at risk · ` +
    `${params.recentSignups.length} new signup${plural(params.recentSignups.length)} this week.`;
  return {
    heading: "Strelva daily ops",
    paragraphs: [summary],
    rows,
    button: { label: "Open the ops board", url: params.opsUrl },
    footerNote: "Operator notification",
  };
}

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
