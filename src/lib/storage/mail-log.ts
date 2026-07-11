/**
 * Mail send log: a durable record of every outbound email (weekly report,
 * daily summary, invites) so an operator can answer "why didn't tenant X get
 * their report?" — today the weekly-report cron only console.logs + Slacks an
 * ephemeral summary. Resend returns { error } without throwing, so a silent
 * failure (unset key, domain-reputation block) is invisible. This makes it
 * auditable + alertable.
 *
 * Null-safe (no Redis ⇒ no-op). Key: reb:maillog:{tenant} (sorted set, score =
 * send timestamp, member = JSON record). Mirrors the briefs:{tenant} pattern.
 */

import { getRedis } from "../redis";
import { recordMailSendPg } from "../db/repositories";
import { dualWritePgEnabled, mailToInsert } from "../db/dual-write";

export type MailKind = "weekly_report" | "monthly_report" | "daily_summary" | "invite" | "other";

export interface MailRecord {
  tenant: string;
  kind: MailKind;
  ok: boolean;
  messageId?: string;
  error?: string;
  to?: string;
  ts: number;
}

const MAILLOG_TTL_SECONDS = 120 * 24 * 3600; // ~4 months
const MAILLOG_MAX = 200; // keep the most recent N per tenant

function mailLogKey(tenant: string): string {
  return `reb:maillog:${tenant}`;
}

/** Record one email send. Best-effort; never throws into the send path. */
export async function recordMailSend(
  tenant: string,
  kind: MailKind,
  result: { ok: boolean; messageId?: string; error?: string; to?: string }
): Promise<void> {
  const record: MailRecord = { tenant, kind, ts: Date.now(), ...result };
  const redis = getRedis();
  if (redis) {
    const key = mailLogKey(tenant);
    try {
      await redis.zadd(key, { score: record.ts, member: JSON.stringify(record) });
      await redis.expire(key, MAILLOG_TTL_SECONDS, "NX");
      // Trim to the most recent MAILLOG_MAX (sorted-set, oldest = lowest score).
      await redis.zremrangebyrank(key, 0, -(MAILLOG_MAX + 1));
    } catch {
      // a lost mail-log line must not break sending the mail
    }
  }

  // Postgres shadow-write (Phase-2 dual-write). Independent of Redis so the
  // durable mail trail survives even when Redis is unavailable. Null-safe +
  // never throws. Gated by DUAL_WRITE_PG.
  if (dualWritePgEnabled()) {
    await recordMailSendPg(mailToInsert(record));
  }
}

/** Read recent mail records for a tenant, newest first. */
export async function getMailLog(tenant: string, limit = 50): Promise<MailRecord[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const raw = await redis.zrange<string[]>(mailLogKey(tenant), 0, limit - 1, { rev: true });
    return (raw || [])
      .map((item) => {
        try {
          return (typeof item === "string" ? JSON.parse(item) : item) as MailRecord;
        } catch {
          return null;
        }
      })
      .filter((r): r is MailRecord => r !== null);
  } catch {
    return [];
  }
}
