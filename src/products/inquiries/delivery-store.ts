/**
 * Internal inquiry delivery store. Accepted checkpoints and routing dual-write
 * to the shared stable-id client-record home. A parity-gated flip recovers
 * markers after cache expiry; Redis still owns ephemeral atomic claims/budgets.
 */

import { createHash, randomUUID } from "node:crypto";

import { getRedis } from "@/platform/infra/redis";
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
import { mirrorClientRecord, clientRecordDb, writeClientRecord, type ClientRecord, type ClientRecordStore, type ClientRecordMode } from "@/platform/client-records/mirror";
import { clientRecordReadStores, clientRecordReadSource, readAllClientRecords, readThroughFlag } from "@/platform/client-records/move";
import { FIRST_REPLY_ACTIONS, firstReplyRecord, timelineRecord, inquiryDeliveryRecord, inquiryDeliveryRecordId, type InquiryDeliveryRecordKind } from "@/platform/client-records/stores";
import { copyInquiryEvent } from "@/lib/inquiry-records";
import {
  BUDGET_RESERVATION_SCRIPT,
  MARK_ACCEPTED_SCRIPT,
  MARK_ACCEPTED_STATE_SCRIPT,
  MARK_PROVIDER_OUTCOME_SCRIPT,
  CLAIM_PROVIDER_EVENT_SCRIPT,
  COMPLETE_PROVIDER_EVENT_SCRIPT,
  RELEASE_PROVIDER_EVENT_SCRIPT,
} from "./delivery-scripts";

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
    // Older checkpoints have no digest. Leave it absent rather than guessing.
    ...(typeof row.messageDigest === "string" && row.messageDigest ? { messageDigest: row.messageDigest.slice(0, 128) } : {}),
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

/** A selected durable projection was not confirmed; provider acceptance is still real. */
export class InquiryDeliveryDurableWriteError extends Error {
  constructor() {
    super("inquiry_delivery_durable_write_unavailable");
    this.name = "InquiryDeliveryDurableWriteError";
  }
}

async function persistDeliveryRecord(store: ClientRecordStore, tenantId: string, record: ClientRecord, mode: ClientRecordMode = "replace"): Promise<void> {
  if (!clientRecordReadStores().has(store)) {
    await mirrorClientRecord(store, tenantId, record, mode);
    return;
  }
  try {
    await clientRecordReadSource(store);
    const result = await writeClientRecord(store, tenantId, record, "dual_write", mode, clientRecordDb());
    if (result.status === "failed" || result.status === "skipped" || (result.status === "kept" && mode !== "keep_first")) {
      throw new InquiryDeliveryDurableWriteError();
    }
  } catch {
    throw new InquiryDeliveryDurableWriteError();
  }
}

/** Redis owns atomic claims/budgets; selected durable projections must be confirmed. */
export function createRedisInquiryDeliveryStore(
  redisInput: ReturnType<typeof getRedis> = getRedis(),
): InquiryDeliveryStore {
  const redis = redisLike(redisInput);
  const unavailable = () => {
    throw new Error("inquiry_delivery_persistence_unavailable");
  };
  const mirrorDelivery = async (kind: InquiryDeliveryRecordKind, tenantId: string, key: string, value: unknown) => {
    await persistDeliveryRecord("inquiry_delivery", tenantId, inquiryDeliveryRecord(kind, key, value));
  };
  /** Current atomic transitions use Redis. A lost cache is hydrated under NX,
   * so recovery never overwrites a concurrent provider outcome or send marker.
   * Once a read flip was requested, inability to prove marker absence blocks
   * a new send instead of resending an old accepted message. */
  const deliveryValue = async (kind: InquiryDeliveryRecordKind, tenantId: string, key: string, redisKey: string, atomic = false): Promise<unknown> => {
    if (!clientRecordReadStores().has("inquiry_delivery")) {
      if (!redis) return unavailable();
      return redis.get(redisKey);
    }
    await clientRecordReadSource("inquiry_delivery");
    let records;
    try { records = await readAllClientRecords("inquiry_delivery", tenantId); }
    catch { throw new Error("inquiry_delivery_durable_read_unavailable"); }
    const stored = records.find(record => record.recordId === inquiryDeliveryRecordId(kind, key))?.payload.value;
    const value = stored && typeof stored === "object" && !Array.isArray(stored) ? { ...stored as Record<string, unknown>, tenantId } : stored ?? null;
    if (!atomic) return value;
    if (!redis) return unavailable();
    const cached = await redis.get(redisKey);
    if (cached !== null) return cached;
    if (value !== null) {
      await redis.set(redisKey, value, { nx: true, ex: DELIVERY_TTL_SECONDS });
      return redis.get(redisKey);
    }
    return null;
  };
  return {
    durable: Boolean(redis),
    atomicBudget: Boolean(redis?.eval),
    async getCheckpoint(input) {
      return parseCheckpoint(await deliveryValue("checkpoint", input.tenantId, `${keyPart(input.inquiryId)}:${input.action}`, checkpointKey(input.tenantId, input.inquiryId, input.action)), input.tenantId, input.inquiryId, input.action);
    },
    async beginAttempt(input) {
      if (!redis) return unavailable();
      const stateKey = checkpointKey(input.tenantId, input.inquiryId, input.action);
      const existing = parseCheckpoint(await deliveryValue("checkpoint", input.tenantId, `${keyPart(input.inquiryId)}:${input.action}`, stateKey, true), input.tenantId, input.inquiryId, input.action);
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
          ...(input.messageDigest ? { messageDigest: input.messageDigest.slice(0, 128) } : {}),
        };
        await redis.set(stateKey, checkpoint, { ex: DELIVERY_TTL_SECONDS });
        await mirrorDelivery("checkpoint", input.tenantId, `${keyPart(input.inquiryId)}:${input.action}`, checkpoint);
        return { acquired: true, attemptId, checkpoint };
      } catch (error) {
        await redis.del(lockKey).catch(() => {});
        throw error;
      }
    },
    async repairAcceptedProjections(input) {
      return this.markAccepted(input);
    },
    async markAccepted(input) {
      if (!redis) return unavailable();
      const stateKey = checkpointKey(input.tenantId, input.inquiryId, input.action);
      const current = parseCheckpoint(await deliveryValue("checkpoint", input.tenantId, `${keyPart(input.inquiryId)}:${input.action}`, stateKey, true), input.tenantId, input.inquiryId, input.action);
      const repairing = Boolean(current?.acceptedAt && current.acceptedAt === input.acceptedAt && current.attemptId === input.attemptId
        && current.providerMessageId === input.providerMessageId
        && (current.replyTo ?? null) === (input.replyTo?.trim().toLowerCase().slice(0, 320) ?? null));
      if (!current || current.attemptId !== input.attemptId || (current.status !== "sending" && !repairing)) throw new Error("inquiry_delivery_attempt_mismatch");
      const next: InquiryDeliveryCheckpoint = repairing ? current : {
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
      if (!repairing) await redis.eval(
        MARK_ACCEPTED_SCRIPT,
        [
          stateKey,
          input.providerMessageId ? providerMessageKey(input.tenantId, input.providerMessageId) : stateKeyForUnusedIndex,
          input.replyTo && input.providerMessageId ? replyAddressKey(input.tenantId, input.replyTo) : stateKeyForUnusedIndex,
          input.replyTo && input.providerMessageId ? replyAddressAnyKey(input.replyTo) : stateKeyForUnusedIndex,
        ],
        [JSON.stringify(next), target ? JSON.stringify(target) : "", replyTarget ? JSON.stringify(replyTarget) : "", replyTarget ? JSON.stringify(replyTarget) : "", String(DELIVERY_TTL_SECONDS)],
      );
      if (target) await mirrorDelivery("provider_target", input.tenantId, keyPart(input.providerMessageId!), target);
      if (replyTarget) await mirrorDelivery("reply_target", input.tenantId, keyPart(input.replyTo!.toLowerCase()), replyTarget);
      // The first message to the customer is the inquiry's first reply (outcome loop).
      if ((FIRST_REPLY_ACTIONS as readonly string[]).includes(input.action)) {
        await persistDeliveryRecord("inquiry_reply", input.tenantId, firstReplyRecord(input.inquiryId, input.acceptedAt, input.action), "keep_first");
      }
      // Persist acceptance last: an accepted checkpoint proves its routing and
      // selected first-reply projections were confirmed too. Preserve a provider winner.
      const committed = parseCheckpoint(await redis.get(stateKey), input.tenantId, input.inquiryId, input.action);
      if (!committed || committed.attemptId !== input.attemptId) throw new Error("inquiry_delivery_attempt_mismatch");
      await mirrorDelivery("checkpoint", input.tenantId, `${keyPart(input.inquiryId)}:${input.action}`, committed);
      // inquiry_events copy (off unless STRELVA_INQUIRY_RECORDS=1; never throws).
      await copyInquiryEvent({
        tenantId: input.tenantId, inquiryId: input.inquiryId, kind: "delivery",
        detail: { action: input.action, status: "accepted", acceptedAt: input.acceptedAt, ...(input.providerMessageId ? { providerMessageId: input.providerMessageId.slice(0, 240) } : {}) },
        dedupeKey: `delivery:${input.action}:${input.attemptId}`,
      });
      return committed;
    },
    async markVerified(input) {
      if (!redis) return unavailable();
      const stateKey = checkpointKey(input.tenantId, input.inquiryId, input.action);
      const current = parseCheckpoint(await deliveryValue("checkpoint", input.tenantId, `${keyPart(input.inquiryId)}:${input.action}`, stateKey, true), input.tenantId, input.inquiryId, input.action);
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
      await mirrorDelivery("checkpoint", input.tenantId, `${keyPart(input.inquiryId)}:${input.action}`, parsed);
      return parsed;
    },
    async markAcceptedUnverified(input) {
      if (!redis) return unavailable();
      const stateKey = checkpointKey(input.tenantId, input.inquiryId, input.action);
      const current = parseCheckpoint(await deliveryValue("checkpoint", input.tenantId, `${keyPart(input.inquiryId)}:${input.action}`, stateKey, true), input.tenantId, input.inquiryId, input.action);
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
      await mirrorDelivery("checkpoint", input.tenantId, `${keyPart(input.inquiryId)}:${input.action}`, parsed);
      return parsed;
    },
    async markProviderOutcome(input: InquiryDeliveryProviderEventInput) {
      if (!redis) return unavailable();
      const stateKey = checkpointKey(input.tenantId, input.inquiryId, input.action);
      const current = parseCheckpoint(await deliveryValue("checkpoint", input.tenantId, `${keyPart(input.inquiryId)}:${input.action}`, stateKey, true), input.tenantId, input.inquiryId, input.action);
      if (!current || current.providerMessageId !== input.providerMessageId) throw new Error("inquiry_delivery_provider_message_mismatch");
      if (current.providerEventId === input.providerEventId) {
        await mirrorDelivery("checkpoint", input.tenantId, `${keyPart(input.inquiryId)}:${input.action}`, current);
        return current;
      }
      if (current.status === "sending" || current.status === "unknown") throw new Error("inquiry_delivery_acceptance_required");
      const normalizedAt = providerEventAt(input.at);
      if (!shouldApplyProviderOutcome(current, input, normalizedAt)) {
        await mirrorDelivery("checkpoint", input.tenantId, `${keyPart(input.inquiryId)}:${input.action}`, current);
        return current;
      }
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
      await mirrorDelivery("checkpoint", input.tenantId, `${keyPart(input.inquiryId)}:${input.action}`, parsed);
      return parsed;
    },
    async claimProviderEvent(input) {
      if (!redis) return unavailable();
      if (!redis.eval) throw new Error("atomic_inquiry_provider_claim_unavailable");
      if (clientRecordReadStores().has("inquiry_delivery")) {
        const completed = await deliveryValue("provider_event", input.tenantId, keyPart(input.providerEventId), providerEventKey(input.tenantId, input.providerEventId), true);
        if (completed === "completed") {
          await mirrorDelivery("provider_event", input.tenantId, keyPart(input.providerEventId), "completed");
          return { status: "completed" } satisfies InquiryDeliveryProviderEventClaim;
        }
      }
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
      const completed = await redis.eval<number>(
        COMPLETE_PROVIDER_EVENT_SCRIPT,
        [providerEventKey(input.tenantId, input.providerEventId)],
        [input.claimToken, String(DELIVERY_TTL_SECONDS)],
      );
      if (completed === 1) await mirrorDelivery("provider_event", input.tenantId, keyPart(input.providerEventId), "completed");
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
      const target = parseProviderMessageTarget(
        await deliveryValue("provider_target", input.tenantId, keyPart(input.providerMessageId), providerMessageKey(input.tenantId, input.providerMessageId)),
        input.tenantId,
        input.providerMessageId,
      );
      return target ? { inquiryId: target.inquiryId, action: target.action } : null;
    },
    async findByReplyAddress(input) {
      let raw: unknown = await deliveryValue("reply_target", input.tenantId, keyPart(input.replyTo.toLowerCase()), replyAddressKey(input.tenantId, input.replyTo));
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
      if (await clientRecordReadSource("inquiry_delivery") === "postgres") {
        const result = await clientRecordDb()?.rpc("find_inquiry_delivery_reply_target", { p_reply_to: input.replyTo.trim().toLowerCase() });
        if (!result || result.error) throw new Error("inquiry_delivery_durable_read_unavailable");
        if (result.data === null) return null;
        if (result.data && typeof result.data === "object") {
          const target = result.data as { tenantId?: unknown; inquiryId?: unknown };
          if (typeof target.tenantId === "string" && typeof target.inquiryId === "string") return { tenantId: target.tenantId, inquiryId: target.inquiryId };
        }
        throw new Error("inquiry_delivery_durable_read_unavailable");
      }
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
      return parseReplyState(await deliveryValue("reply_state", input.tenantId, keyPart(input.inquiryId), replyStateKey(input.tenantId, input.inquiryId)), input.tenantId, input.inquiryId);
    },
    async markReplyReceived(input) {
      if (!redis) return unavailable();
      const stateKey = replyStateKey(input.tenantId, input.inquiryId);
      const current = parseReplyState(await deliveryValue("reply_state", input.tenantId, keyPart(input.inquiryId), stateKey, true), input.tenantId, input.inquiryId);
      if (current) {
        await mirrorDelivery("reply_state", input.tenantId, keyPart(input.inquiryId), current);
        return current;
      }
      const next: InquiryDeliveryReplyState = {
        tenantId: input.tenantId,
        inquiryId: input.inquiryId,
        providerMessageId: input.providerMessageId.slice(0, 240),
        providerEventId: input.providerEventId.slice(0, 240),
        receivedAt: input.receivedAt,
      };
      await redis.set(stateKey, next, { ex: DELIVERY_TTL_SECONDS });
      await mirrorDelivery("reply_state", input.tenantId, keyPart(input.inquiryId), next);
      await copyInquiryEvent({
        tenantId: input.tenantId, inquiryId: input.inquiryId, kind: "reply", actor: "system",
        detail: { receivedAt: input.receivedAt }, dedupeKey: `reply:${next.providerEventId}`,
      });
      return next;
    },
    async markFailed(input) {
      if (!redis) return unavailable();
      const stateKey = checkpointKey(input.tenantId, input.inquiryId, input.action);
      const current = parseCheckpoint(await deliveryValue("checkpoint", input.tenantId, `${keyPart(input.inquiryId)}:${input.action}`, stateKey, true), input.tenantId, input.inquiryId, input.action);
      if (!current || current.attemptId !== input.attemptId || current.status !== "sending") throw new Error("inquiry_delivery_attempt_mismatch");
      const next: InquiryDeliveryCheckpoint = {
        ...current,
        status: input.ambiguous ? "unknown" : "failed",
        failureReason: input.reason.slice(0, 240),
        retryable: input.retryable && !input.ambiguous,
      };
      await redis.set(stateKey, next, { ex: DELIVERY_TTL_SECONDS });
      await mirrorDelivery("checkpoint", input.tenantId, `${keyPart(input.inquiryId)}:${input.action}`, next);
      return next;
    },
    async releaseAttempt(input) {
      if (!redis) return unavailable();
      const lockKey = claimKey(input.tenantId, input.inquiryId, input.action);
      const owner = await redis.get<string>(lockKey);
      if (owner === input.attemptId) await redis.del(lockKey);
    },
    async appendTimeline(input) {
      const durable = clientRecordReadStores().has("inquiry_timeline");
      if (durable) await clientRecordReadSource("inquiry_timeline");
      if (!durable && !redis) return unavailable();
      const event = { ...input, at: input.at || new Date().toISOString(), summary: input.summary.slice(0, 500) };
      const key = timelineKey(input.tenantId, input.inquiryId);
      const member = JSON.stringify(event);
      const record = timelineRecord(input.inquiryId, member);
      if (durable && record) await persistDeliveryRecord("inquiry_timeline", input.tenantId, record);
      if (redis) {
        try {
          await redis.zadd(key, { score: Date.parse(event.at) || Date.now(), member });
          if (redis.zremrangebyrank) await redis.zremrangebyrank(key, 0, -(DELIVERY_TIMELINE_KEEP + 1));
        } catch (error) { if (!durable) throw error; }
      }
      // Before cutover this remains a best-effort copy after the Redis write.
      if (!durable && record) await mirrorClientRecord("inquiry_timeline", input.tenantId, record);
      await copyInquiryEvent({
        tenantId: input.tenantId, inquiryId: input.inquiryId, kind: "timeline",
        detail: { type: event.type, summary: event.summary, outcome: event.outcome, ...(event.receiptId ? { receiptId: event.receiptId } : {}) },
        dedupeKey: `timeline:${createHash("sha256").update(member).digest("hex")}`,
      });
    },
    async listTimeline(input) {
      const key = timelineKey(input.tenantId, input.inquiryId);
      return readThroughFlag("inquiry_timeline", input.tenantId, async () => {
        if (!redis) return unavailable();
        const raw = await redis.zrange<string[]>(key, 0, Math.max(0, (input.limit ?? 50) - 1), { rev: true });
        return (raw || []).map(value => parseTimeline(value, input.tenantId, input.inquiryId)).filter((event): event is InquiryDeliveryTimelineInput => Boolean(event));
      }, rows => rows.map(row => parseTimeline({ ...row.payload, tenantId: input.tenantId }, input.tenantId, input.inquiryId))
        .filter((event): event is InquiryDeliveryTimelineInput => Boolean(event)).sort((a,b) => Date.parse(b.at ?? "") - Date.parse(a.at ?? "")).slice(0,input.limit ?? 50));
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
      const checkpoint: InquiryDeliveryCheckpoint = {
        inquiryId: input.inquiryId,
        tenantId: input.tenantId,
        action: input.action,
        status: "sending",
        attemptId,
        attempts: (existing?.attempts || 0) + 1,
        startedAt: input.now,
        ...(input.messageDigest ? { messageDigest: input.messageDigest.slice(0, 128) } : {}),
      };
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
