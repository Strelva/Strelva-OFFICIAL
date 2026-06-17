import * as Sentry from "@sentry/nextjs";
import { logger } from "./logger";

type Severity = "low" | "medium" | "high" | "critical";

interface Context {
  [key: string]: unknown;
}

export function trackError(error: unknown, context: Context = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  logger.error(message, { ...context, stack });

  if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  }
}

export function alert(event: string, severity: Severity, context: Context = {}): void {
  logger.error(`[ALERT:${severity.toUpperCase()}] ${event}`, {
    alert: true,
    severity,
    ...context,
  });

  if (
    (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) &&
    (severity === "high" || severity === "critical")
  ) {
    Sentry.captureMessage(event, {
      level: severity === "critical" ? "fatal" : "error",
      extra: context,
    });
  }

  // Slack is where the team actually watches — post high/critical alerts there
  // too, not just Sentry (which may be unconfigured). Fire-and-forget.
  if (
    process.env.SLACK_WEBHOOK_URL &&
    (severity === "high" || severity === "critical")
  ) {
    const detail = Object.entries(context)
      .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" · ");
    fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `:rotating_light: *[${severity.toUpperCase()}] ${event}*${detail ? `\n${detail}` : ""}`,
      }),
    }).catch(() => {});
  }
}
