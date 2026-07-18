import {
  customerEmailPaused,
  emailSendingPaused,
  operatorEmailsEnabled,
  prospectEmailsEnabled,
} from "@/lib/email-enabled";
import { renderEmailHtml, renderEmailText, type EmailOptions } from "@/lib/email/layout";

/** The four people Strelva can address. These are relationship roles, not
 * interchangeable synonyms: each has an independent delivery policy. */
export type EmailAudience = "client" | "customer" | "operator" | "prospect";

type RenderedEmail =
  | { options: EmailOptions; html?: never; text?: never }
  | { options?: never; html: string; text: string };

export type SendEmailInput = RenderedEmail & {
  audience: EmailAudience;
  fromName?: string;
  subject: string;
  to: string | string[];
  /** Where replies land. Defaults to the real hello@strelva.com inbox so a
   * client replying to a report/receipt reaches a human, not the send-only
   * updates.strelva.com domain (which has no inbox). Override per-send for
   * e.g. sales replies. */
  replyTo?: string;
};

function audienceEnabled(audience: EmailAudience): boolean {
  if (audience === "operator") return operatorEmailsEnabled();
  if (audience === "prospect") return prospectEmailsEnabled();
  if (audience === "customer") return !customerEmailPaused();
  return !emailSendingPaused();
}

/**
 * Single transport boundary for Strelva mail. Audience gates live here so a
 * new sender cannot accidentally use the client pause for operator mail (or
 * bypass the customer-specific opt-in). Returns false for intentional
 * suppression/missing configuration and throws provider failures to the
 * caller's fail-soft logging boundary.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  if (!audienceEnabled(input.audience)) {
    console.warn(`[email] ${input.audience} email disabled — skipped send`);
    return false;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const fromDomain = process.env.RESEND_DOMAIN || "updates.strelva.com";
  const html = input.options ? renderEmailHtml(input.options) : input.html;
  const text = input.options ? renderEmailText(input.options) : input.text;
  const fromName = input.fromName || "Strelva";
  const replyTo = input.replyTo || process.env.REPLY_TO_EMAIL || "hello@strelva.com";

  const result = await resend.emails.send({
    from: `${fromName} <hello@${fromDomain}>`,
    replyTo,
    to: input.to,
    subject: input.subject,
    html,
    text,
  });
  if (result.error || !result.data?.id) {
    throw new Error(result.error?.message || "Resend did not return an email id.");
  }
  return true;
}
