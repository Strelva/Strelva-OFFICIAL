/**
 * Shareable audit-report store. When a prospect runs the gated full audit on the
 * marketing site, the result is persisted here under a short id so the emailed
 * (and on-page) "View full report" link resolves to the sendable one-pager for a
 * while after the scan. Redis-backed, TTL-bounded — not a system of record; the
 * lead itself is captured separately (Slack + the leads board).
 */

import { getRedis } from "./redis";
import type { AuditResult } from "./audit/types";

const TTL_SECONDS = 60 * 60 * 24 * 60; // 60 days — long enough to click through an email later

export interface AuditReportLead {
  name: string;
  email: string;
  url: string;
}

export interface StoredAuditReport {
  result: AuditResult;
  lead: AuditReportLead;
  createdAt: string;
}

function reportKey(id: string): string {
  return `reb:audit-report:${id}`;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  // Deterministic-length fallback for environments without crypto.randomUUID.
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** Persist a report and return its id. Fails soft to null when Redis is absent
 *  (the caller can still return the result inline; only the shareable link is lost). */
export async function saveAuditReport(
  result: AuditResult,
  lead: AuditReportLead,
): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  const id = newId();
  const payload: StoredAuditReport = { result, lead, createdAt: new Date().toISOString() };
  try {
    await redis.set(reportKey(id), JSON.stringify(payload), { ex: TTL_SECONDS });
    return id;
  } catch {
    return null;
  }
}

/** Look up a stored report by id. Returns null when missing, expired, or Redis is down. */
export async function getAuditReport(id: string): Promise<StoredAuditReport | null> {
  // Reject IDs that don't match the 32-hex shape produced by newId() to prevent
  // arbitrary Redis key suffix injection (e.g. "../../other:key").
  if (!/^[a-f0-9]{32}$/.test(id)) return null;
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(reportKey(id));
    if (!raw) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as StoredAuditReport) : (raw as StoredAuditReport);
  } catch {
    return null;
  }
}
