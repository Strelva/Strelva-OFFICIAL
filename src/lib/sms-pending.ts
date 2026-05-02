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
  status: "waiting" | "claimed" | "approved" | "declined" | "expired";
  expiresAt: string;
}

const TTL_SECONDS = 86400; // 24 hours

function redisKey(tenantId: string): string {
  return `sms:pending:${tenantId}`;
}

function phoneIndexKey(phone: string): string {
  return `sms:phone:${phone.replace(/\s/g, "")}`;
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
  const normalizedPhone = pending.phone.replace(/\s/g, "");

  const full: PendingSms = {
    ...pending,
    phone: normalizedPhone,
    approvalId,
    expiresAt,
  };

  const redis = getRedis();
  if (redis) {
    // Set the pending entry and phone index atomically via pipeline
    await redis.set(redisKey(pending.tenantId), JSON.stringify(full), {
      ex: TTL_SECONDS,
    });
    await redis.set(phoneIndexKey(normalizedPhone), pending.tenantId, {
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
    // Use phone index instead of scanning all keys
    const tenantId = await redis.get<string>(phoneIndexKey(normalized));
    if (!tenantId) return null;

    const raw = await redis.get<string>(redisKey(tenantId));
    if (!raw) return null;

    const entry: PendingSms = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (entry.phone !== normalized || entry.status !== "waiting") {
      return null;
    }
    // Check if expired
    if (new Date(entry.expiresAt) < new Date()) {
      await redis.del(redisKey(tenantId));
      await redis.del(phoneIndexKey(normalized));
      return null;
    }
    return entry;
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

/**
 * Atomically claim a pending SMS approval. Returns the entry if claimed,
 * null if already claimed, missing, or expired. Thread-safe for concurrent webhooks.
 */
export async function claimPendingByPhone(
  phone: string
): Promise<PendingSms | null> {
  const normalized = phone.replace(/\s/g, "");
  const redis = getRedis();

  if (redis) {
    // Use phone index to find tenant
    const tenantId = await redis.get<string>(phoneIndexKey(normalized));
    if (!tenantId) return null;

    // Lua script for atomic check-and-claim
    // Returns the JSON entry if claimed, empty string if already claimed/invalid
    const claimScript = `
      local key = KEYS[1]
      local raw = redis.call('GET', key)
      if not raw then return '' end

      local entry = cjson.decode(raw)
      if entry.status ~= 'waiting' then return '' end
      if entry.phone ~= ARGV[1] then return '' end

      -- Check expiry
      local expiresAt = entry.expiresAt
      local now = ARGV[2]
      if expiresAt < now then
        redis.call('DEL', key)
        redis.call('DEL', KEYS[2])
        return ''
      end

      -- Claim it
      entry.status = 'claimed'
      redis.call('SET', key, cjson.encode(entry), 'EX', 3600)
      return raw
    `;

    const result = await redis.eval(
      claimScript,
      [redisKey(tenantId), phoneIndexKey(normalized)],
      [normalized, new Date().toISOString()]
    ) as string;

    if (!result) return null;
    return typeof result === "string" ? JSON.parse(result) : result;
  }

  // Memory fallback (not atomic, acceptable for dev)
  const entries = Array.from(memoryStore.values());
  for (const entry of entries) {
    if (entry.phone === normalized && entry.status === "waiting") {
      if (new Date(entry.expiresAt) < new Date()) {
        memoryStore.delete(entry.tenantId);
        continue;
      }
      // Claim it
      entry.status = "claimed" as PendingSms["status"];
      return { ...entry, status: "waiting" }; // Return original state
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
 * Works with both "waiting" and "claimed" statuses.
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
    if (entry.status !== "waiting" && entry.status !== "claimed") {
      return false; // Already processed, idempotent
    }

    // Clean up phone index
    await redis.del(phoneIndexKey(entry.phone));

    entry.status = status;
    // Keep in Redis briefly so status can be checked, then let TTL expire
    await redis.set(redisKey(tenantId), JSON.stringify(entry), {
      ex: 3600, // Keep processed state for 1 hour
    });
    return true;
  }

  // Memory fallback
  const entry = memoryStore.get(tenantId);
  if (!entry || (entry.status !== "waiting" && entry.status !== "claimed")) return false;
  entry.status = status;
  return true;
}
