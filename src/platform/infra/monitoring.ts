import * as Sentry from "@sentry/nextjs";
import { logger } from "@/platform/infra/logger";
import { getRedis } from "@/platform/infra/redis";
import { CRON_MAX_AGE_SECONDS, type HeartbeatStatus } from "@/platform/infra/heartbeat";

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
    const dedupKey = alertDedupKey(event, context);
    const fresh = await redis.set(dedupKey, "1", { nx: true, ex: windowSeconds });
    if (!fresh) return; // already alerted within the window
    alert(event, severity, context);
  } catch {
    alert(event, severity, context);
  }
}

function alertDedupKey(event: string, identity: Context): string {
  const hash = `${event}:${Object.keys(identity).sort().map((k) => `${k}=${String(identity[k])}`).join("|")}`;
  return `reb:alert-dedup:${hash}`;
}

const RECONCILE_CRON_ALERT = `
local raw = redis.call('GET', KEYS[1])
local heartbeat = nil
if raw then
  local valid, decoded = pcall(cjson.decode, raw)
  if not valid or type(decoded) ~= 'table' then return 0 end
  heartbeat = decoded
  if heartbeat.ts ~= tonumber(ARGV[2]) then return 0 end
elseif ARGV[2] ~= '' then
  return 0
end
local mode = ARGV[1]
if mode == 'healthy' then
  if heartbeat and heartbeat.ok == true then redis.call('DEL', KEYS[2], KEYS[3]) end
  return 0
end
local marker = KEYS[3]
if mode == 'failed' then
  if not heartbeat or heartbeat.ok ~= false then return 0 end
  marker = KEYS[2]
elseif mode == 'stale' then
  if heartbeat and heartbeat.ok == false then return 0 end
else
  return 0
end
local fresh = redis.call('SET', marker, '1', 'NX', 'EX', ARGV[3])
if fresh then return 1 end
return 0
`;

/** Reconcile only the still-current heartbeat. Atomic observation guards prevent
 * old failure or recovery snapshots from recreating or erasing new incidents. */
export async function reportCronHeartbeat(status: HeartbeatStatus, requestId: string): Promise<void> {
  if (!Object.hasOwn(CRON_MAX_AGE_SECONDS, status.cron)) return;
  const mode = status.lastOk === false ? "failed" : status.stale ? "stale" : status.lastOk === true ? "healthy" : null;
  if (!mode) return; // Unknown observations cannot establish recovery.
  const timestamp = status.lastSeen === null ? "" : Date.parse(status.lastSeen);
  if (typeof timestamp === "number" && !Number.isFinite(timestamp)) return;
  if (mode === "healthy" && timestamp === "") return;
  const event = mode === "failed" ? "cron_failed" : "cron_stale";
  const context = { cron: status.cron, requestId, actorRole: "cron", operation: "heartbeat_check",
    outcome: mode, lastSeen: status.lastSeen ?? "never", ageSeconds: status.ageSeconds ?? -1 };
  const redis = getRedis();
  if (!redis) {
    if (mode !== "healthy") alert(event, "high", context);
    return;
  }
  try {
    const fresh = await redis.eval(RECONCILE_CRON_ALERT, [
      `reb:heartbeat:${status.cron}`,
      alertDedupKey("cron_failed", { cron: status.cron }),
      alertDedupKey("cron_stale", { cron: status.cron }),
    ], [mode, timestamp, 6 * 3600]);
    if (fresh === 1) alert(event, "high", context);
  } catch {
    // Preserve the existing outage fallback; Redis failure cannot prove dedup.
    if (mode !== "healthy") alert(event, "high", context);
  }
}
