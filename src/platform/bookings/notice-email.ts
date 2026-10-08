import { renderEmailHtml, renderEmailText, type EmailOptions, type EmailRow } from "@/platform/infra/email/layout";
import { sendEmail } from "@/platform/infra/email/send";
import { cleanSubjectText } from "@/platform/infra/email/text";
import { logSentEmailToCrm } from "@/platform/infra/email/sent-activity";

function buildBookingConfirmationOptions(params: {
  clientName: string;
  serviceName: string;
  date: string;
  time: string;
  businessName: string;
}): EmailOptions {
  const business = cleanSubjectText(params.businessName);
  const withBusiness = business ? ` with ${business}` : "";
  const rows: EmailRow[] = [
    { label: "Service", value: cleanSubjectText(params.serviceName) },
    { label: "Date", value: cleanSubjectText(params.date) },
    { label: "Time", value: cleanSubjectText(params.time) },
  ];
  return {
    preheader: `Your ${cleanSubjectText(params.serviceName)} booking${withBusiness} is confirmed.`,
    heading: "You're booked",
    paragraphs: [
      `Hi ${cleanSubjectText(params.clientName) || "there"}, your booking${withBusiness} is confirmed. Here are the details:`,
      "Need to change or cancel? Just reply to this email.",
    ],
    rows,
    footerNote: business ? `For ${business}` : undefined,
  };
}

/**
 * Booking confirmation — sent to the studio's END CUSTOMER (the person who booked), not the
 * owner. This is the ONLY end-customer transactional send in the codebase, so it sits behind
 * its OWN gate, `customerEmailPaused()` (default off), distinct from the owner/prospect pause.
 * Fails soft: returns false on pause / missing key / Resend error so it can never block a
 * booking that already committed.
 */
export async function sendBookingConfirmation(params: {
  to: string;
  clientName: string;
  serviceName: string;
  date: string;
  time: string;
  businessName: string;
  /** When set, a real send is logged to this tenant's CRM comms timeline. */
  tenantId?: string;
  logPrefix?: string;
}): Promise<boolean> {
  try {
    const business = cleanSubjectText(params.businessName);
    // Send "from" the studio's name when we have it, but always over the verified domain.
    const fromName = business || "Strelva";
    const opts = buildBookingConfirmationOptions(params);

    const sent = await sendEmail({
      audience: "customer",
      fromName,
      to: params.to,
      subject: business ? `Your booking with ${business} is confirmed` : "Your booking is confirmed",
      options: opts,
    });
    if (!sent) return false;
    await logSentEmailToCrm(params.tenantId, "Sent: booking confirmation");
    return true;
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Booking confirmation failed:`, err);
    return false;
  }
}

function buildNewBookingOwnerEmailOptions(params: {
  customerName: string;
  customerEmail?: string;
  serviceName: string;
  when: string;
  dashboardUrl: string;
}): EmailOptions {
  const rows = [
    { label: "Who", value: cleanSubjectText(params.customerName) },
    { label: "What", value: cleanSubjectText(params.serviceName) },
    { label: "When", value: cleanSubjectText(params.when) },
  ];
  if (params.customerEmail) rows.push({ label: "Email", value: cleanSubjectText(params.customerEmail) });
  return {
    heading: "New booking",
    paragraphs: ["Someone booked through your website. It's confirmed and on your schedule."],
    rows,
    button: { label: "See your bookings", url: params.dashboardUrl },
  };
}

/**
 * "New booking" to the business's owner recipient (bookings spec,
 * notifications table): a notice, sent once when a visitor's booking is
 * confirmed. A booking *request* is a Needs you item instead, emailed by
 * Needs you, so the owner never gets two emails for one booking. The caller
 * resolves the address through the owner-recipient rule
 * (src/lib/owner-recipient.ts). Fails soft: returns false on any error so it
 * can never undo a booking that is already kept.
 */
export async function sendNewBookingOwnerEmail(params: {
  email: string;
  siteName: string;
  booking: { customerName: string; customerEmail?: string; serviceName: string; when: string };
  dashboardUrl: string;
  tenantId?: string;
  logPrefix?: string;
}): Promise<boolean> {
  try {
    const options = buildNewBookingOwnerEmailOptions({ ...params.booking, dashboardUrl: params.dashboardUrl });
    const sent = await sendEmail({
      audience: "client",
      tenantId: params.tenantId,
      to: params.email,
      subject: `New booking: ${cleanSubjectText(params.booking.customerName)}, ${cleanSubjectText(params.booking.when)}`,
      html: renderEmailHtml(options),
      text: renderEmailText(options),
    });
    if (!sent) return false;
    await logSentEmailToCrm(params.tenantId, "Sent: new-booking email");
    return true;
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} New-booking email failed:`, err);
    return false;
  }
}

