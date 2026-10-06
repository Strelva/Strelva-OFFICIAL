/**
 * How each moving store reads its records out of Redis, under the frozen key
 * names. Backfill, parity and repair all read through these, so the record id
 * and payload a dual-write sends are exactly what a later backfill or parity
 * check computes from Redis.
 */
import { createHash } from "node:crypto";
import { asPayload, type ClientRecord, type ClientRecordMode, type ClientRecordStore } from "./mirror";

export interface ClientRecordRedis {
  get<T = unknown>(key: string): Promise<T | null>;
  mget<T = unknown[]>(...keys: string[]): Promise<T>;
  zrange<T = unknown[]>(key: string, start: number, stop: number, opts?: { withScores?: boolean; rev?: boolean }): Promise<T>;
  scan(cursor: string | number, opts: { match: string; count: number }): Promise<[string | number, string[]]>;
}

function parse(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

async function scanAll(redis: ClientRecordRedis, match: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | number = "0";
  do {
    const [next, found] = await redis.scan(cursor, { match, count: 250 });
    cursor = String(next);
    keys.push(...found);
  } while (cursor !== "0");
  return keys;
}

/** The inquiry delivery keys encode their parts (delivery-store keyPart). */
function keyPart(value: string): string {
  return encodeURIComponent(value.trim());
}

/** A timeline member's record id: the inquiry plus a digest of the exact
 *  member Redis holds, so the same event is never stored twice. */
export function timelineRecordId(inquiryId: string, member: string): string {
  return `${inquiryId}:${createHash("sha256").update(member).digest("hex").slice(0, 32)}`;
}

/** The record a timeline append produces (shared by the dual-write and Redis reads). */
export function timelineRecord(inquiryId: string, member: string): ClientRecord | null {
  const event = parse(member);
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  const at = (event as { at?: unknown }).at;
  return {
    recordId: timelineRecordId(inquiryId, member),
    payload: event as Record<string, unknown>,
    capturedAt: typeof at === "string" && !Number.isNaN(Date.parse(at)) ? at : new Date(0).toISOString(),
  };
}

export const FIRST_REPLY_ACTIONS = ["reply", "send_message"] as const;

export function firstReplyRecord(inquiryId: string, acceptedAt: string, action: string, by: "strelva" | "owner" = "strelva"): ClientRecord {
  return { recordId: inquiryId, payload: { firstReplyAt: acceptedAt, by, action }, capturedAt: acceptedAt };
}

export interface ClientRecordStoreDefinition {
  store: ClientRecordStore;
  mode: ClientRecordMode;
  /** Removal from Redis means the record is gone on purpose (not expired). */
  removalIsIntentional: boolean;
  readRedis(redis: ClientRecordRedis, tenant: string, now?: Date): Promise<ClientRecord[]>;
}

const nowIso = (now?: Date) => (now ?? new Date()).toISOString();

export const CLIENT_RECORD_STORE_DEFINITIONS: Record<ClientRecordStore, ClientRecordStoreDefinition> = {
  spam_held: {
    store: "spam_held",
    mode: "replace",
    removalIsIntentional: false,
    async readRedis(redis, tenant) {
      const ids = ((await redis.zrange<unknown[]>(`reb:spam-pit:${tenant}`, 0, -1)) ?? []).map(String);
      if (!ids.length) return [];
      const out: ClientRecord[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const slice = ids.slice(i, i + 200);
        const raws = await redis.mget<unknown[]>(...slice.map((id) => `reb:spam-pit:item:${tenant}:${id}`));
        raws.forEach((raw) => {
          const item = parse(raw);
          if (!item || typeof item !== "object") return;
          const record = item as { id?: unknown; createdAt?: unknown };
          if (typeof record.id !== "string") return;
          out.push({ recordId: record.id, payload: item as Record<string, unknown>, capturedAt: typeof record.createdAt === "string" ? record.createdAt : new Date(0).toISOString() });
        });
      }
      return out;
    },
  },
  inquiry_timeline: {
    store: "inquiry_timeline",
    mode: "replace",
    removalIsIntentional: false,
    async readRedis(redis, tenant) {
      const prefix = `reb:inquiry-timeline:${keyPart(tenant)}:`;
      const out: ClientRecord[] = [];
      for (const key of await scanAll(redis, `${prefix}*`)) {
        const inquiryId = decodeURIComponent(key.slice(prefix.length));
        const members = ((await redis.zrange<unknown[]>(key, 0, -1)) ?? []).map((m) => (typeof m === "string" ? m : JSON.stringify(m)));
        for (const member of members) {
          const record = timelineRecord(inquiryId, member);
          if (record) out.push(record);
        }
      }
      return out;
    },
  },
  inquiry_reply: {
    store: "inquiry_reply",
    mode: "keep_first",
    removalIsIntentional: false,
    async readRedis(redis, tenant) {
      const prefix = `reb:inquiry-delivery:${keyPart(tenant)}:`;
      const earliest = new Map<string, ClientRecord>();
      for (const action of FIRST_REPLY_ACTIONS) {
        for (const key of await scanAll(redis, `${prefix}*:${action}`)) {
          const checkpoint = parse(await redis.get(key)) as { inquiryId?: unknown; status?: unknown; acceptedAt?: unknown } | null;
          if (!checkpoint || typeof checkpoint.inquiryId !== "string" || typeof checkpoint.acceptedAt !== "string") continue;
          if (!["accepted", "verified", "delivered", "accepted_unverified"].includes(String(checkpoint.status))) continue;
          const record = firstReplyRecord(checkpoint.inquiryId, checkpoint.acceptedAt, action);
          const prior = earliest.get(checkpoint.inquiryId);
          if (!prior || Date.parse(record.capturedAt) < Date.parse(prior.capturedAt)) earliest.set(checkpoint.inquiryId, record);
        }
      }
      return [...earliest.values()];
    },
  },
  booking_config: {
    store: "booking_config",
    mode: "replace",
    removalIsIntentional: false,
    async readRedis(redis, tenant, now) {
      const out: ClientRecord[] = [];
      const config = await redis.get(`reb:booking:config:${tenant}`);
      if (config !== null && config !== undefined) out.push({ recordId: "config", payload: { value: parse(config) }, capturedAt: nowIso(now) });
      const overrides = await redis.get(`reb:booking:overrides:${tenant}`);
      if (overrides !== null && overrides !== undefined) out.push({ recordId: "overrides", payload: { value: parse(overrides) }, capturedAt: nowIso(now) });
      return out;
    },
  },
  analytics_settings: {
    store: "analytics_settings",
    mode: "replace",
    removalIsIntentional: false,
    async readRedis(redis, tenant, now) {
      const out: ClientRecord[] = [];
      const entries: [string, string][] = [["analytics", `analytics:cfg:${tenant}`], ["report_cadence", `reb:report-cadence:${tenant}`], ["report_sent", `reb:report-sent:${tenant}`]];
      for (const [recordId, key] of entries) {
        const raw = await redis.get(key);
        if (raw === null || raw === undefined) continue;
        out.push({ recordId, payload: { value: recordId === "report_sent" ? String(raw) : parse(raw) }, capturedAt: nowIso(now) });
      }
      return out;
    },
  },
  account_grouping: {
    store: "account_grouping",
    mode: "replace",
    removalIsIntentional: true,
    async readRedis(redis, tenant, now) {
      const accountId = await redis.get(`account-of:${tenant}`);
      if (typeof accountId !== "string" || !accountId) return [];
      const account = parse(await redis.get(`account:${accountId}`));
      if (!account || typeof account !== "object") return [];
      return [{ recordId: accountId, payload: asPayload(account), capturedAt: nowIso(now) }];
    },
  },
};
