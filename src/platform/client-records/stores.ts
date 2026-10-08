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
  hgetall<T = Record<string, unknown>>(key: string): Promise<T | null>;
  lrange<T = unknown[]>(key: string, start: number, stop: number): Promise<T>;
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

export const INQUIRY_DELIVERY_KINDS = ["checkpoint", "provider_target", "reply_target", "reply_state", "provider_event"] as const;
export type InquiryDeliveryRecordKind = typeof INQUIRY_DELIVERY_KINDS[number];
export function inquiryDeliveryRecordId(kind: InquiryDeliveryRecordKind, key: string): string {
  return `${kind}:${createHash("sha256").update(`${kind}\0${key}`).digest("hex")}`;
}
/** Stable-id context supplies the tenant; payloads never pin a mutable slug. */
export function inquiryDeliveryRecord(kind: InquiryDeliveryRecordKind, key: string, value: unknown, capturedAt = new Date().toISOString()): ClientRecord {
  const normalized = value && typeof value === "object" && !Array.isArray(value) ? { ...value as Record<string, unknown> } : value;
  if (normalized && typeof normalized === "object") delete (normalized as Record<string, unknown>).tenantId;
  return { recordId: inquiryDeliveryRecordId(kind, key), payload: { kind, key, value: normalized }, capturedAt };
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
  orders: indexedBlobs("orders", (t) => `orders:${t}`, (t, id) => `order:${t}:${id}`),
  threads: indexedBlobs("threads", (t) => `threads:${t}:index`, (t, id) => `threads:${t}:${id}`, true),
  provider_connections: {
    store: "provider_connections", mode: "replace", removalIsIntentional: true,
    async readRedis(redis, tenant, now) {
      const prefix = `connections:${tenant}:`;
      const rows: ClientRecord[] = [];
      for (const key of await scanAll(redis, `${prefix}*`)) {
        const value = parse(await redis.get(key));
        if (value && typeof value === "object") rows.push({ recordId: key.slice(prefix.length), payload: asPayload(value), capturedAt: nowIso(now) });
      }
      return rows;
    },
  },
  provider_metadata: keyedValues("provider_metadata", { google: (t) => `google-meta:${t}`, calendly: (t) => `calendly-meta:${t}` }),
  tenant_settings: keyedValues("tenant_settings", {
    reply_voice: (t) => `reb:reply-voice:${t}`, content_autonomy: (t) => `reb:content-autonomy:${t}`,
    goal: (t) => `goal:${t}`, client_email: (t) => `reb:client-email:${t}`,
  }),
  reward_members: {
    store: "reward_members", mode: "replace", removalIsIntentional: false,
    async readRedis(redis, tenant, now) {
      const prefix = `reb:rewards:${tenant}:member:`;
      const rows: ClientRecord[] = [];
      for (const key of await scanAll(redis, `${prefix}*`)) {
        const value = await redis.hgetall<Record<string, unknown>>(key);
        if (value?.email) rows.push({ recordId: key.slice(prefix.length), payload: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])), capturedAt: typeof value.createdAt === "string" ? value.createdAt : nowIso(now) });
      }
      return rows;
    },
  },
  reward_transactions: {
    store: "reward_transactions", mode: "replace", removalIsIntentional: false,
    async readRedis(redis, tenant, now) {
      const prefix = `reb:rewards:${tenant}:txns:`;
      const rows: ClientRecord[] = [];
      for (const key of await scanAll(redis, `${prefix}*`)) {
        const email = key.slice(prefix.length);
        for (const raw of await redis.lrange<unknown[]>(key, 0, -1)) {
          const value = parse(raw) as Record<string, unknown> | null;
          if (typeof value?.id === "string") rows.push({ recordId: value.id, payload: { ...value, email }, capturedAt: typeof value.timestamp === "string" ? value.timestamp : nowIso(now) });
        }
      }
      return rows;
    },
  },
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
  inquiry_delivery: {
    store: "inquiry_delivery", mode: "replace", removalIsIntentional: false,
    async readRedis(redis, tenant, now) {
      const definitions: [InquiryDeliveryRecordKind, string][] = [
        ["checkpoint", `reb:inquiry-delivery:${keyPart(tenant)}:`],
        ["provider_target", `reb:inquiry-delivery-provider:${keyPart(tenant)}:`],
        ["reply_target", `reb:inquiry-reply:${keyPart(tenant)}:`],
        ["reply_state", `reb:inquiry-reply-state:${keyPart(tenant)}:`],
        ["provider_event", `reb:inquiry-delivery-event:${keyPart(tenant)}:`],
      ];
      const records: ClientRecord[] = [];
      for (const [kind, prefix] of definitions) for (const key of await scanAll(redis, `${prefix}*`)) {
        const value = parse(await redis.get(key));
        if (value === null || value === undefined || (kind === "provider_event" && value !== "completed")) continue;
        records.push(inquiryDeliveryRecord(kind, key.slice(prefix.length), value, nowIso(now)));
      }
      return records;
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

function indexedBlobs(store: ClientRecordStore, index: (tenant: string) => string, key: (tenant: string, id: string) => string, removalIsIntentional = false): ClientRecordStoreDefinition {
  return { store, mode: "replace", removalIsIntentional, async readRedis(redis, tenant, now) {
    const ids = ((await redis.zrange<unknown[]>(index(tenant), 0, -1)) ?? []).map(String);
    const rows: ClientRecord[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const values = await redis.mget<unknown[]>(...ids.slice(i, i + 200).map((id) => key(tenant, id)));
      values.forEach((raw, j) => {
        const value = parse(raw) as Record<string, unknown> | null;
        if (!value || typeof value !== "object") return;
        rows.push({ recordId: ids[i + j]!, payload: value, capturedAt: String(value.updatedAt ?? value.createdAt ?? nowIso(now)) });
      });
    }
    return rows;
  } };
}
function keyedValues(store: ClientRecordStore, keys: Record<string, (tenant: string) => string>): ClientRecordStoreDefinition {
  return { store, mode: "replace", removalIsIntentional: true, async readRedis(redis, tenant, now) {
    const rows: ClientRecord[] = [];
    for (const [recordId, key] of Object.entries(keys)) {
      const value = await redis.get(key(tenant));
      if (value !== null && value !== undefined) rows.push({ recordId, payload: { value: parse(value) }, capturedAt: nowIso(now) });
    }
    return rows;
  } };
}
