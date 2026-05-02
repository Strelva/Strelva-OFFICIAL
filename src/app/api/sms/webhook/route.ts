import { after } from "next/server";
import { validateRequest } from "twilio";
import { getPendingByPhone, clearPending } from "@/lib/sms-pending";
import { updateSuggestion } from "@/lib/suggestions";
import { executeAgentPrompt } from "@/lib/agent-executor";
import { sendSms } from "@/lib/twilio";

const YES_PATTERN =
  /^(yes|yeah|yep|yea|sure|ok|okay|do it|go ahead|go for it|please|y)\b/i;

const TWIML_EMPTY = '<Response></Response>';

function getWebhookUrl(req: Request): string {
  const url = new URL(req.url);
  // In production, use the configured site URL; in dev, use the request URL
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${url.protocol}//${url.host}`;
  return `${baseUrl}/api/sms/webhook`;
}

export async function POST(req: Request) {
  // Feature gate: return empty TwiML if SMS suggestions are disabled
  if (process.env.SMS_SUGGESTIONS_ENABLED !== "true") {
    console.log("[sms-suggestions] Feature disabled via SMS_SUGGESTIONS_ENABLED");
    return new Response(TWIML_EMPTY, {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioSignature = req.headers.get("X-Twilio-Signature") || "";

  const formData = await req.text();
  const params = new URLSearchParams(formData);

  // Validate Twilio signature if auth token is configured
  if (authToken) {
    const webhookUrl = getWebhookUrl(req);
    // Convert URLSearchParams to Record<string, string> for validateRequest
    const paramsObj: Record<string, string> = {};
    params.forEach((value, key) => {
      paramsObj[key] = value;
    });

    const isValid = validateRequest(authToken, twilioSignature, webhookUrl, paramsObj);
    if (!isValid) {
      console.error("[SMS webhook] Invalid Twilio signature");
      return new Response("Forbidden", { status: 403 });
    }
  } else {
    console.warn("[SMS webhook] TWILIO_AUTH_TOKEN not set, skipping signature validation");
  }
  const from = params.get("From") || "";
  const body = (params.get("Body") || "").trim();

  const pending = await getPendingByPhone(from);

  if (!pending) {
    after(async () => {
      await sendSms(
        from,
        "No pending suggestion right now! Text me anytime at your dashboard."
      );
    });
    return new Response(TWIML_EMPTY, {
      headers: { "Content-Type": "text/xml" },
    });
  }

  if (YES_PATTERN.test(body)) {
    // Execute asynchronously so Twilio doesn't timeout
    after(async () => {
      try {
        await executeAgentPrompt(pending.tenantId, pending.actionPrompt);
        await updateSuggestion(
          pending.tenantId,
          pending.suggestionId,
          "accepted"
        );
        await clearPending(pending.tenantId, "approved");
        await sendSms(
          from,
          "Done! Your site's been updated. Check it out when you get a chance."
        );
      } catch (err) {
        console.error("[SMS webhook] Agent execution failed:", err);
        await clearPending(pending.tenantId, "declined");
        await sendSms(
          from,
          "Something went wrong updating your site. Laney will take a look!"
        );
      }
    });
  } else {
    after(async () => {
      await updateSuggestion(
        pending.tenantId,
        pending.suggestionId,
        "dismissed"
      );
      await clearPending(pending.tenantId, "declined");
      await sendSms(from, "No problem! I'll check in next week.");
    });
  }

  return new Response(TWIML_EMPTY, {
    headers: { "Content-Type": "text/xml" },
  });
}
