import { NextResponse } from "next/server";
import { getAllTenants } from "@/lib/tenants";
import { getSuggestions } from "@/lib/suggestions";
import { sendSms } from "@/lib/twilio";
import { setPending, getPendingByPhone } from "@/lib/sms-pending";
import type { Suggestion } from "@/lib/suggestions";

function composeSmsBody(
  ownerName: string,
  suggestion: Suggestion
): { text: string; actionPrompt: string } {
  const firstName = ownerName.split(" ")[0];

  const actionPrompt =
    suggestion.action.startsWith("update_section:")
      ? `Please freshen up the ${suggestion.section} section. Read it first, then rewrite the content to feel current and engaging. Keep the same structure but update the language.`
      : suggestion.action.startsWith("prompt:")
        ? suggestion.action.replace("prompt:", "")
        : `${suggestion.description} Please help with this.`;

  let text: string;
  switch (suggestion.type) {
    case "stale":
      text = `Hey ${firstName}! Your ${suggestion.section} section hasn't been updated in a while. Want me to freshen it up? Reply YES`;
      break;
    case "missing":
      text = `Hey ${firstName}! ${suggestion.description} Want me to help with that? Reply YES`;
      break;
    case "engagement":
      text = `Hey ${firstName}! ${suggestion.description} Want me to take care of it? Reply YES`;
      break;
    default:
      text = `Hey ${firstName}! I have a suggestion for your site: ${suggestion.title}. Want me to handle it? Reply YES`;
  }

  return { text, actionPrompt };
}

export async function GET() {
  // Auth handled by middleware (CRON_SECRET check)

  // Feature gate: skip if SMS suggestions are disabled
  if (process.env.SMS_SUGGESTIONS_ENABLED !== "true") {
    console.log("[sms-suggestions] Feature disabled via SMS_SUGGESTIONS_ENABLED");
    return NextResponse.json({ skipped: true, reason: "SMS_SUGGESTIONS_ENABLED is not true" });
  }

  const tenants = await getAllTenants();
  const sent: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const tenant of tenants.filter((t) => t.active && t.ownerPhone && t.subscriptionStatus !== "cancelled")) {
    try {
      const phone = tenant.ownerPhone!;

      // Skip if a pending SMS was sent less than 5 days ago
      const existing = await getPendingByPhone(phone);
      if (existing) {
        const sentAt = new Date(existing.sentAt).getTime();
        const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
        if (Date.now() - sentAt < fiveDaysMs) {
          skipped.push(tenant.id);
          continue;
        }
      }

      const suggestions = await getSuggestions(tenant.id);
      if (suggestions.length === 0) {
        skipped.push(tenant.id);
        continue;
      }

      const top = suggestions[0];
      const { text, actionPrompt } = composeSmsBody(tenant.ownerName, top);

      await sendSms(phone, text);
      await setPending({
        tenantId: tenant.id,
        suggestionId: top.id,
        suggestionText: text,
        actionPrompt,
        sentAt: new Date().toISOString(),
        phone,
        status: "waiting",
      });
      sent.push(tenant.id);
    } catch (err) {
      const msg = `${tenant.id}: ${err instanceof Error ? err.message : "Unknown error"}`;
      console.error(`[sms-suggestion] Failed for tenant ${tenant.id}:`, err);
      errors.push(msg);
    }
  }

  // Notify Slack if any tenants failed
  if (errors.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `⚠ SMS suggestion cron: ${errors.length} tenant(s) failed — ${errors.join(", ")}`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ processed: sent.length, failed: errors.length, sent, skipped, errors });
}
