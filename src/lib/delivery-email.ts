import {
  buildDeliveryStatusEmailHtml,
  buildDeliveryStatusEmailText,
} from "@/lib/access-request-delivery";

function cleanSubjectText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function sendDeliveryStatusEmail(params: {
  businessName: string;
  email: string;
  statusUrl: string;
  logPrefix?: string;
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromDomain = process.env.RESEND_DOMAIN || "updates.scaffoldweb.com";
    const subjectBusinessName = cleanSubjectText(params.businessName);

    const result = await resend.emails.send({
      from: `Scaffold Web <hello@${fromDomain}>`,
      to: params.email,
      subject: `We received ${subjectBusinessName}'s site request`,
      html: buildDeliveryStatusEmailHtml({
        businessName: params.businessName,
        statusUrl: params.statusUrl,
      }),
      text: buildDeliveryStatusEmailText({
        businessName: params.businessName,
        statusUrl: params.statusUrl,
      }),
    });
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "Resend did not return an email id.");
    }
    return true;
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Delivery status email failed:`, err);
    return false;
  }
}
