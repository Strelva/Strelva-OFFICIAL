import * as Sentry from "@sentry/nextjs";
import { logger } from "./logger";
import { getRedis } from "./redis";

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

/**
 * Like alert(), but deduplicated: the same (event+context) won't re-fire within
 * `windowSeconds`, so one repeating failure across many crons/tenants doesn't
 * spam Slack. Medium-severity events (which alert() only logs) are rolled into a
 * rolling Redis counter so they're not dropped silently. Falls through to a
 * plain alert() if Redis is unavailable. Best-effort; never throws.
 */
export async function alertOnce(
  event: string,
  severity: Severity,
  context: Context = {},
  windowSeconds = 3600
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    alert(event, severity, context);
    return;
  }
  try {
    if (severity === "medium" || severity === "low") {
      // Don't page on these, but keep a visible tally instead of dropping them.
      const counterKey = `reb:alert-count:${severity}:${event}`;
      await redis.incr(counterKey);
      await redis.expire(counterKey, 24 * 3600, "NX");
      logger.warn(`[ALERT:${severity.toUpperCase()}] ${event}`, { alert: true, severity, ...context });
      return;
    }
    const hash = `${event}:${Object.keys(context).sort().map((k) => `${k}=${String(context[k])}`).join("|")}`;
    const dedupKey = `reb:alert-dedup:${hash}`;
    const fresh = await redis.set(dedupKey, "1", { nx: true, ex: windowSeconds });
    if (!fresh) return; // already alerted within the window
    alert(event, severity, context);
  } catch {
    alert(event, severity, context);
  }
}
