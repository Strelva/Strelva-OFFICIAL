/**
 * SMS Pending Approval Storage
 *
 * Stores pending SMS approval requests in Redis with 24-hour TTL.
 * Falls back to in-memory storage if Redis is unavailable (dev only).
 */

import { getRedis } from "./redis";

export interface PendingSms {
  approvalId: string;
  tenantId: string;
  suggestionId: string;
  suggestionText: string;
  actionPrompt: string;
  sentAt: string;
  phone: string;
  status: "waiting" | "approved" | "declined" | "expired";
  expiresAt: string;
}

const TTL_SECONDS = 86400; // 24 hours

function redisKey(tenantId: string): string {
  return `sms:pending:${tenantId}`;
}

function generateApprovalId(): string {
  return `apr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// In-memory fallback for dev when Redis is not configured
const memoryStore = new Map<string, PendingSms>();

export async function setPending(
  pending: Omit<PendingSms, "approvalId" | "expiresAt">
): Promise<PendingSms> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_SECONDS * 1000).toISOString();
  const approvalId = generateApprovalId();

  const full: PendingSms = {
    ...pending,
    approvalId,
    expiresAt,
  };

  const redis = getRedis();
  if (redis) {
    await redis.set(redisKey(pending.tenantId), JSON.stringify(full), {
      ex: TTL_SECONDS,
    });
  } else {
    memoryStore.set(pending.tenantId, full);
  }

  return full;
}

export async function getPendingByPhone(
  phone: string
): Promise<PendingSms | null> {
  const normalized = phone.replace(/\s/g, "");
  const redis = getRedis();

  if (redis) {
    // Scan for matching phone across all pending keys
    // Since we key by tenantId, we need to scan keys
    const keys = await redis.keys("sms:pending:*");
    for (const key of keys) {
      const raw = await redis.get<string>(key);
      if (!raw) continue;
      const entry: PendingSms = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (entry.phone === normalized && entry.status === "waiting") {
        // Check if expired
        if (new Date(entry.expiresAt) < new Date()) {
          await redis.del(key);
          continue;
        }
        return entry;
      }
    }
    return null;
  }

  // Memory fallback
  const entries = Array.from(memoryStore.values());
  for (const entry of entries) {
    if (entry.phone === normalized && entry.status === "waiting") {
      if (new Date(entry.expiresAt) < new Date()) {
        memoryStore.delete(entry.tenantId);
        continue;
      }
      return entry;
    }
  }
  return null;
}

export async function getPendingByTenant(
  tenantId: string
): Promise<PendingSms | null> {
  const redis = getRedis();

  if (redis) {
    const raw = await redis.get<string>(redisKey(tenantId));
    if (!raw) return null;
    const entry: PendingSms = typeof raw === "string" ? JSON.parse(raw) : raw;
    // Check expiry
    if (new Date(entry.expiresAt) < new Date()) {
      await redis.del(redisKey(tenantId));
      return null;
    }
    return entry;
  }

  // Memory fallback
  const entry = memoryStore.get(tenantId);
  if (!entry) return null;
  if (new Date(entry.expiresAt) < new Date()) {
    memoryStore.delete(tenantId);
    return null;
  }
  return entry;
}

/**
 * Mark a pending SMS as processed. Idempotent — no-op if already processed or missing.
 */
export async function clearPending(
  tenantId: string,
  status: "approved" | "declined" | "expired"
): Promise<boolean> {
  const redis = getRedis();

  if (redis) {
    const raw = await redis.get<string>(redisKey(tenantId));
    if (!raw) return false; // Already cleared or never existed

    const entry: PendingSms = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (entry.status !== "waiting") {
      return false; // Already processed, idempotent
    }

    entry.status = status;
    // Keep in Redis briefly so status can be checked, then let TTL expire
    await redis.set(redisKey(tenantId), JSON.stringify(entry), {
      ex: 3600, // Keep processed state for 1 hour
    });
    return true;
  }

  // Memory fallback
  const entry = memoryStore.get(tenantId);
  if (!entry || entry.status !== "waiting") return false;
  entry.status = status;
  return true;
}
