/**
 * Internal Redis-backed delivery checkpoint store.
 *
 * This module is deliberately private to the inquiry delivery adapter. Redis
 * remains the operational authority for accepted-write markers, claims and
 * the daily delivery budget. Inquiry records themselves remain in leads Redis.
 */

import { randomUUID } from "node:crypto";

import { getRedis } from "@/lib/redis";
import type { InquiryTimelineEventType } from "@/products/inquiries/contracts";

import type {
  InquiryDeliveryAction,
  InquiryDeliveryBudgetReservation,
  InquiryDeliveryCheckpoint,
  InquiryDeliveryProviderEventClaim,
  InquiryDeliveryProviderEventInput,
  InquiryDeliveryReplyState,
  InquiryDeliveryStore,
  InquiryDeliveryTimelineInput,
} from "./delivery-types";

const DELIVERY_TTL_SECONDS = 90 * 24 * 60 * 60;
const DELIVERY_TIMELINE_KEEP = 100;
const CLAIM_TTL_SECONDS = 15 * 60;
const PROVIDER_EVENT_CLAIM_TTL_SECONDS = 15 * 60;
const BUDGET_TTL_SECONDS = 2 * 24 * 60 * 60;

interface RedisLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: { nx?: boolean; ex?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  zadd(key: string, entry: { score: number; member: string }): Promise<unknown>;
  zrange<T = unknown[]>(key: string, start: number, stop: number, options?: { rev?: boolean }): Promise<T>;
  zremrangebyrank?(key: string, start: number, stop: number): Promise<unknown>;
  eval?<T = unknown>(script: string, keys: string[], args: string[]): Promise<T>;
}

const BUDGET_RESERVATION_SCRIPT = `
local limit = tonumber(ARGV[1])
if not limit or limit < 1 then return -2 end
local current = redis.call("GET", KEYS[1])
if current and tonumber(current) >= limit then return -1 end
local next = redis.call("INCR", KEYS[1])
if next == 1 then redis.call("EXPIRE", KEYS[1], tonumber(ARGV[2])) end
if next > limit then
  redis.call("DECR", KEYS[1])
  return -1
end
return next
`;

const MARK_ACCEPTED_SCRIPT = `
local ttl = tonumber(ARGV[5])
redis.call("SET", KEYS[1], ARGV[1], "EX", ttl)
if ARGV[2] ~= "" then redis.call("SET", KEYS[2], ARGV[2], "EX", ttl) end
if ARGV[3] ~= "" then redis.call("SET", KEYS[3], ARGV[3], "EX", ttl) end
if ARGV[4] ~= "" then redis.call("SET", KEYS[4], ARGV[4], "EX", ttl) end
return 1
`;

// Verification and provider webhooks may finish concurrently. Only transition
// the same accepted attempt; a provider outcome that won first stays terminal.
const MARK_ACCEPTED_STATE_SCRIPT = `
local currentRaw = redis.call("GET", KEYS[1])
if not currentRaw then return "" end
local current = cjson.decode(currentRaw)
if current.attemptId ~= ARGV[2] then return currentRaw end
if current.status ~= "accepted" and current.status ~= "accepted_unverified" then return currentRaw end
redis.call("SET", KEYS[1], ARGV[1], "EX", tonumber(ARGV[3]))
return ARGV[1]
`;

// Provider webhooks can arrive out of order and distinct event ids can be
// processed concurrently. Keep the event ordering and terminal-failure rule
// inside Redis so a read followed by a write cannot resurrect a delivered
// or bounced message with stale evidence.
const MARK_PROVIDER_OUTCOME_SCRIPT = `
local currentRaw = redis.call("GET", KEYS[1])
if not currentRaw then return "" end
local current = cjson.decode(currentRaw)
if current.providerMessageId ~= ARGV[6] then return currentRaw end
if current.status == "sending" or current.status == "unknown" then return currentRaw end
if current.providerEventId == ARGV[4] then return currentRaw end

local function priority(outcome)
  if outcome == "bounced" or outcome == "failed" or outcome == "suppressed" then return 3 end
  if outcome == "delivered" then return 2 end
  if outcome == "deferred" then return 1 end
  return 0
end

local currentPriority = priority(current.providerOutcome)
local nextPriority = priority(ARGV[2])
local apply = false
if nextPriority > currentPriority then
  apply = true
elseif nextPriority == currentPriority then
  if nextPriority == 0 then
    apply = true
  elseif not current.providerEventAt or ARGV[3] > current.providerEventAt then
    apply = true
  end
end
if not apply then return currentRaw end
redis.call("SET", KEYS[1], ARGV[1], "EX", tonumber(ARGV[5]))
return ARGV[1]
`;

const CLAIM_PROVIDER_EVENT_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if current == "completed" then return "completed" end
if current then return "processing" end
redis.call("SET", KEYS[1], ARGV[1], "EX", tonumber(ARGV[2]))
return "claimed"
`;

const COMPLETE_PROVIDER_EVENT_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
redis.call("SET", KEYS[1], "completed", "EX", tonumber(ARGV[2]))
return 1
`;

const RELEASE_PROVIDER_EVENT_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("DEL", KEYS[1])
  return 1
end
return 0
`;

function redisLike(value: ReturnType<typeof getRedis>): RedisLike | null {
  return value as RedisLike | null;
}

function keyPart(value: string): string {
  return encodeURIComponent(value.trim());
}

function checkpointKey(tenantId: string, inquiryId: string, action: InquiryDeliveryAction): string {
  return `reb:inquiry-delivery:${keyPart(tenantId)}:${keyPart(inquiryId)}:${action}`;
}

function claimKey(tenantId: string, inquiryId: string, action: InquiryDeliveryAction): string {
  return `reb:inquiry-delivery-claim:${keyPart(tenantId)}:${keyPart(inquiryId)}:${action}`;
}

function timelineKey(tenantId: string, inquiryId: string): string {
  return `reb:inquiry-timeline:${keyPart(tenantId)}:${keyPart(inquiryId)}`;
}

function providerMessageKey(tenantId: string, providerMessageId: string): string {
  return `reb:inquiry-delivery-provider:${keyPart(tenantId)}:${keyPart(providerMessageId)}`;
}

function providerEventKey(tenantId: string, providerEventId: string): string {
  return `reb:inquiry-delivery-event:${keyPart(tenantId)}:${keyPart(providerEventId)}`;
}

function replyAddressKey(tenantId: string, replyTo: string): string {
  return `reb:inquiry-reply:${keyPart(tenantId)}:${keyPart(replyTo.toLowerCase())}`;
}

function replyAddressAnyKey(replyTo: string): string {
  return `reb:inquiry-reply-target:${keyPart(replyTo.toLowerCase())}`;
}

function replyStateKey(tenantId: string, inquiryId: string): string {
  return `reb:inquiry-reply-state:${keyPart(tenantId)}:${keyPart(inquiryId)}`;
}

function providerEventAt(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("inquiry_delivery_provider_event_time_invalid");
  return parsed.toISOString();
}

function providerOutcomePriority(outcome: InquiryDeliveryCheckpoint["providerOutcome"]): number {
  if (outcome === "bounced" || outcome === "failed" || outcome === "suppressed") return 3;
  if (outcome === "delivered") return 2;
  if (outcome === "deferred") return 1;
  return 0;
}

/** Keep permanent failures terminal and otherwise accept only newer evidence. */
function shouldApplyProviderOutcome(
  current: InquiryDeliveryCheckpoint,
  input: InquiryDeliveryProviderEventInput,
  normalizedAt: string,
): boolean {
  const currentPriority = providerOutcomePriority(current.providerOutcome);
  const nextPriority = providerOutcomePriority(input.outcome);
  if (nextPriority > currentPriority) return true;
  if (nextPriority < currentPriority) return false;
  if (nextPriority === 0) return true;
  return !current.providerEventAt || normalizedAt > current.providerEventAt;
}

interface ProviderMessageTarget {
  tenantId: string;
  inquiryId: string;
  action: InquiryDeliveryAction;
  providerMessageId: string;
}

function parseProviderMessageTarget(raw: unknown, tenantId: string, providerMessageId: string): ProviderMessageTarget | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<ProviderMessageTarget>;
  if (
    row.tenantId !== tenantId ||
    row.providerMessageId !== providerMessageId ||
    typeof row.inquiryId !== "string" ||
    !["reply", "send_message", "owner_notification", "schedule_follow_up"].includes(row.action || "")
  ) return null;
  return {
    tenantId,
    inquiryId: row.inquiryId,
    action: row.action as InquiryDeliveryAction,
    providerMessageId,
  };
}

function parseReplyState(raw: unknown, tenantId: string, inquiryId: string): InquiryDeliveryReplyState | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<InquiryDeliveryReplyState>;
  if (
    row.tenantId !== tenantId ||
    row.inquiryId !== inquiryId ||
    typeof row.providerMessageId !== "string" ||
    typeof row.providerEventId !== "string" ||
    typeof row.receivedAt !== "string"
  ) return null;
  return {
    tenantId,
    inquiryId,
    providerMessageId: row.providerMessageId.slice(0, 240),
    providerEventId: row.providerEventId.slice(0, 240),
    receivedAt: row.receivedAt,
  };
}

function localDateKey(value: string, timezone: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || !timezone.trim()) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

function budgetKey(tenantId: string, budget: InquiryDeliveryBudgetReservation): string | null {
  const date = localDateKey(budget.now, budget.timezone);
  return date ? `reb:inquiry-budget:${keyPart(tenantId)}:${keyPart(budget.policyVersion)}:${date}` : null;
}

function parseCheckpoint(raw: unknown, tenantId: string, inquiryId: string, action: InquiryDeliveryAction): InquiryDeliveryCheckpoint | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<InquiryDeliveryCheckpoint>;
  if (
    typeof row.inquiryId !== "string" ||
    typeof row.tenantId !== "string" ||
    typeof row.action !== "string" ||
    typeof row.status !== "string" ||
    typeof row.attemptId !== "string" ||
    typeof row.attempts !== "number" ||
    typeof row.startedAt !== "string"
  ) return null;
  if (row.tenantId !== tenantId || row.inquiryId !== inquiryId || row.action !== action) return null;
  return {
    inquiryId: row.inquiryId,
    tenantId: row.tenantId,
    action: row.action as InquiryDeliveryAction,
    status: row.status as InquiryDeliveryCheckpoint["status"],
    attemptId: row.attemptId,
    attempts: row.attempts,
    startedAt: row.startedAt,
    ...(typeof row.acceptedAt === "string" ? { acceptedAt: row.acceptedAt } : {}),
    ...(typeof row.providerMessageId === "string" ? { providerMessageId: row.providerMessageId } : {}),
    ...(typeof row.replyTo === "string" ? { replyTo: row.replyTo.slice(0, 320).toLowerCase() } : {}),
    ...(Array.isArray(row.verificationEvidence) ? { verificationEvidence: row.verificationEvidence.filter((v): v is string => typeof v === "string").slice(0, 20) } : {}),
    ...(typeof row.verificationReason === "string" ? { verificationReason: row.verificationReason.slice(0, 240) } : {}),
    ...(typeof row.failureReason === "string" ? { failureReason: row.failureReason.slice(0, 240) } : {}),
    ...(typeof row.retryable === "boolean" ? { retryable: row.retryable } : {}),
    ...(["delivered", "bounced", "deferred", "failed", "suppressed"].includes(row.providerOutcome || "")
      ? { providerOutcome: row.providerOutcome as InquiryDeliveryCheckpoint["providerOutcome"] }
      : {}),
    ...(typeof row.providerEventId === "string" ? { providerEventId: row.providerEventId.slice(0, 240) } : {}),
    ...(typeof row.providerEventAt === "string" ? { providerEventAt: row.providerEventAt.slice(0, 40) } : {}),
  };
}

function parseTimeline(raw: unknown, tenantId: string, inquiryId: string): InquiryDeliveryTimelineInput | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<InquiryDeliveryTimelineInput>;
  if (
    typeof row.inquiryId !== "string" ||
    typeof row.tenantId !== "string" ||
    typeof row.type !== "string" ||
    typeof row.summary !== "string" ||
    typeof row.outcome !== "string"
  ) return null;
  if (row.tenantId !== tenantId || row.inquiryId !== inquiryId) return null;
  return {
    inquiryId: row.inquiryId,
    tenantId: row.tenantId,
    capabilityId: typeof row.capabilityId === "string" ? row.capabilityId : null,
    type: row.type as InquiryTimelineEventType,
    summary: row.summary.slice(0, 500),
    outcome: row.outcome as InquiryDeliveryTimelineInput["outcome"],
    at: typeof row.at === "string" ? row.at : undefined,
    receiptId: typeof row.receiptId === "string" ? row.receiptId : null,
    causedByEventId: typeof row.causedByEventId === "string" ? row.causedByEventId : null,
    actor: row.actor,
    evidence: Array.isArray(row.evidence) ? row.evidence.filter((v): v is string => typeof v === "string").slice(0, 20) : [],
  };
}

async function reserveRedisBudget(
  redis: RedisLike,
  tenantId: string,
  budget: InquiryDeliveryBudgetReservation,
): Promise<boolean> {
  if (!redis.eval) throw new Error("atomic_daily_budget_unavailable");
  const key = budgetKey(tenantId, budget);
  if (!key) throw new Error("invalid_daily_budget_timezone");
  const result = await redis.eval<number | string>(BUDGET_RESERVATION_SCRIPT, [key], [String(Math.floor(budget.limit)), String(BUDGET_TTL_SECONDS)]);
  const numeric = typeof result === "number" ? result : Number(result);
  if (numeric === -1) return false;
  if (numeric < 1) throw new Error("atomic_daily_budget_unavailable");
  return true;
}

/** Redis-authoritative accepted-write and attempt marker store. */
export function createRedisInquiryDeliveryStore(
  redisInput: ReturnType<typeof getRedis> = getRedis(),
): InquiryDeliveryStore {
  const redis = redisLike(redisInput);
  const unavailable = () => {
    throw new Error("inquiry_delivery_persistence_unavailable");
  };
  return {
    durable: Boolean(redis),
    atomicBudget: Boolean(redis?.eval),
    async getCheckpoint(input) {
      if (!redis) return unavailable();
      return parseCheckpoint(await redis.get(checkpointKey(input.tenantId, input.inquiryId, input.action)), input.tenantId, input.inquiryId, input.action);
    },
    async beginAttempt(input) {
      if (!redis) return unavailable();
      const stateKey = checkpointKey(input.tenantId, input.inquiryId, input.action);
      const existing = parseCheckpoint(await redis.get(stateKey), input.tenantId, input.inquiryId, input.action);
      if (existing) {
        const terminal = ["accepted", "verified", "delivered", "bounced", "deferred", "suppressed", "accepted_unverified"].includes(existing.status)
          || (existing.status === "failed" && existing.retryable !== true);
        if (terminal) {
          return { acquired: false, checkpoint: existing, reason: "already_accepted" };
        }
        if (existing.status === "sending" || existing.status === "unknown") {
          return { acquired: false, checkpoint: existing, reason: "reconciliation_required" };
        }
        if (existing.attempts >= input.maxAttempts) {
          return { acquired: false, checkpoint: existing, reason: "retry_exhausted" };
        }
      }
      const attemptId = randomUUID();
      const lockKey = claimKey(input.tenantId, input.inquiryId, input.action);
      const claimed = await redis.set(lockKey, attemptId, { nx: true, ex: CLAIM_TTL_SECONDS });
      if (claimed === null || claimed === undefined || claimed === false) {
        return { acquired: false, checkpoint: existing || undefined, reason: "action_in_progress" };
      }
      try {
        if (!(await reserveRedisBudget(redis, input.tenantId, input.budget))) {
          await redis.del(lockKey);
          return { acquired: false, checkpoint: existing || undefined, reason: "budget_exhausted" };
        }
        const checkpoint: InquiryDeliveryCheckpoint = {
          inquiryId: input.inquiryId,
          tenantId: input.tenantId,
          action: input.action,
          status: "sending",
          attemptId,
          attempts: (existing?.attempts || 0) + 1,
          startedAt: input.now,
        };
        await redis.set(stateKey, checkpoint, { ex: DELIVERY_TTL_SECONDS });
        return { acquired: true, attemptId, checkpoint };
      } catch (error) {
        await redis.del(lockKey).catch(() => {});
        throw error;
      }
    },
    async markAccepted(input) {
      if (!redis) return unavailable();
      const stateKey = checkpointKey(input.tenantId, input.inquiryId, input.action);
      const current = parseCheckpoint(await redis.get(stateKey), input.tenantId, input.inquiryId, input.action);
      if (!current || current.attemptId !== input.attemptId || current.status !== "sending") throw new Error("inquiry_delivery_attempt_mismatch");
      const next: InquiryDeliveryCheckpoint = {
        ...current,
        status: "accepted",
        acceptedAt: input.acceptedAt,
        ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
        ...(input.replyTo ? { replyTo: input.replyTo.trim().toLowerCase().slice(0, 320) } : {}),
      };
      if (!redis.eval) throw new Error("atomic_inquiry_delivery_acceptance_unavailable");
      const target: ProviderMessageTarget | null = input.providerMessageId
        ? {
            tenantId: input.tenantId,
            inquiryId: input.inquiryId,
            action: input.action,
            providerMessageId: input.providerMessageId,
          }
        : null;
      const replyTarget = input.replyTo && input.providerMessageId
        ? { tenantId: input.tenantId, inquiryId: input.inquiryId, replyTo: input.replyTo.toLowerCase() }
        : null;
      const stateKeyForUnusedIndex = stateKey;
      await redis.eval(
        MARK_ACCEPTED_SCRIPT,
        [
          stateKey,
          input.providerMessageId ? providerMessageKey(input.tenantId, input.providerMessageId) : stateKeyForUnusedIndex,
          input.replyTo && input.providerMessageId ? replyAddressKey(input.tenantId, input.replyTo) : stateKeyForUnusedIndex,
          input.replyTo && input.providerMessageId ? replyAddressAnyKey(input.replyTo) : stateKeyForUnusedIndex,
        ],
        [JSON.stringify(next), target ? JSON.stringify(target) : "", replyTarget ? JSON.stringify(replyTarget) : "", replyTarget ? JSON.stringify(replyTarget) : "", String(DELIVERY_TTL_SECONDS)],
      );
      return next;
    },
    async markVerified(input) {
      if (!redis) return unavailable();
      const stateKey = checkpointKey(input.tenantId, input.inquiryId, input.action);
      const current = parseCheckpoint(await redis.get(stateKey), input.tenantId, input.inquiryId, input.action);
      if (!current || current.attemptId !== input.attemptId || (current.status !== "accepted" && current.status !== "accepted_unverified")) throw new Error("inquiry_delivery_attempt_mismatch");
      const next: InquiryDeliveryCheckpoint = { ...current, status: "verified", verificationEvidence: input.evidence?.slice(0, 20) || [] };
      if (!redis.eval) throw new Error("atomic_inquiry_delivery_verification_unavailable");
      const updated = await redis.eval<string>(
        MARK_ACCEPTED_STATE_SCRIPT,
        [stateKey],
        [JSON.stringify(next), input.attemptId, String(DELIVERY_TTL_SECONDS)],
      );
      const parsed = parseCheckpoint(updated, input.tenantId, input.inquiryId, input.action);
      if (!parsed || parsed.attemptId !== input.attemptId || parsed.status !== "verified") throw new Error("inquiry_delivery_attempt_mismatch");
      return parsed;
    },
    async markAcceptedUnverified(input) {
      if (!redis) return unavailable();
      const stateKey = checkpointKey(input.tenantId, input.inquiryId, input.action);
      const current = parseCheckpoint(await redis.get(stateKey), input.tenantId, input.inquiryId, input.action);
      if (!current || current.attemptId !== input.attemptId || (current.status !== "accepted" && current.status !== "accepted_unverified")) throw new Error("inquiry_delivery_attempt_mismatch");
      const next: InquiryDeliveryCheckpoint = { ...current, status: "accepted_unverified", verificationReason: input.reason.slice(0, 240), retryable: false };
      if (!redis.eval) throw new Error("atomic_inquiry_delivery_verification_unavailable");
      const updated = await redis.eval<string>(
        MARK_ACCEPTED_STATE_SCRIPT,
        [stateKey],
        [JSON.stringify(next), input.attemptId, String(DELIVERY_TTL_SECONDS)],
      );
      const parsed = parseCheckpoint(updated, input.tenantId, input.inquiryId, input.action);
      if (!parsed || parsed.attemptId !== input.attemptId || parsed.status !== "accepted_unverified") throw new Error("inquiry_delivery_attempt_mismatch");
      return parsed;
    },
    async markProviderOutcome(input: InquiryDeliveryProviderEventInput) {
      if (!redis) return unavailable();
      const stateKey = checkpointKey(input.tenantId, input.inquiryId, input.action);
      const current = parseCheckpoint(await redis.get(stateKey), input.tenantId, input.inquiryId, input.action);
      if (!current || current.providerMessageId !== input.providerMessageId) throw new Error("inquiry_delivery_provider_message_mismatch");
      if (current.providerEventId === input.providerEventId) return current;
      if (current.status === "sending" || current.status === "unknown") throw new Error("inquiry_delivery_acceptance_required");
      const normalizedAt = providerEventAt(input.at);
      if (!shouldApplyProviderOutcome(current, input, normalizedAt)) return current;
      const statusByOutcome: Record<NonNullable<InquiryDeliveryCheckpoint["providerOutcome"]>, InquiryDeliveryCheckpoint["status"]> = {
        delivered: "delivered",
        bounced: "bounced",
        deferred: "deferred",
        failed: "failed",
        suppressed: "suppressed",
      };
      const reason = input.reason?.slice(0, 240);
      const evidence = input.evidence?.filter((item): item is string => typeof item === "string").slice(0, 20);
      const next: InquiryDeliveryCheckpoint = {
        ...current,
        status: statusByOutcome[input.outcome],
        providerOutcome: input.outcome,
        providerEventId: input.providerEventId.slice(0, 240),
        providerEventAt: normalizedAt,
        ...(evidence?.length ? { verificationEvidence: evidence } : {}),
        ...(reason ? { verificationReason: reason } : {}),
        ...(input.outcome === "delivered" ? { retryable: false } : { failureReason: reason || `provider_${input.outcome}`, retryable: false }),
      };
      if (!redis.eval) throw new Error("atomic_inquiry_provider_outcome_unavailable");
      const updated = await redis.eval<string>(
        MARK_PROVIDER_OUTCOME_SCRIPT,
        [stateKey],
        [JSON.stringify(next), input.outcome, normalizedAt, input.providerEventId.slice(0, 240), String(DELIVERY_TTL_SECONDS), input.providerMessageId],
      );
      const parsed = parseCheckpoint(updated, input.tenantId, input.inquiryId, input.action);
      if (!parsed) throw new Error("inquiry_delivery_provider_outcome_unavailable");
      return parsed;
    },
    async claimProviderEvent(input) {
      if (!redis) return unavailable();
      if (!redis.eval) throw new Error("atomic_inquiry_provider_claim_unavailable");
      const token = randomUUID();
      const result = await redis.eval<string>(
        CLAIM_PROVIDER_EVENT_SCRIPT,
        [providerEventKey(input.tenantId, input.providerEventId)],
        [token, String(PROVIDER_EVENT_CLAIM_TTL_SECONDS)],
      );
      if (result === "claimed") return { status: "claimed", token } satisfies InquiryDeliveryProviderEventClaim;
      if (result === "completed") return { status: "completed" } satisfies InquiryDeliveryProviderEventClaim;
      return { status: "processing" } satisfies InquiryDeliveryProviderEventClaim;
    },
    async completeProviderEvent(input) {
      if (!redis) return unavailable();
      if (!redis.eval) throw new Error("atomic_inquiry_provider_claim_unavailable");
      await redis.eval(
        COMPLETE_PROVIDER_EVENT_SCRIPT,
        [providerEventKey(input.tenantId, input.providerEventId)],
        [input.claimToken, String(DELIVERY_TTL_SECONDS)],
      );
    },
    async releaseProviderEvent(input) {
      if (!redis) return unavailable();
      if (!redis.eval) throw new Error("atomic_inquiry_provider_claim_unavailable");
      await redis.eval(
        RELEASE_PROVIDER_EVENT_SCRIPT,
        [providerEventKey(input.tenantId, input.providerEventId)],
        [input.claimToken],
      );
    },
    async findByProviderMessageId(input) {
      if (!redis) return unavailable();
      const target = parseProviderMessageTarget(
        await redis.get(providerMessageKey(input.tenantId, input.providerMessageId)),
        input.tenantId,
        input.providerMessageId,
      );
      return target ? { inquiryId: target.inquiryId, action: target.action } : null;
    },
    async findByReplyAddress(input) {
      if (!redis) return unavailable();
      let raw: unknown = await redis.get(replyAddressKey(input.tenantId, input.replyTo));
      if (typeof raw === "string") {
        try {
          raw = JSON.parse(raw);
        } catch {
          return null;
        }
      }
      if (!raw || typeof raw !== "object") return null;
      const row = raw as { tenantId?: unknown; inquiryId?: unknown; replyTo?: unknown };
      if (row.tenantId !== input.tenantId || typeof row.inquiryId !== "string" || row.replyTo !== input.replyTo.trim().toLowerCase()) return null;
      return { inquiryId: row.inquiryId };
    },
    async findByReplyAddressAny(input) {
      if (!redis) return unavailable();
      let raw: unknown = await redis.get(replyAddressAnyKey(input.replyTo));
      if (typeof raw === "string") {
        try {
          raw = JSON.parse(raw);
        } catch {
          return null;
        }
      }
      if (!raw || typeof raw !== "object") return null;
      const row = raw as { tenantId?: unknown; inquiryId?: unknown; replyTo?: unknown };
      if (typeof row.tenantId !== "string" || typeof row.inquiryId !== "string" || row.replyTo !== input.replyTo.trim().toLowerCase()) return null;
      return { tenantId: row.tenantId, inquiryId: row.inquiryId };
    },
    async getReplyState(input) {
      if (!redis) return unavailable();
      return parseReplyState(await redis.get(replyStateKey(input.tenantId, input.inquiryId)), input.tenantId, input.inquiryId);
    },
    async markReplyReceived(input) {
      if (!redis) return unavailable();
      const stateKey = replyStateKey(input.tenantId, input.inquiryId);
      const current = parseReplyState(await redis.get(stateKey), input.tenantId, input.inquiryId);
      if (current) return current;
      const next: InquiryDeliveryReplyState = {
        tenantId: input.tenantId,
        inquiryId: input.inquiryId,
        providerMessageId: input.providerMessageId.slice(0, 240),
        providerEventId: input.providerEventId.slice(0, 240),
        receivedAt: input.receivedAt,
      };
      await redis.set(stateKey, next, { ex: DELIVERY_TTL_SECONDS });
      return next;
    },
    async markFailed(input) {
      if (!redis) return unavailable();
      const stateKey = checkpointKey(input.tenantId, input.inquiryId, input.action);
      const current = parseCheckpoint(await redis.get(stateKey), input.tenantId, input.inquiryId, input.action);
      if (!current || current.attemptId !== input.attemptId || current.status !== "sending") throw new Error("inquiry_delivery_attempt_mismatch");
      const next: InquiryDeliveryCheckpoint = {
        ...current,
        status: input.ambiguous ? "unknown" : "failed",
        failureReason: input.reason.slice(0, 240),
        retryable: input.retryable && !input.ambiguous,
      };
      await redis.set(stateKey, next, { ex: DELIVERY_TTL_SECONDS });
      return next;
    },
    async releaseAttempt(input) {
      if (!redis) return unavailable();
      const lockKey = claimKey(input.tenantId, input.inquiryId, input.action);
      const owner = await redis.get<string>(lockKey);
      if (owner === input.attemptId) await redis.del(lockKey);
    },
    async appendTimeline(input) {
      if (!redis) return unavailable();
      const event = { ...input, at: input.at || new Date().toISOString(), summary: input.summary.slice(0, 500) };
      const key = timelineKey(input.tenantId, input.inquiryId);
      await redis.zadd(key, { score: Date.parse(event.at) || Date.now(), member: JSON.stringify(event) });
      if (redis.zremrangebyrank) await redis.zremrangebyrank(key, 0, -(DELIVERY_TIMELINE_KEEP + 1));
    },
    async listTimeline(input) {
      if (!redis) return unavailable();
      const key = timelineKey(input.tenantId, input.inquiryId);
      const raw = await redis.zrange<string[]>(key, 0, Math.max(0, (input.limit ?? 50) - 1), { rev: true });
      return (raw || []).map((value) => parseTimeline(value, input.tenantId, input.inquiryId)).filter((event): event is InquiryDeliveryTimelineInput => Boolean(event));
    },
  };
}

/** Explicit test-only store. It has no provider behavior and is never the default. */
export function createMemoryInquiryDeliveryStore(): InquiryDeliveryStore {
  const checkpoints = new Map<string, InquiryDeliveryCheckpoint>();
  const claims = new Map<string, string>();
  const budgets = new Map<string, number>();
  const timeline = new Map<string, InquiryDeliveryTimelineInput[]>();
  const providerMessages = new Map<string, ProviderMessageTarget>();
  const providerEvents = new Map<string, { status: "processing" | "completed"; token?: string }>();
  const replyAddresses = new Map<string, { tenantId: string; inquiryId: string; replyTo: string }>();
  const replyStates = new Map<string, InquiryDeliveryReplyState>();
  const key = (tenantId: string, inquiryId: string, action: InquiryDeliveryAction) => `${tenantId}:${inquiryId}:${action}`;
  const providerKey = (tenantId: string, providerMessageId: string) => `${tenantId}:${providerMessageId}`;
  const replyKey = (tenantId: string, replyTo: string) => `${tenantId}:${replyTo.trim().toLowerCase()}`;
  const budgetDate = (tenantId: string, budget: InquiryDeliveryBudgetReservation): string | null => {
    const date = localDateKey(budget.now, budget.timezone);
    return date ? `${tenantId}:${budget.policyVersion}:${date}` : null;
  };
  return {
    durable: true,
    atomicBudget: true,
    async getCheckpoint(input) {
      const current = checkpoints.get(key(input.tenantId, input.inquiryId, input.action));
      return current?.tenantId === input.tenantId ? current : null;
    },
    async beginAttempt(input) {
      const stateKey = key(input.tenantId, input.inquiryId, input.action);
      const existing = checkpoints.get(stateKey);
      if (existing && existing.tenantId !== input.tenantId) return { acquired: false, reason: "tenant_mismatch" };
      const terminal = ["accepted", "verified", "delivered", "bounced", "deferred", "suppressed", "accepted_unverified"].includes(existing?.status || "")
        || (existing?.status === "failed" && existing.retryable !== true);
      if (terminal) return { acquired: false, checkpoint: existing, reason: "already_accepted" };
      if (existing?.status === "sending" || existing?.status === "unknown") return { acquired: false, checkpoint: existing, reason: "reconciliation_required" };
      if (existing && existing.attempts >= input.maxAttempts) return { acquired: false, checkpoint: existing, reason: "retry_exhausted" };
      if (claims.has(stateKey)) return { acquired: false, checkpoint: existing, reason: "action_in_progress" };
      const budgetKeyValue = budgetDate(input.tenantId, input.budget);
      if (!budgetKeyValue) return { acquired: false, checkpoint: existing, reason: "daily_budget_unavailable" };
      const used = budgets.get(budgetKeyValue) || 0;
      if (used >= input.budget.limit) return { acquired: false, checkpoint: existing, reason: "budget_exhausted" };
      budgets.set(budgetKeyValue, used + 1);
      const attemptId = randomUUID();
      claims.set(stateKey, attemptId);
      const checkpoint: InquiryDeliveryCheckpoint = { inquiryId: input.inquiryId, tenantId: input.tenantId, action: input.action, status: "sending", attemptId, attempts: (existing?.attempts || 0) + 1, startedAt: input.now };
      checkpoints.set(stateKey, checkpoint);
      return { acquired: true, attemptId, checkpoint };
    },
    async markAccepted(input) {
      const stateKey = key(input.tenantId, input.inquiryId, input.action);
      const current = checkpoints.get(stateKey);
      if (!current || current.tenantId !== input.tenantId || current.attemptId !== input.attemptId || current.status !== "sending") throw new Error("inquiry_delivery_attempt_mismatch");
      const next = {
        ...current,
        status: "accepted" as const,
        acceptedAt: input.acceptedAt,
        ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
        ...(input.replyTo ? { replyTo: input.replyTo.trim().toLowerCase().slice(0, 320) } : {}),
      };
      checkpoints.set(stateKey, next);
      if (input.providerMessageId) {
        providerMessages.set(providerKey(input.tenantId, input.providerMessageId), {
          tenantId: input.tenantId,
          inquiryId: input.inquiryId,
          action: input.action,
          providerMessageId: input.providerMessageId,
        });
        if (input.replyTo) {
          const replyTarget = {
            tenantId: input.tenantId,
            inquiryId: input.inquiryId,
            replyTo: input.replyTo.trim().toLowerCase(),
          };
          replyAddresses.set(replyKey(input.tenantId, input.replyTo), replyTarget);
          replyAddresses.set(replyTarget.replyTo, replyTarget);
        }
      }
      return next;
    },
    async markVerified(input) {
      const stateKey = key(input.tenantId, input.inquiryId, input.action);
      const current = checkpoints.get(stateKey);
      if (!current || current.tenantId !== input.tenantId || current.attemptId !== input.attemptId || (current.status !== "accepted" && current.status !== "accepted_unverified")) throw new Error("inquiry_delivery_attempt_mismatch");
      const next = { ...current, status: "verified" as const, verificationEvidence: input.evidence || [] };
      checkpoints.set(stateKey, next);
      return next;
    },
    async markAcceptedUnverified(input) {
      const stateKey = key(input.tenantId, input.inquiryId, input.action);
      const current = checkpoints.get(stateKey);
      if (!current || current.tenantId !== input.tenantId || current.attemptId !== input.attemptId || (current.status !== "accepted" && current.status !== "accepted_unverified")) throw new Error("inquiry_delivery_attempt_mismatch");
      const next = { ...current, status: "accepted_unverified" as const, verificationReason: input.reason, retryable: false };
      checkpoints.set(stateKey, next);
      return next;
    },
    async markProviderOutcome(input) {
      const stateKey = key(input.tenantId, input.inquiryId, input.action);
      const current = checkpoints.get(stateKey);
      if (!current || current.providerMessageId !== input.providerMessageId) throw new Error("inquiry_delivery_provider_message_mismatch");
      if (current.providerEventId === input.providerEventId) return current;
      if (current.status === "sending" || current.status === "unknown") throw new Error("inquiry_delivery_acceptance_required");
      const normalizedAt = providerEventAt(input.at);
      if (!shouldApplyProviderOutcome(current, input, normalizedAt)) return current;
      const statusByOutcome: Record<NonNullable<InquiryDeliveryCheckpoint["providerOutcome"]>, InquiryDeliveryCheckpoint["status"]> = {
        delivered: "delivered",
        bounced: "bounced",
        deferred: "deferred",
        failed: "failed",
        suppressed: "suppressed",
      };
      const reason = input.reason?.slice(0, 240);
      const evidence = input.evidence?.filter((item): item is string => typeof item === "string").slice(0, 20);
      const next: InquiryDeliveryCheckpoint = {
        ...current,
        status: statusByOutcome[input.outcome],
        providerOutcome: input.outcome,
        providerEventId: input.providerEventId.slice(0, 240),
        providerEventAt: normalizedAt,
        ...(evidence?.length ? { verificationEvidence: evidence } : {}),
        ...(reason ? { verificationReason: reason } : {}),
        ...(input.outcome === "delivered" ? { retryable: false } : { failureReason: reason || `provider_${input.outcome}`, retryable: false }),
      };
      checkpoints.set(stateKey, next);
      return next;
    },
    async claimProviderEvent(input) {
      const eventKey = `${input.tenantId}:${input.providerEventId}`;
      const current = providerEvents.get(eventKey);
      if (current?.status === "completed") return { status: "completed" };
      if (current?.status === "processing") return { status: "processing" };
      const token = randomUUID();
      providerEvents.set(eventKey, { status: "processing", token });
      return { status: "claimed", token };
    },
    async completeProviderEvent(input) {
      const eventKey = `${input.tenantId}:${input.providerEventId}`;
      const current = providerEvents.get(eventKey);
      if (current?.status === "processing" && current.token === input.claimToken) {
        providerEvents.set(eventKey, { status: "completed" });
      }
    },
    async releaseProviderEvent(input) {
      const eventKey = `${input.tenantId}:${input.providerEventId}`;
      const current = providerEvents.get(eventKey);
      if (current?.status === "processing" && current.token === input.claimToken) providerEvents.delete(eventKey);
    },
    async findByProviderMessageId(input) {
      const target = providerMessages.get(providerKey(input.tenantId, input.providerMessageId));
      return target ? { inquiryId: target.inquiryId, action: target.action } : null;
    },
    async findByReplyAddress(input) {
      const target = replyAddresses.get(replyKey(input.tenantId, input.replyTo));
      return target && target.tenantId === input.tenantId ? { inquiryId: target.inquiryId } : null;
    },
    async findByReplyAddressAny(input) {
      const target = replyAddresses.get(input.replyTo.trim().toLowerCase());
      return target ? { tenantId: target.tenantId, inquiryId: target.inquiryId } : null;
    },
    async getReplyState(input) {
      return replyStates.get(key(input.tenantId, input.inquiryId, "reply")) || null;
    },
    async markReplyReceived(input) {
      const stateKey = key(input.tenantId, input.inquiryId, "reply");
      const current = replyStates.get(stateKey);
      if (current) return current;
      const next: InquiryDeliveryReplyState = {
        tenantId: input.tenantId,
        inquiryId: input.inquiryId,
        providerMessageId: input.providerMessageId,
        providerEventId: input.providerEventId,
        receivedAt: input.receivedAt,
      };
      replyStates.set(stateKey, next);
      return next;
    },
    async markFailed(input) {
      const stateKey = key(input.tenantId, input.inquiryId, input.action);
      const current = checkpoints.get(stateKey);
      if (!current || current.tenantId !== input.tenantId || current.attemptId !== input.attemptId || current.status !== "sending") throw new Error("inquiry_delivery_attempt_mismatch");
      const next = { ...current, status: input.ambiguous ? "unknown" as const : "failed" as const, failureReason: input.reason, retryable: input.retryable && !input.ambiguous };
      checkpoints.set(stateKey, next);
      return next;
    },
    async releaseAttempt(input) {
      const stateKey = key(input.tenantId, input.inquiryId, input.action);
      if (claims.get(stateKey) === input.attemptId) claims.delete(stateKey);
    },
    async appendTimeline(input) {
      const stateKey = `${input.tenantId}:${input.inquiryId}`;
      const current = timeline.get(stateKey) || [];
      if (input.causedByEventId && current.some((event) => event.causedByEventId === input.causedByEventId)) return;
      timeline.set(stateKey, [{ ...input, at: input.at || new Date().toISOString() }, ...current].slice(0, DELIVERY_TIMELINE_KEEP));
    },
    async listTimeline(input) {
      return (timeline.get(`${input.tenantId}:${input.inquiryId}`) || []).slice(0, input.limit ?? 50);
    },
  };
}
