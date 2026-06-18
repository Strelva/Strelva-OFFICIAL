/**
 * Proof-signal pipeline (Workstream E).
 *
 * The bet: owners will text the agent unprompted. To grade it, we count
 * every agent tool call per tenant per day, tagged by source (owner vs
 * Jacob), and roll it up daily to Slack.
 *
 * This module owns:
 *  - recordAgentToolCall: fire Slack + bump Redis counter (fire-and-forget)
 *  - readAndResetDailyCounts: cron rollup reader
 *  - classifySource: "jacob" | "owner" based on Clerk userId
 *
 * Coverage note: E1 (this file + agent route wiring) and E2
 * (/api/cron/daily-summary) together cover the p4-slack-notifications
 * task in .claude/plans/remaining.yml end-to-end. Do not re-implement.
 */

import { getRedis } from "./redis";

// TODO: move FOUNDER_CLERK_USER_ID into src/lib/env.ts alongside other
// optional env vars once founder-os config stabilizes.
const FOUNDER_CLERK_USER_ID = process.env.FOUNDER_CLERK_USER_ID;

export type AgentCallSource = "jacob" | "owner";

let _slackMissingLogged = false;

export function classifySource(clerkUserId: string | null | undefined): AgentCallSource {
  if (!FOUNDER_CLERK_USER_ID) return "owner";
  return clerkUserId && clerkUserId === FOUNDER_CLERK_USER_ID ? "jacob" : "owner";
}

function todayKey(): string {
  // YYYY-MM-DD in UTC. Daily rollup runs once per day, so UTC is fine.
  return new Date().toISOString().slice(0, 10);
}

function counterKey(tenant: string, day: string, source: AgentCallSource): string {
  return `reb:agent-signal:${tenant}:${day}:${source}`;
}

const COUNTER_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function truncateMessage(raw: string | undefined, max = 200): string {
  if (!raw) return "(no message)";
  const oneLine = raw.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}

interface NotifyArgs {
  tenantId: string;
  siteName: string;
  userMessage: string | undefined;
  toolName: string;
  source: AgentCallSource;
}

/**
 * Fire-and-forget: post a Slack line and bump the daily counter.
 *
 * Callers MUST `void recordAgentToolCall(...)` so chat latency is never
 * blocked on Slack. Failures are swallowed (logged on first miss only).
 */
export function recordAgentToolCall(args: NotifyArgs): void {
  const { tenantId, siteName, userMessage, toolName, source } = args;

  // 1) Slack line
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    if (!_slackMissingLogged) {
      _slackMissingLogged = true;
      console.warn("[proof-signals] SLACK_WEBHOOK_URL not set — agent signal Slack notifications disabled.");
    }
  } else {
    const tag = source === "jacob" ? "by Jacob" : "by owner";
    const text = `[${siteName}] ${toolName} (${tag})\n> ${truncateMessage(userMessage)}`;
    fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch((err) => {
      console.warn("[proof-signals] Slack notify failed:", err instanceof Error ? err.message : err);
    });
  }

  // 2) Redis counter
  const redis = getRedis();
  if (redis) {
    const key = counterKey(tenantId, todayKey(), source);
    // incr then expire with NX — Upstash doesn't have atomic INCRBYEX.
    redis
      .incr(key)
      .then(async (value) => {
        if (value === 1) {
          try {
            await redis.expire(key, COUNTER_TTL_SECONDS, "NX");
          } catch (err) {
            console.warn("[proof-signals] Redis expire failed:", err instanceof Error ? err.message : err);
          }
        }
      })
      .catch((err) => {
        console.warn("[proof-signals] Redis incr failed:", err instanceof Error ? err.message : err);
      });
  }
}

/**
 * Read (and zero out) the last-24h counts for a tenant.
 * Returns `{ owner, jacob }`. Missing keys read as 0.
 */
export async function readAndResetDailyCounts(tenantId: string, day?: string): Promise<{
  owner: number;
  jacob: number;
}> {
  const redis = getRedis();
  if (!redis) return { owner: 0, jacob: 0 };

  const d = day || todayKey();
  const ownerKey = counterKey(tenantId, d, "owner");
  const jacobKey = counterKey(tenantId, d, "jacob");

  try {
    const [owner, jacob] = await Promise.all([
      redis.get<number>(ownerKey),
      redis.get<number>(jacobKey),
    ]);
    return {
      owner: Number(owner || 0),
      jacob: Number(jacob || 0),
    };
  } catch (err) {
    console.warn("[proof-signals] Redis read failed:", err instanceof Error ? err.message : err);
    return { owner: 0, jacob: 0 };
  }
}

/**
 * Post a Slack message. Shared with the rollup cron so there's one code path.
 * Safe if SLACK_WEBHOOK_URL is unset.
 */
export function postSlack(text: string): void {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;
  fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch((err) => {
    console.warn("[proof-signals] Slack post failed:", err instanceof Error ? err.message : err);
  });
}
