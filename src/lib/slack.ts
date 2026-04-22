import type { TenantConfig } from "./types";

type NotificationType = "tenant" | "platform";

export function getSlackWebhook(
  type: NotificationType,
  tenantConfig?: TenantConfig | null
): string | null {
  if (type === "tenant" && tenantConfig?.slackWebhookUrl) {
    return tenantConfig.slackWebhookUrl;
  }
  // Platform notifications or fallback
  return process.env.SLACK_WEBHOOK_URL || null;
}

export async function sendSlackNotification(
  message: { text?: string; blocks?: unknown[] },
  type: NotificationType = "platform",
  tenantConfig?: TenantConfig | null
): Promise<boolean> {
  const webhook = getSlackWebhook(type, tenantConfig);
  if (!webhook) {
    console.log(`[Slack ${type}] No webhook configured:`, message.text || "(blocks)");
    return false;
  }

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    return res.ok;
  } catch (err) {
    console.error(`[Slack ${type}] Failed to send:`, err);
    return false;
  }
}
