/**
 * Bounded reconciliation for inquiry edges that can finish after the request
 * has returned: canonical receipt repair and signed email provider events.
 *
 * This module stores only ids, versions, and provider evidence. Customer form
 * fields remain in the lead record and are reread when a repair is processed.
 */

import { getRedis } from "@/lib/redis";
import { getLeadById, getLeads, type LeadRecord } from "@/lib/leads";
import type { InquiryTimelineEventType } from "./contracts";
import type { InquiryRepository, InquiryWorkspaceSnapshot } from "./repository";
import { getInquiryRepository } from "./repository";
import { createRedisInquiryDeliveryStore } from "./delivery-store";
import type {
  InquiryDeliveryAction,
  InquiryDeliveryProviderOutcome,
  InquiryDeliveryStore,
} from "./delivery-types";

const REPAIR_TTL_SECONDS = 90 * 24 * 60 * 60;
const REPAIR_CLAIM_TTL_SECONDS = 15 * 60;
const REPAIR_KEEP = 500;
const REPAIR_MAX_ATTEMPTS = 8;

interface RedisRepairLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: { nx?: boolean; ex?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  zadd(key: string, entry: { score: number; member: string }): Promise<unknown>;
  zrange<T = unknown[]>(key: string, start: number, stop: number, options?: { rev?: boolean }): Promise<T>;
  zremrangebyrank?(key: string, start: number, stop: number): Promise<unknown>;
  multi?: () => RedisRepairTransactionLike;
}

interface RedisRepairTransactionLike {
  set(key: string, value: unknown, options?: { nx?: boolean; ex?: number }): RedisRepairTransactionLike;
  zadd(key: string, entry: { score: number; member: string }): RedisRepairTransactionLike;
  zremrangebyrank?(key: string, start: number, stop: number): RedisRepairTransactionLike;
  exec(): Promise<unknown>;
}

function redisLike(value: ReturnType<typeof getRedis>): RedisRepairLike | null {
  return value as RedisRepairLike | null;
}

function keyPart(value: string): string {
  return encodeURIComponent(value.trim());
}

function repairIndexKey(tenantId: string): string {
  return `reb:inquiry-capture-repair:${keyPart(tenantId)}`;
}

function repairJobKey(tenantId: string, inquiryId: string): string {
  return `reb:inquiry-capture-repair-job:${keyPart(tenantId)}:${keyPart(inquiryId)}`;
}

function repairClaimKey(tenantId: string, inquiryId: string): string {
  return `reb:inquiry-capture-repair-claim:${keyPart(tenantId)}:${keyPart(inquiryId)}`;
}

function parseRepairJob(raw: unknown, tenantId?: string, inquiryId?: string): InquiryCaptureRepairJob | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<InquiryCaptureRepairJob>;
  if (
    typeof row.tenantId !== "string" ||
    typeof row.businessId !== "string" ||
    typeof row.inquiryId !== "string" ||
    typeof row.capabilityId !== "string" ||
    !Number.isSafeInteger(row.capabilityVersion) ||
    typeof row.enqueuedAt !== "string"
  ) return null;
  if ((tenantId && row.tenantId !== tenantId) || (inquiryId && row.inquiryId !== inquiryId)) return null;
  return {
    tenantId: row.tenantId,
    businessId: row.businessId,
    inquiryId: row.inquiryId,
    capabilityId: row.capabilityId,
    capabilityVersion: row.capabilityVersion as number,
    enqueuedAt: row.enqueuedAt,
    attempts: Number.isSafeInteger(row.attempts) && (row.attempts ?? 0) >= 0 ? row.attempts : 0,
    ...(typeof row.lastError === "string" ? { lastError: row.lastError.slice(0, 240) } : {}),
    ...(typeof row.nextAttemptAt === "string" ? { nextAttemptAt: row.nextAttemptAt } : {}),
  };
}

export interface InquiryCaptureRepairJob {
  tenantId: string;
  businessId: string;
  inquiryId: string;
  capabilityId: string;
  capabilityVersion: number;
  enqueuedAt: string;
  attempts?: number;
  lastError?: string;
  nextAttemptAt?: string;
}

export interface InquiryCaptureRepairStore {
  readonly durable: boolean;
  enqueue(job: InquiryCaptureRepairJob): Promise<void>;
  listDue(input: { tenantId?: string; now: string; limit: number }): Promise<InquiryCaptureRepairJob[]>;
  claim(job: InquiryCaptureRepairJob): Promise<boolean>;
  complete(job: InquiryCaptureRepairJob): Promise<void>;
  fail(job: InquiryCaptureRepairJob, reason: string, now: string): Promise<void>;
}

function repairDueAt(job: InquiryCaptureRepairJob, now: string): number {
  const candidate = job.nextAttemptAt ? Date.parse(job.nextAttemptAt) : Date.parse(job.enqueuedAt);
  const current = Date.parse(now);
  return Number.isFinite(candidate) ? candidate : current;
}

function boundedRepairError(reason: unknown): string {
  return (reason instanceof Error ? reason.message : String(reason || "inquiry_capture_repair_failed"))
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 240) || "inquiry_capture_repair_failed";
}

export function createRedisInquiryCaptureRepairStore(
  redisInput: ReturnType<typeof getRedis> = getRedis(),
): InquiryCaptureRepairStore {
  const redis = redisLike(redisInput);
  const unavailable = () => {
    throw new Error("inquiry_capture_repair_persistence_unavailable");
  };
  return {
    durable: Boolean(redis),
    async enqueue(job) {
      if (!redis) return unavailable();
      const key = repairJobKey(job.tenantId, job.inquiryId);
      const existing = parseRepairJob(await redis.get(key), job.tenantId, job.inquiryId);
      const next: InquiryCaptureRepairJob = {
        ...job,
        attempts: existing?.attempts ?? job.attempts ?? 0,
        ...(existing?.lastError ? { lastError: existing.lastError } : job.lastError ? { lastError: job.lastError } : {}),
        ...(existing?.nextAttemptAt ? { nextAttemptAt: existing.nextAttemptAt } : job.nextAttemptAt ? { nextAttemptAt: job.nextAttemptAt } : {}),
      };
      // The payload and its due index form one queue record. A pipeline would
      // still allow a process crash between the two writes, leaving an
      // invisible payload that the cron cannot discover. Redis MULTI keeps the
      // record either fully discoverable or absent so a later enqueue can retry.
      if (!redis.multi) throw new Error("inquiry_capture_repair_transaction_unavailable");
      const transaction = redis.multi();
      transaction
        .set(key, next, { ex: REPAIR_TTL_SECONDS })
        .zadd(repairIndexKey(job.tenantId), { score: repairDueAt(next, job.enqueuedAt), member: job.inquiryId });
      if (transaction.zremrangebyrank) transaction.zremrangebyrank(repairIndexKey(job.tenantId), 0, -(REPAIR_KEEP + 1));
      await transaction.exec();
    },
    async listDue(input) {
      if (!redis) return unavailable();
      if (!input.tenantId) return [];
      const ids = await redis.zrange<string[]>(repairIndexKey(input.tenantId), 0, -1);
      const now = Date.parse(input.now);
      const jobs: InquiryCaptureRepairJob[] = [];
      for (const inquiryId of ids || []) {
        if (jobs.length >= input.limit) break;
        const job = parseRepairJob(await redis.get(repairJobKey(input.tenantId, inquiryId)), input.tenantId, inquiryId);
        if (!job || (job.attempts ?? 0) >= REPAIR_MAX_ATTEMPTS || repairDueAt(job, input.now) > now) continue;
        jobs.push(job);
      }
      return jobs;
    },
    async claim(job) {
      if (!redis) return unavailable();
      const claimed = await redis.set(repairClaimKey(job.tenantId, job.inquiryId), "1", { nx: true, ex: REPAIR_CLAIM_TTL_SECONDS });
      return claimed !== null && claimed !== undefined && claimed !== false;
    },
    async complete(job) {
      if (!redis) return unavailable();
      await redis.del(repairJobKey(job.tenantId, job.inquiryId));
      await redis.del(repairClaimKey(job.tenantId, job.inquiryId));
    },
    async fail(job, reason, now) {
      if (!redis) return unavailable();
      const current = parseRepairJob(await redis.get(repairJobKey(job.tenantId, job.inquiryId)), job.tenantId, job.inquiryId) || job;
      const attempts = (current.attempts ?? 0) + 1;
      const delaySeconds = Math.min(60 * 60, 60 * (2 ** Math.min(attempts, 6)));
      const next: InquiryCaptureRepairJob = {
        ...current,
        attempts,
        lastError: boundedRepairError(reason),
        nextAttemptAt: new Date(Date.parse(now) + delaySeconds * 1000).toISOString(),
      };
      await redis.set(repairJobKey(job.tenantId, job.inquiryId), next, { ex: REPAIR_TTL_SECONDS });
      await redis.zadd(repairIndexKey(job.tenantId), { score: repairDueAt(next, now), member: job.inquiryId });
      await redis.del(repairClaimKey(job.tenantId, job.inquiryId));
    },
  };
}

/** Memory store used only by focused tests and local rehearsals. */
export function createMemoryInquiryCaptureRepairStore(): InquiryCaptureRepairStore {
  const jobs = new Map<string, InquiryCaptureRepairJob>();
  const claims = new Set<string>();
  const key = (job: Pick<InquiryCaptureRepairJob, "tenantId" | "inquiryId">) => `${job.tenantId}:${job.inquiryId}`;
  return {
    durable: true,
    async enqueue(job) {
      const existing = jobs.get(key(job));
      jobs.set(key(job), {
        ...job,
        attempts: existing?.attempts ?? job.attempts ?? 0,
        ...(existing?.lastError ? { lastError: existing.lastError } : job.lastError ? { lastError: job.lastError } : {}),
        ...(existing?.nextAttemptAt ? { nextAttemptAt: existing.nextAttemptAt } : job.nextAttemptAt ? { nextAttemptAt: job.nextAttemptAt } : {}),
      });
    },
    async listDue(input) {
      const now = Date.parse(input.now);
      return [...jobs.values()]
        .filter((job) => (!input.tenantId || job.tenantId === input.tenantId) && (job.attempts ?? 0) < REPAIR_MAX_ATTEMPTS && repairDueAt(job, input.now) <= now)
        .sort((left, right) => repairDueAt(left, input.now) - repairDueAt(right, input.now))
        .slice(0, input.limit);
    },
    async claim(job) {
      const claimKeyValue = key(job);
      if (claims.has(claimKeyValue)) return false;
      claims.add(claimKeyValue);
      return true;
    },
    async complete(job) {
      jobs.delete(key(job));
      claims.delete(key(job));
    },
    async fail(job, reason, now) {
      const current = jobs.get(key(job)) || job;
      const attempts = (current.attempts ?? 0) + 1;
      const delaySeconds = Math.min(60 * 60, 60 * (2 ** Math.min(attempts, 6)));
      jobs.set(key(job), {
        ...current,
        attempts,
        lastError: boundedRepairError(reason),
        nextAttemptAt: new Date(Date.parse(now) + delaySeconds * 1000).toISOString(),
      });
      claims.delete(key(job));
    },
  };
}

/** Queue one receipt repair without exposing customer fields in the job. */
export async function enqueueInquiryCaptureRepair(
  job: InquiryCaptureRepairJob,
  store: InquiryCaptureRepairStore = createRedisInquiryCaptureRepairStore(),
): Promise<boolean> {
  if (!store.durable) return false;
  await store.enqueue({
    ...job,
    attempts: job.attempts ?? 0,
    enqueuedAt: job.enqueuedAt,
  });
  return true;
}

export interface InquiryCaptureRepairSweepResult {
  status: "processed" | "unavailable";
  queued: number;
  processed: number;
  recorded: number;
  stale: number;
  failed: number;
}

function hasCanonicalInquiryEvidence(snapshot: InquiryWorkspaceSnapshot | null, inquiryId: string): boolean {
  if (!snapshot) return false;
  const receipt = snapshot.state.actionReceipts.some(
    (item) => item.inquiryId === inquiryId && item.action === "record_inquiry",
  );
  const timeline = snapshot.state.timeline.some(
    (item) => item.inquiryId === inquiryId && item.type === "record_created",
  );
  return receipt && timeline;
}

function fieldsForLead(lead: LeadRecord): Record<string, string> {
  return {
    ...(lead.fields || {}),
    name: lead.name,
    ...(lead.email ? { email: lead.email } : {}),
    ...(lead.message ? { message: lead.message } : {}),
  };
}

/** Reread the lead and retry only canonical receipt persistence. */
export async function reconcileInquiryCaptureRepairs(options: {
  queue?: InquiryCaptureRepairStore;
  repository?: InquiryRepository;
  getLead?: (tenantId: string, inquiryId: string) => Promise<LeadRecord | null>;
  leads?: (tenantId: string, limit?: number) => Promise<LeadRecord[]>;
  tenantIds?: string[];
  businessIds?: Record<string, string>;
  leadLimit?: number;
  now?: Date;
  limit?: number;
} = {}): Promise<InquiryCaptureRepairSweepResult> {
  const queue = options.queue ?? createRedisInquiryCaptureRepairStore();
  const now = options.now ?? new Date();
  if (!queue.durable) return { status: "unavailable", queued: 0, processed: 0, recorded: 0, stale: 0, failed: 0 };
  const repository = options.repository ?? getInquiryRepository();
  const leadReader = options.getLead ?? getLeadById;
  const leadListReader = options.leads ?? getLeads;
  const tenantIds = options.tenantIds?.filter((tenantId) => Boolean(tenantId.trim()));
  const leadLimit = Math.max(1, Math.min(options.leadLimit ?? REPAIR_KEEP, REPAIR_KEEP));

  // A request can die after captureLead commits the Redis lead and before it
  // reaches queueCaptureRepair. Discover retained capability leads on the
  // scheduled sweep so that recovery does not depend on the browser retrying.
  // The lead remains the source of truth for customer fields; this only queues
  // the id/version needed to reread it through the canonical receive seam.
  if (tenantIds?.length) {
    for (const tenantId of tenantIds) {
      const businessId = options.businessIds?.[tenantId] ?? tenantId;
      try {
        const leads = await leadListReader(tenantId, leadLimit);
        const snapshot = await repository.getSnapshot(tenantId, businessId).catch(() => null);
        for (const lead of leads) {
          const capabilityVersion = lead.capabilityVersion;
          if (!lead.capabilityId || typeof capabilityVersion !== "number" || !Number.isSafeInteger(capabilityVersion) || capabilityVersion < 1) continue;
          if (hasCanonicalInquiryEvidence(snapshot, lead.id)) continue;
          try {
            await queue.enqueue({
              tenantId,
              businessId,
              inquiryId: lead.id,
              capabilityId: lead.capabilityId,
              capabilityVersion,
              enqueuedAt: lead.createdAt,
              lastError: "capture_repair_discovered",
            });
          } catch (error) {
            // The next cron can rediscover the retained lead after Redis
            // recovers. Existing queued jobs remain eligible below.
            console.error(
              "[inquiry-reconcile] capture repair discovery enqueue failed:",
              error instanceof Error ? error.message : String(error),
            );
          }
        }
      } catch (error) {
        // Discovery is best effort. Process already-indexed repair jobs even
        // when the lead list or workspace is temporarily unavailable.
        console.error(
          "[inquiry-reconcile] capture repair discovery failed:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  let jobs: InquiryCaptureRepairJob[] = [];
  try {
    const limit = options.limit ?? 100;
    if (tenantIds?.length) {
      for (const tenantId of tenantIds) {
        jobs.push(...await queue.listDue({ tenantId, now: now.toISOString(), limit: Math.max(0, limit - jobs.length) }));
        if (jobs.length >= limit) break;
      }
    } else {
      // The memory store can inspect all jobs. Redis requires the caller to
      // provide active tenant ids so a global scan is never introduced.
      jobs = await queue.listDue({ now: now.toISOString(), limit });
    }
  } catch {
    return { status: "unavailable", queued: 0, processed: 0, recorded: 0, stale: 0, failed: 0 };
  }
  const counts = { processed: 0, recorded: 0, stale: 0, failed: 0 };
  for (const job of jobs) {
    if (!(await queue.claim(job).catch(() => false))) continue;
    counts.processed += 1;
    try {
      const lead = await leadReader(job.tenantId, job.inquiryId);
      if (!lead || lead.capabilityId !== job.capabilityId || lead.capabilityVersion !== job.capabilityVersion) {
        await queue.fail(job, "captured_lead_missing_or_changed", now.toISOString());
        counts.failed += 1;
        continue;
      }
      // Dynamic import breaks the receive/repair dependency cycle while still
      // routing every repair through the same canonical engine seam.
      const { recordInquiryEvidenceForRepair } = await import("./receive");
      const result = await recordInquiryEvidenceForRepair({
        tenantId: job.tenantId,
        businessId: job.businessId,
        inquiryId: job.inquiryId,
        capabilityId: job.capabilityId,
        expectedCapabilityVersion: job.capabilityVersion,
        fields: fieldsForLead(lead),
        receivedAt: lead.createdAt,
        repository,
      });
      if (result.status === "recorded" || result.status === "already_recorded") {
        await queue.complete(job);
        counts.recorded += 1;
      } else if (result.status === "stale" || result.status === "rejected") {
        await queue.complete(job);
        counts.stale += result.status === "stale" ? 1 : 0;
      } else {
        await queue.fail(job, result.reason, now.toISOString());
        counts.failed += 1;
      }
    } catch (error) {
      await queue.fail(job, boundedRepairError(error), now.toISOString()).catch(() => {});
      counts.failed += 1;
    }
  }
  return { status: "processed", queued: jobs.length, ...counts };
}

interface ProviderEventData {
  email_id?: unknown;
  created_at?: unknown;
  from?: unknown;
  to?: unknown;
  subject?: unknown;
  tags?: unknown;
  bounce?: { message?: unknown; type?: unknown; subType?: unknown };
  failed?: { reason?: unknown };
  suppressed?: { message?: unknown; type?: unknown };
}

interface ProviderEventPayload {
  type?: unknown;
  created_at?: unknown;
  data?: ProviderEventData;
}

function safeProviderString(value: unknown, max = 240): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

function providerTags(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const tags: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const text = safeProviderString(raw, 256);
    if (text) tags[key.slice(0, 256)] = text;
  }
  return tags;
}

function tag(tags: Record<string, string>, ...names: string[]): string | null {
  for (const name of names) {
    const value = safeProviderString(tags[name], 256);
    if (value) return value;
  }
  return null;
}

function providerOutcomeForType(type: string): InquiryDeliveryProviderOutcome | null {
  if (type === "email.delivered") return "delivered";
  if (type === "email.bounced") return "bounced";
  if (type === "email.delivery_delayed") return "deferred";
  if (type === "email.failed") return "failed";
  if (type === "email.complained") return "failed";
  if (type === "email.suppressed") return "suppressed";
  return null;
}

function providerReason(type: string, data: ProviderEventData): string {
  const detail = type === "email.bounced"
    ? safeProviderString(data.bounce?.message)
    : type === "email.failed"
      ? safeProviderString(data.failed?.reason)
      : type === "email.suppressed"
        ? safeProviderString(data.suppressed?.message)
        : null;
  return (detail || `Provider reported ${type.replace("email.", "")}.`).slice(0, 240);
}

function providerEventTimestamp(data: ProviderEventData, payload: ProviderEventPayload | null): string | null {
  const raw = safeProviderString(data.created_at) || safeProviderString(payload?.created_at);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function validEmail(value: unknown): string | null {
  const raw = safeProviderString(value, 320);
  const email = raw?.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] || raw;
  const normalized = email?.toLowerCase();
  return normalized && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) ? normalized : null;
}

function looksLikeInquiryReplyAddress(value: string): boolean {
  const domain = process.env.INQUIRY_REPLY_TO_DOMAIN?.trim().toLowerCase();
  return Boolean(domain && value.toLowerCase().endsWith(`@${domain}`) && value.toLowerCase().startsWith("inquiry+"));
}

export type InquiryProviderEventResult =
  | { status: "recorded" | "duplicate" | "ignored" | "unmatched" | "unavailable"; tenantId?: string; inquiryId?: string; action?: InquiryDeliveryAction; reason?: string };

/** Apply one already authenticated provider event to delivery evidence. */
export async function reconcileInquiryProviderEvent(input: {
  event: unknown;
  eventId: string;
  store?: InquiryDeliveryStore;
  getLead?: (tenantId: string, inquiryId: string) => Promise<LeadRecord | null>;
}): Promise<InquiryProviderEventResult> {
  const payload = input.event && typeof input.event === "object" ? input.event as ProviderEventPayload : null;
  const type = safeProviderString(payload?.type, 80);
  const data = payload?.data && typeof payload.data === "object" ? payload.data : null;
  const providerMessageId = safeProviderString(data?.email_id, 240);
  const eventId = safeProviderString(input.eventId, 240);
  if (!type || !data || !providerMessageId || !eventId) return { status: "ignored", reason: "provider_event_invalid" };
  const store = input.store ?? createRedisInquiryDeliveryStore();
  if (!store.durable) return { status: "unavailable", reason: "durable_delivery_state_required" };
  const tags = providerTags(data.tags);
  let tenantId = tag(tags, "strelva_tenant_id", "tenant_id", "tenantId");
  const taggedInquiryId = tag(tags, "strelva_inquiry_id", "inquiry_id", "inquiryId");
  const taggedAction = tag(tags, "strelva_action", "action");
  let target: { tenantId: string; inquiryId: string; action: InquiryDeliveryAction } | null = null;
  if (tenantId && taggedInquiryId && taggedAction) {
    target = { tenantId, inquiryId: taggedInquiryId, action: taggedAction as InquiryDeliveryAction };
  } else if (tenantId) {
    const resolved = await store.findByProviderMessageId({ tenantId, providerMessageId }).catch(() => null);
    if (resolved) target = { tenantId, inquiryId: resolved.inquiryId, action: resolved.action };
  }
  if (type === "email.received") {
    const recipients = (Array.isArray(data.to) ? data.to : [data.to])
      .map((value) => validEmail(value))
      .filter((value): value is string => Boolean(value));
    let replyTarget: { inquiryId: string } | null = null;
    if (tenantId && taggedInquiryId) {
      // Tags are useful correlation hints, but they do not prove that the
      // message arrived at this inquiry's receiving address. Require the
      // tenant-scoped reverse index to match one actual recipient before
      // accepting reply evidence; this prevents a staff mailbox event with
      // copied metadata from closing the customer follow-up path.
      for (const address of recipients) {
        const indexed = await store.findByReplyAddress({ tenantId, replyTo: address }).catch(() => null);
        if (indexed?.inquiryId === taggedInquiryId) {
          replyTarget = indexed;
          break;
        }
      }
    } else if (tenantId) {
      for (const address of recipients) {
        replyTarget = await store.findByReplyAddress({ tenantId, replyTo: address }).catch(() => null);
        if (replyTarget) break;
      }
    } else if (store.findByReplyAddressAny) {
      for (const address of recipients) {
        const anyTarget = await store.findByReplyAddressAny({ replyTo: address }).catch(() => null);
        if (anyTarget) {
          tenantId = anyTarget.tenantId;
          replyTarget = { inquiryId: anyTarget.inquiryId };
          break;
        }
      }
    }
    if (!tenantId || !replyTarget?.inquiryId) {
      return recipients.some(looksLikeInquiryReplyAddress) || tenantId
        ? { status: "unmatched", reason: "inquiry_reply_target_unavailable" }
        : { status: "ignored", reason: "provider_event_not_for_inquiry" };
    }
    const from = validEmail(data.from);
    if (!from) return { status: "ignored", reason: "provider_reply_sender_invalid", tenantId, inquiryId: replyTarget.inquiryId };
    const lead = await (input.getLead ?? getLeadById)(tenantId, replyTarget.inquiryId).catch(() => null);
    if (!lead || validEmail(lead.email) !== from) return { status: "unmatched", tenantId, inquiryId: replyTarget.inquiryId, reason: "provider_reply_sender_mismatch" };
    const receivedAt = providerEventTimestamp(data, payload);
    if (!receivedAt) return { status: "ignored", tenantId, inquiryId: replyTarget.inquiryId, reason: "provider_reply_time_invalid" };
    const claim = await store.claimProviderEvent({ tenantId, providerEventId: eventId }).catch(() => null);
    if (!claim) return { status: "unavailable", tenantId, inquiryId: replyTarget.inquiryId, reason: "provider_reply_claim_unavailable" };
    if (claim.status === "completed") return { status: "duplicate", tenantId, inquiryId: replyTarget.inquiryId };
    if (claim.status === "processing") return { status: "unavailable", tenantId, inquiryId: replyTarget.inquiryId, reason: "provider_reply_processing" };
    try {
      const existingReply = await store.getReplyState({ tenantId, inquiryId: replyTarget.inquiryId }).catch(() => null);
      if (existingReply?.providerEventId === eventId) {
        // A worker may have crashed after the durable reply marker and before
        // the timeline or completed-event marker. Only the newly acquired
        // claim token may repair those writes after the old lease expires.
        await store.appendTimeline({
          tenantId,
          inquiryId: replyTarget.inquiryId,
          type: "note" as InquiryTimelineEventType,
          summary: "Customer reply received by the inquiry mailbox.",
          outcome: "recorded",
          at: receivedAt,
          actor: { kind: "customer", id: "provider-reply", label: "Customer" },
          causedByEventId: eventId,
          evidence: [`Resend received email ${providerMessageId}.`],
        });
        await store.completeProviderEvent?.({ tenantId, providerEventId: eventId, claimToken: claim.token });
        return { status: "duplicate", tenantId, inquiryId: replyTarget.inquiryId };
      }
      await store.markReplyReceived({
        tenantId,
        inquiryId: replyTarget.inquiryId,
        providerMessageId,
        providerEventId: eventId,
        receivedAt,
      });
      await store.appendTimeline({
        tenantId,
        inquiryId: replyTarget.inquiryId,
        type: "note" as InquiryTimelineEventType,
        summary: "Customer reply received by the inquiry mailbox.",
        outcome: "recorded",
        at: receivedAt,
        actor: { kind: "customer", id: "provider-reply", label: "Customer" },
        causedByEventId: eventId,
        evidence: [`Resend received email ${providerMessageId}.`],
      });
      await store.completeProviderEvent?.({ tenantId, providerEventId: eventId, claimToken: claim.token });
      return { status: "recorded", tenantId, inquiryId: replyTarget.inquiryId };
    } catch {
      await store.releaseProviderEvent?.({ tenantId, providerEventId: eventId, claimToken: claim.token }).catch(() => {});
      return { status: "unavailable", tenantId, inquiryId: replyTarget.inquiryId, reason: "provider_reply_record_unavailable" };
    }
  }
  const outcome = providerOutcomeForType(type);
  if (!outcome) return { status: "ignored", reason: "provider_event_not_a_delivery_outcome" };
  if (!target) return tenantId
    ? { status: "unmatched", reason: "inquiry_delivery_target_unavailable" }
    : { status: "ignored", reason: "provider_event_not_for_inquiry" };
  if (!["reply", "send_message", "owner_notification", "schedule_follow_up"].includes(target.action)) return { status: "ignored", reason: "provider_action_invalid" };
  const checkpoint = await store.getCheckpoint({ tenantId: target.tenantId, inquiryId: target.inquiryId, action: target.action }).catch(() => null);
  if (!checkpoint || checkpoint.providerMessageId !== providerMessageId) return { status: "unmatched", tenantId: target.tenantId, inquiryId: target.inquiryId, action: target.action, reason: "delivery_checkpoint_unavailable" };
  const outcomeAt = providerEventTimestamp(data, payload);
  if (!outcomeAt) return { status: "ignored", tenantId: target.tenantId, inquiryId: target.inquiryId, action: target.action, reason: "provider_outcome_time_invalid" };
  const claim = await store.claimProviderEvent({ tenantId: target.tenantId, providerEventId: eventId }).catch(() => null);
  if (!claim) return { status: "unavailable", tenantId: target.tenantId, inquiryId: target.inquiryId, action: target.action, reason: "provider_outcome_claim_unavailable" };
  if (claim.status === "completed") return { status: "duplicate", tenantId: target.tenantId, inquiryId: target.inquiryId, action: target.action };
  if (claim.status === "processing") return { status: "unavailable", tenantId: target.tenantId, inquiryId: target.inquiryId, action: target.action, reason: "provider_outcome_processing" };
  try {
    if (checkpoint.providerEventId === eventId) {
      // Repair a timeline write interrupted after the checkpoint. The current
      // claim token proves the prior lease expired before this repair began.
      await store.appendTimeline({
        tenantId: target.tenantId,
        inquiryId: target.inquiryId,
        capabilityId: null,
        type: outcome === "bounced" ? "notification_bounced" : outcome === "delivered" ? "notification_accepted" : "status_changed",
        summary: `Provider delivery update: ${outcome}.`,
        outcome: outcome === "delivered" ? "accepted" : "failed",
        at: outcomeAt,
        causedByEventId: eventId,
        actor: { kind: "system", id: "resend-webhook", label: "Resend" },
        evidence: [`Resend event ${eventId} reported ${type}.`],
      });
      await store.completeProviderEvent?.({ tenantId: target.tenantId, providerEventId: eventId, claimToken: claim.token });
      return { status: "duplicate", tenantId: target.tenantId, inquiryId: target.inquiryId, action: target.action };
    }
    await store.markProviderOutcome({
      tenantId: target.tenantId,
      inquiryId: target.inquiryId,
      action: target.action,
      providerMessageId,
      providerEventId: eventId,
      outcome,
      at: outcomeAt,
      reason: providerReason(type, data),
      evidence: [`Resend event ${eventId} reported ${type}.`],
    });
    const timelineType: InquiryTimelineEventType = outcome === "bounced" ? "notification_bounced" : outcome === "delivered" ? "notification_accepted" : "status_changed";
    await store.appendTimeline({
      tenantId: target.tenantId,
      inquiryId: target.inquiryId,
      capabilityId: null,
      type: timelineType,
      summary: `Provider delivery update: ${outcome}.`,
      outcome: outcome === "delivered" ? "accepted" : "failed",
      at: outcomeAt,
      causedByEventId: eventId,
      actor: { kind: "system", id: "resend-webhook", label: "Resend" },
      evidence: [`Resend event ${eventId} reported ${type}.`],
    });
    await store.completeProviderEvent?.({ tenantId: target.tenantId, providerEventId: eventId, claimToken: claim.token });
    return { status: "recorded", tenantId: target.tenantId, inquiryId: target.inquiryId, action: target.action };
  } catch {
    await store.releaseProviderEvent?.({ tenantId: target.tenantId, providerEventId: eventId, claimToken: claim.token }).catch(() => {});
    return { status: "unavailable", tenantId: target.tenantId, inquiryId: target.inquiryId, action: target.action, reason: "provider_outcome_record_unavailable" };
  }
}
