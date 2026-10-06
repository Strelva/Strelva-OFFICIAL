/**
 * One contract for both inquiry delivery stores.
 *
 * The memory store always runs. The Redis store runs only under
 * `pnpm check:inquiry-lua`, which starts a throwaway local redis-server on a
 * unix socket and sets INQUIRY_LUA_REDIS_SOCKET. That run executes the real
 * Lua scripts in delivery-store.ts (budget, acceptance, acceptance-state,
 * provider outcome, and the three provider-event claim scripts) instead of the
 * hand-written fakes other tests use. It never touches a shared Redis.
 */
import { createConnection, type Socket } from "node:net";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createMemoryInquiryDeliveryStore, createRedisInquiryDeliveryStore } from "@/products/inquiries/delivery-store";
import type { InquiryDeliveryStore } from "@/products/inquiries/delivery-types";

const REDIS_SOCKET = process.env.INQUIRY_LUA_REDIS_SOCKET?.trim() || "";

const TENANT = "lua-tenant";
const NOW = "2026-10-05T12:00:00.000Z";
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

// ---------------------------------------------------------------------------
// Minimal RESP client over a unix socket. No dependency: the repo only ships
// the Upstash REST client, and this check must run without network access.
// ---------------------------------------------------------------------------

const INCOMPLETE = Symbol("incomplete");
type Reply = string | number | null | Error | Reply[];

function parseReply(buffer: Buffer, offset: number): { value: Reply; offset: number } | typeof INCOMPLETE {
  const end = buffer.indexOf("\r\n", offset);
  if (end === -1) return INCOMPLETE;
  const type = String.fromCharCode(buffer[offset]!);
  const line = buffer.toString("utf8", offset + 1, end);
  const next = end + 2;
  if (type === "+") return { value: line, offset: next };
  if (type === "-") return { value: new Error(line), offset: next };
  if (type === ":") return { value: Number(line), offset: next };
  if (type === "$") {
    const length = Number(line);
    if (length < 0) return { value: null, offset: next };
    if (buffer.length < next + length + 2) return INCOMPLETE;
    return { value: buffer.toString("utf8", next, next + length), offset: next + length + 2 };
  }
  if (type === "*") {
    const count = Number(line);
    if (count < 0) return { value: null, offset: next };
    const items: Reply[] = [];
    let cursor = next;
    for (let index = 0; index < count; index += 1) {
      const item = parseReply(buffer, cursor);
      if (item === INCOMPLETE) return INCOMPLETE;
      items.push(item.value);
      cursor = item.offset;
    }
    return { value: items, offset: cursor };
  }
  throw new Error(`Unexpected RESP type ${type}`);
}

class RespClient {
  private readonly socket: Socket;
  private buffer = Buffer.alloc(0);
  private readonly pending: Array<{ resolve: (value: Reply) => void; reject: (error: Error) => void }> = [];

  constructor(path: string) {
    this.socket = createConnection(path);
    this.socket.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      for (;;) {
        const parsed = parseReply(this.buffer, 0);
        if (parsed === INCOMPLETE) return;
        this.buffer = this.buffer.subarray(parsed.offset);
        const waiter = this.pending.shift();
        if (!waiter) continue;
        if (parsed.value instanceof Error) waiter.reject(parsed.value);
        else waiter.resolve(parsed.value);
      }
    });
    this.socket.on("error", (error) => {
      while (this.pending.length) this.pending.shift()!.reject(error);
    });
  }

  command(args: Array<string | number>): Promise<Reply> {
    const parts = args.map(String);
    const encoded = `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.socket.write(encoded);
    });
  }

  close(): void {
    this.socket.end();
  }
}

/** Mirror @upstash/redis automatic (de)serialization, which production uses. */
function deserialize(value: Reply): unknown {
  if (Array.isArray(value)) return value.map(deserialize);
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function upstashLike(client: RespClient) {
  return {
    async get(key: string) {
      return deserialize(await client.command(["GET", key]));
    },
    async set(key: string, value: unknown, options?: { nx?: boolean; ex?: number }) {
      const args: Array<string | number> = ["SET", key, typeof value === "string" ? value : JSON.stringify(value)];
      if (options?.ex) args.push("EX", options.ex);
      if (options?.nx) args.push("NX");
      return client.command(args);
    },
    async del(key: string) {
      return client.command(["DEL", key]);
    },
    async zadd(key: string, entry: { score: number; member: string }) {
      return client.command(["ZADD", key, entry.score, entry.member]);
    },
    async zrange(key: string, start: number, stop: number, options?: { rev?: boolean }) {
      return deserialize(await client.command(["ZRANGE", key, start, stop, ...(options?.rev ? ["REV"] : [])]));
    },
    async zremrangebyrank(key: string, start: number, stop: number) {
      return client.command(["ZREMRANGEBYRANK", key, start, stop]);
    },
    async eval(script: string, keys: string[], args: string[]) {
      return deserialize(await client.command(["EVAL", script, keys.length, ...keys, ...args]));
    },
  };
}

// ---------------------------------------------------------------------------
// The shared contract.
// ---------------------------------------------------------------------------

const budget = (limit = 10, policyVersion = "policy-1") => ({ limit, timezone: "UTC", policyVersion, now: NOW });

async function claim(store: InquiryDeliveryStore, inquiryId: string, messageDigest?: string, maxAttempts = 3, limit = 10) {
  return store.beginAttempt({ tenantId: TENANT, inquiryId, action: "reply", maxAttempts, now: NOW, budget: budget(limit), ...(messageDigest ? { messageDigest } : {}) });
}

async function acceptedAttempt(store: InquiryDeliveryStore, inquiryId: string, providerMessageId: string, messageDigest = DIGEST_A) {
  const claimed = await claim(store, inquiryId, messageDigest);
  expect(claimed.acquired).toBe(true);
  const accepted = await store.markAccepted({
    tenantId: TENANT,
    inquiryId,
    action: "reply",
    attemptId: claimed.attemptId!,
    acceptedAt: NOW,
    providerMessageId,
    replyTo: `Inquiry+${inquiryId}@Reply.Example.Test`,
  });
  await store.releaseAttempt({ tenantId: TENANT, inquiryId, action: "reply", attemptId: claimed.attemptId! });
  return { attemptId: claimed.attemptId!, accepted };
}

function outcome(inquiryId: string, providerMessageId: string, providerEventId: string, kind: "delivered" | "deferred" | "bounced" | "suppressed" | "failed", at: string) {
  return { tenantId: TENANT, inquiryId, action: "reply" as const, providerMessageId, providerEventId, outcome: kind, at };
}

function storeContract(name: string, makeStore: () => InquiryDeliveryStore, reset: () => Promise<void> = async () => {}) {
  describe(`inquiry delivery store contract: ${name}`, () => {
    let store: InquiryDeliveryStore;
    beforeEach(async () => {
      await reset();
      store = makeStore();
    });

    it("records the sent message digest from claim through acceptance, with provider and reply indexes", async () => {
      const claimed = await claim(store, "inq-digest", DIGEST_A);
      expect(claimed).toMatchObject({ acquired: true, checkpoint: { status: "sending", attempts: 1, messageDigest: DIGEST_A } });
      expect(await store.getCheckpoint({ tenantId: TENANT, inquiryId: "inq-digest", action: "reply" })).toMatchObject({ status: "sending", messageDigest: DIGEST_A });

      const accepted = await store.markAccepted({ tenantId: TENANT, inquiryId: "inq-digest", action: "reply", attemptId: claimed.attemptId!, acceptedAt: NOW, providerMessageId: "pm-digest", replyTo: "Inquiry+abc@Reply.Example.Test" });
      expect(accepted).toMatchObject({ status: "accepted", messageDigest: DIGEST_A, providerMessageId: "pm-digest", replyTo: "inquiry+abc@reply.example.test" });
      expect(await store.getCheckpoint({ tenantId: TENANT, inquiryId: "inq-digest", action: "reply" })).toMatchObject({ status: "accepted", messageDigest: DIGEST_A, acceptedAt: NOW });
      expect(await store.findByProviderMessageId({ tenantId: TENANT, providerMessageId: "pm-digest" })).toEqual({ inquiryId: "inq-digest", action: "reply" });
      expect(await store.findByReplyAddress({ tenantId: TENANT, replyTo: "inquiry+abc@reply.example.test" })).toEqual({ inquiryId: "inq-digest" });
      expect(await store.findByReplyAddressAny?.({ replyTo: "inquiry+abc@reply.example.test" })).toEqual({ tenantId: TENANT, inquiryId: "inq-digest" });
    });

    it("keeps the digest through verification and provider reports", async () => {
      const { attemptId } = await acceptedAttempt(store, "inq-keep", "pm-keep");
      await expect(store.markVerified({ tenantId: TENANT, inquiryId: "inq-keep", action: "reply", attemptId, evidence: ["read-back"] })).resolves.toMatchObject({ status: "verified", messageDigest: DIGEST_A });
      await expect(store.markProviderOutcome(outcome("inq-keep", "pm-keep", "evt-keep", "delivered", "2026-10-05T12:01:00.000Z"))).resolves.toMatchObject({ status: "delivered", messageDigest: DIGEST_A });
      expect(await store.getCheckpoint({ tenantId: TENANT, inquiryId: "inq-keep", action: "reply" })).toMatchObject({ status: "delivered", messageDigest: DIGEST_A, providerEventId: "evt-keep" });
    });

    it("refuses a second attempt once a message is accepted or may be in flight", async () => {
      const first = await claim(store, "inq-once", DIGEST_A);
      expect((await claim(store, "inq-once", DIGEST_B)).reason).toBe("reconciliation_required");
      await store.markAccepted({ tenantId: TENANT, inquiryId: "inq-once", action: "reply", attemptId: first.attemptId!, acceptedAt: NOW, providerMessageId: "pm-once" });
      await store.releaseAttempt({ tenantId: TENANT, inquiryId: "inq-once", action: "reply", attemptId: first.attemptId! });
      const again = await claim(store, "inq-once", DIGEST_B);
      expect(again).toMatchObject({ acquired: false, reason: "already_accepted", checkpoint: { messageDigest: DIGEST_A } });
    });

    it("records the new digest when a rejected message gets another attempt", async () => {
      const first = await claim(store, "inq-retry", DIGEST_A);
      await store.markFailed({ tenantId: TENANT, inquiryId: "inq-retry", action: "reply", attemptId: first.attemptId!, reason: "provider_rate_limited", retryable: true });
      await store.releaseAttempt({ tenantId: TENANT, inquiryId: "inq-retry", action: "reply", attemptId: first.attemptId! });
      const second = await claim(store, "inq-retry", DIGEST_B);
      expect(second).toMatchObject({ acquired: true, checkpoint: { attempts: 2, messageDigest: DIGEST_B } });

      const ambiguous = await claim(store, "inq-unknown", DIGEST_A);
      await store.markFailed({ tenantId: TENANT, inquiryId: "inq-unknown", action: "reply", attemptId: ambiguous.attemptId!, reason: "timeout", retryable: true, ambiguous: true });
      await store.releaseAttempt({ tenantId: TENANT, inquiryId: "inq-unknown", action: "reply", attemptId: ambiguous.attemptId! });
      expect(await claim(store, "inq-unknown", DIGEST_A)).toMatchObject({ acquired: false, reason: "reconciliation_required", checkpoint: { status: "unknown", retryable: false } });
    });

    it("reserves the daily budget atomically", async () => {
      const first = await claim(store, "inq-budget-1", DIGEST_A, 3, 1);
      expect(first.acquired).toBe(true);
      expect(await claim(store, "inq-budget-2", DIGEST_A, 3, 1)).toMatchObject({ acquired: false, reason: "budget_exhausted" });
    });

    it("only moves the same accepted attempt to verified or accepted-unverified", async () => {
      const { attemptId } = await acceptedAttempt(store, "inq-state", "pm-state");
      await expect(store.markVerified({ tenantId: TENANT, inquiryId: "inq-state", action: "reply", attemptId: "someone-else", evidence: [] })).rejects.toThrow("inquiry_delivery_attempt_mismatch");
      await expect(store.markAcceptedUnverified({ tenantId: TENANT, inquiryId: "inq-state", action: "reply", attemptId, reason: "read-back unavailable" })).resolves.toMatchObject({ status: "accepted_unverified", retryable: false });
      await expect(store.markVerified({ tenantId: TENANT, inquiryId: "inq-state", action: "reply", attemptId, evidence: ["late read-back"] })).resolves.toMatchObject({ status: "verified" });
      await expect(store.markAcceptedUnverified({ tenantId: TENANT, inquiryId: "inq-state", action: "reply", attemptId, reason: "late" })).rejects.toThrow("inquiry_delivery_attempt_mismatch");
    });

    it("orders provider reports: failures stay terminal and stale evidence never wins", async () => {
      await acceptedAttempt(store, "inq-order", "pm-order");
      await expect(store.markProviderOutcome(outcome("inq-order", "pm-order", "evt-deferred", "deferred", "2026-10-05T12:01:00.000Z"))).resolves.toMatchObject({ status: "deferred" });
      await expect(store.markProviderOutcome(outcome("inq-order", "pm-order", "evt-delivered", "delivered", "2026-10-05T12:02:00.000Z"))).resolves.toMatchObject({ status: "delivered" });
      await expect(store.markProviderOutcome(outcome("inq-order", "pm-order", "evt-deferred-late", "deferred", "2026-10-05T12:03:00.000Z"))).resolves.toMatchObject({ status: "delivered", providerEventId: "evt-delivered" });
      await expect(store.markProviderOutcome(outcome("inq-order", "pm-order", "evt-bounce", "bounced", "2026-10-05T12:04:00.000Z"))).resolves.toMatchObject({ status: "bounced", retryable: false });
      await expect(store.markProviderOutcome(outcome("inq-order", "pm-order", "evt-bounce-old", "bounced", "2026-10-05T12:00:30.000Z"))).resolves.toMatchObject({ providerEventId: "evt-bounce" });
      await expect(store.markProviderOutcome(outcome("inq-order", "pm-order", "evt-bounce", "delivered", "2026-10-05T12:09:00.000Z"))).resolves.toMatchObject({ status: "bounced", providerEventId: "evt-bounce" });
      await expect(store.markProviderOutcome(outcome("inq-order", "pm-other", "evt-x", "delivered", NOW))).rejects.toThrow("inquiry_delivery_provider_message_mismatch");
    });

    it("lets a concurrent bounce win over a concurrent delivered report", async () => {
      await acceptedAttempt(store, "inq-race", "pm-race");
      await Promise.all([
        store.markProviderOutcome(outcome("inq-race", "pm-race", "evt-race-delivered", "delivered", "2026-10-05T12:02:00.000Z")),
        store.markProviderOutcome(outcome("inq-race", "pm-race", "evt-race-bounced", "bounced", "2026-10-05T12:01:00.000Z")),
      ]);
      expect(await store.getCheckpoint({ tenantId: TENANT, inquiryId: "inq-race", action: "reply" })).toMatchObject({ status: "bounced", providerEventId: "evt-race-bounced", messageDigest: DIGEST_A });
    });

    it("refuses a provider report before the acceptance is recorded", async () => {
      await claim(store, "inq-early", DIGEST_A);
      await expect(store.markProviderOutcome(outcome("inq-early", "pm-early", "evt-early", "delivered", NOW))).rejects.toThrow();
    });

    it("claims, completes and releases provider events only for the claim owner", async () => {
      const first = await store.claimProviderEvent({ tenantId: TENANT, providerEventId: "evt-claim" });
      expect(first.status).toBe("claimed");
      expect((await store.claimProviderEvent({ tenantId: TENANT, providerEventId: "evt-claim" })).status).toBe("processing");
      await store.releaseProviderEvent?.({ tenantId: TENANT, providerEventId: "evt-claim", claimToken: "not-the-owner" });
      expect((await store.claimProviderEvent({ tenantId: TENANT, providerEventId: "evt-claim" })).status).toBe("processing");
      if (first.status !== "claimed") throw new Error("claim missing");
      await store.releaseProviderEvent?.({ tenantId: TENANT, providerEventId: "evt-claim", claimToken: first.token });
      const second = await store.claimProviderEvent({ tenantId: TENANT, providerEventId: "evt-claim" });
      expect(second.status).toBe("claimed");
      if (second.status !== "claimed") throw new Error("claim missing");
      await store.completeProviderEvent?.({ tenantId: TENANT, providerEventId: "evt-claim", claimToken: first.token });
      expect((await store.claimProviderEvent({ tenantId: TENANT, providerEventId: "evt-claim" })).status).toBe("processing");
      await store.completeProviderEvent?.({ tenantId: TENANT, providerEventId: "evt-claim", claimToken: second.token });
      expect((await store.claimProviderEvent({ tenantId: TENANT, providerEventId: "evt-claim" })).status).toBe("completed");
    });
  });
}

storeContract("memory", () => createMemoryInquiryDeliveryStore());

describe.skipIf(!REDIS_SOCKET)("inquiry delivery store contract: real Redis Lua", () => {
  const client = REDIS_SOCKET ? new RespClient(REDIS_SOCKET) : null;
  const redis = client ? upstashLike(client) : null;
  afterAll(() => client?.close());

  storeContract(
    "redis",
    () => createRedisInquiryDeliveryStore(redis as never),
    async () => {
      await client!.command(["FLUSHALL"]);
    },
  );

  it("reads a checkpoint written before message digests existed, and keeps it digest-free", async () => {
    await client!.command(["FLUSHALL"]);
    const store = createRedisInquiryDeliveryStore(redis as never);
    // Exactly the JSON shape production wrote before this change.
    const legacy = {
      inquiryId: "inq-legacy",
      tenantId: TENANT,
      action: "reply",
      status: "accepted",
      attemptId: "attempt-legacy",
      attempts: 1,
      startedAt: NOW,
      acceptedAt: NOW,
      providerMessageId: "pm-legacy",
    };
    await client!.command(["SET", `reb:inquiry-delivery:${TENANT}:inq-legacy:reply`, JSON.stringify(legacy)]);
    const read = await store.getCheckpoint({ tenantId: TENANT, inquiryId: "inq-legacy", action: "reply" });
    expect(read).toMatchObject({ status: "accepted", providerMessageId: "pm-legacy" });
    expect(read).not.toHaveProperty("messageDigest");
    expect(await claim(store, "inq-legacy", DIGEST_A)).toMatchObject({ acquired: false, reason: "already_accepted" });
    await expect(store.markVerified({ tenantId: TENANT, inquiryId: "inq-legacy", action: "reply", attemptId: "attempt-legacy", evidence: ["read-back"] })).resolves.toMatchObject({ status: "verified" });
    const after = await store.getCheckpoint({ tenantId: TENANT, inquiryId: "inq-legacy", action: "reply" });
    expect(after).toMatchObject({ status: "verified" });
    expect(after).not.toHaveProperty("messageDigest");
  });

  it("ran the contract through Redis EVAL rather than a fake", async () => {
    const stats = await client!.command(["INFO", "commandstats"]) as string;
    const calls = Number(/cmdstat_eval:calls=(\d+)/.exec(stats)?.[1] ?? 0);
    expect(calls).toBeGreaterThan(20);
  });

  it("writes the digest into the stored JSON under the frozen reb: key", async () => {
    await client!.command(["FLUSHALL"]);
    const store = createRedisInquiryDeliveryStore(redis as never);
    await acceptedAttempt(store, "inq-raw", "pm-raw");
    const raw = await client!.command(["GET", `reb:inquiry-delivery:${TENANT}:inq-raw:reply`]);
    expect(JSON.parse(raw as string)).toMatchObject({ status: "accepted", messageDigest: DIGEST_A, providerMessageId: "pm-raw" });
    expect(await client!.command(["TTL", `reb:inquiry-delivery:${TENANT}:inq-raw:reply`])).toBeGreaterThan(0);
    expect(JSON.parse(await client!.command(["GET", `reb:inquiry-delivery-provider:${TENANT}:pm-raw`]) as string)).toEqual({ tenantId: TENANT, inquiryId: "inq-raw", action: "reply", providerMessageId: "pm-raw" });
  });
});
