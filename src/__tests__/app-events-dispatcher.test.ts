import { describe, expect, it, vi } from "vitest";
import type { AppEvent, AppEventType } from "@/platform/app-events/contracts";
import { dispatchAppEvents, safeError, type DispatchDeps } from "@/platform/app-events/dispatcher";
import { PermanentAppEventError, type AppEventHandler } from "@/platform/app-events/handlers";
import type * as Store from "@/platform/app-events/store";
import type { BuiltInApp } from "@/platform/app-releases/contracts";
import type { WebhookOutcome } from "@/platform/app-events/webhooks";

const WS1 = "28100000-0000-4000-8000-000000000010";
const WS2 = "28100000-0000-4000-8000-000000000011";
const ENDPOINT = "28100000-0000-4000-8000-0000000000e1";
const SUB = "app:bookings:ha";
const WEBHOOK = `webhook:${ENDPOINT}`;

interface Cursor { delivered: number; attempts: number; nextAt: number; lease: string | null; leaseUntil: number; error: string | null }

/** An in-memory store with the SQL's claim, ack, fail, skip and release semantics. */
function memoryStore(clock: { t: number }) {
  const events = new Map<string, AppEvent[]>();
  const cursors = new Map<string, Cursor>();
  const deadLetters: { subscriber: string; workspaceId: string; eventId: string; sequence: number }[] = [];
  const disabled: string[] = [];
  const replays: { id: string; subscriber: string; workspaceId: string; leaseToken: string; event: AppEvent; allowed: boolean }[] = [];
  const finished: { id: string; ok: boolean; error: string | null }[] = [];
  const calls = { release: [] as string[], skip: [] as string[], ack: [] as string[] };
  let endpointAllowed = (_event: AppEvent) => true;
  let tokens = 0;
  const key = (subscriber: string, workspaceId: string) => `${subscriber}|${workspaceId}`;
  const last = (workspaceId: string) => events.get(workspaceId)?.length ?? 0;

  const api = {
    add(workspaceId: string, type: AppEventType, data: Record<string, unknown> = {}) {
      const list = events.get(workspaceId) ?? [];
      const sequence = list.length + 1;
      list.push({
        id: `00000000-0000-4000-8000-${String(workspaceId.slice(-3)).padStart(3, "0")}${String(sequence).padStart(9, "0")}`, workspaceId, sequence, type, schemaVersion: 1,
        subject: { kind: "booking", id: `b${sequence}` }, area: "bookings", occurredAt: "2026-10-15T10:00:00+00:00", recordedAt: "2026-10-15T10:00:00+00:00", data,
      });
      events.set(workspaceId, list);
    },
    cursor: (subscriber: string, workspaceId: string) => cursors.get(key(subscriber, workspaceId)),
    seed(subscriber: string, workspaceId: string, delivered = 0) {
      cursors.set(key(subscriber, workspaceId), { delivered, attempts: 0, nextAt: 0, lease: null, leaseUntil: 0, error: null });
    },
    deadLetters, disabled, replays, finished, calls,
    allowWhen(fn: (event: AppEvent) => boolean) { endpointAllowed = fn; },
    endpoints: [] as Store.WebhookEndpointTarget[],
    failures: new Set<string>(),
  };

  const failing = (name: string) => { if (api.failures.has(name)) throw new Error(`${name} failed for https://db.example.test/x with ops@example.test`); };
  const lane = (subscriber: string, workspaceId: string) => ({ subscriber, workspaceId });

  const store = {
    async recentWorkspaces() { failing("recentWorkspaces"); return [...events.keys()]; },
    async ensureCursors(pairs: readonly { subscriber: string; workspaceId: string }[]) {
      failing("ensureCursors");
      let inserted = 0;
      for (const pair of pairs) {
        if (cursors.has(key(pair.subscriber, pair.workspaceId))) continue;
        api.seed(pair.subscriber, pair.workspaceId, last(pair.workspaceId));
        inserted++;
      }
      return inserted;
    },
    async activeWebhookEndpoints() { failing("activeWebhookEndpoints"); return api.endpoints; },
    async claimLanes(input: { subscribers: readonly string[]; limit: number; batch: number; leaseSeconds: number }) {
      failing("claimLanes");
      const out = [];
      for (const [id, cursor] of cursors) {
        const [subscriber, workspaceId] = id.split("|") as [string, string];
        if (!input.subscribers.includes(subscriber) || cursor.nextAt > clock.t || (cursor.lease && cursor.leaseUntil > clock.t) || last(workspaceId) <= cursor.delivered) continue;
        const token = `00000000-0000-4000-8000-${String(++tokens).padStart(12, "0")}`;
        cursor.lease = token;
        cursor.leaseUntil = clock.t + input.leaseSeconds * 1000;
        const batch = (events.get(workspaceId) ?? []).filter((event) => event.sequence > cursor.delivered).slice(0, input.batch);
        out.push({
          subscriber, workspaceId, leaseToken: token, attempts: cursor.attempts, deliveredThrough: cursor.delivered,
          events: batch.map((event) => ({ ...event, allowed: subscriber.startsWith("webhook:") ? endpointAllowed(event) : true })),
        });
      }
      return out;
    },
    async ackLane(l: Store.LaneRef, through: number) {
      failing("ackLane");
      api.calls.ack.push(`${l.subscriber}:${through}`);
      const cursor = cursors.get(key(l.subscriber, l.workspaceId));
      if (!cursor || cursor.lease !== l.leaseToken || cursor.leaseUntil <= clock.t) return false;
      cursor.delivered = Math.max(cursor.delivered, through);
      cursor.attempts = 0;
      cursor.error = null;
      return true;
    },
    async failLane(l: Store.LaneRef, eventId: string, input: { error: string; permanent: boolean; maxAttempts: number; backoffSeconds: number }) {
      failing("failLane");
      const cursor = cursors.get(key(l.subscriber, l.workspaceId));
      if (!cursor || cursor.lease !== l.leaseToken) return "lost" as const;
      const event = events.get(l.workspaceId)!.find((item) => item.id === eventId)!;
      if (input.permanent || cursor.attempts + 1 >= input.maxAttempts) {
        deadLetters.push({ subscriber: l.subscriber, workspaceId: l.workspaceId, eventId, sequence: event.sequence });
        cursor.delivered = Math.max(cursor.delivered, event.sequence);
        cursor.attempts = 0;
        cursor.error = input.error;
        return "dead" as const; // the lease stays for the rest of the run
      }
      cursor.attempts++;
      cursor.error = input.error;
      cursor.nextAt = clock.t + Math.max(30, input.backoffSeconds) * 1000;
      cursor.lease = null;
      return "retry" as const;
    },
    async releaseLane(l: Store.LaneRef) {
      failing("releaseLane");
      api.calls.release.push(l.subscriber + "|" + l.workspaceId);
      const cursor = cursors.get(key(l.subscriber, l.workspaceId));
      if (cursor?.lease === l.leaseToken) cursor.lease = null;
    },
    async skipLane(l: Store.LaneRef) {
      failing("skipLane");
      api.calls.skip.push(l.subscriber + "|" + l.workspaceId);
      const cursor = cursors.get(key(l.subscriber, l.workspaceId));
      if (cursor?.lease === l.leaseToken) { cursor.delivered = last(l.workspaceId); cursor.lease = null; cursor.attempts = 0; }
      return last(l.workspaceId);
    },
    async disableEndpoint(id: string) { disabled.push(id); },
    async claimReplays() { return replays.splice(0); },
    async finishReplay(id: string, _token: string, ok: boolean, error: string | null) { finished.push({ id, ok, error }); },
    async purgeAppEvents() { failing("purgeAppEvents"); return { events: 0, deadLetters: 0, failures: 0 }; },
  };
  void lane;
  return { api, store: store as unknown as typeof Store };
}

const app = (subscriptions = [{ event: "booking.made", handler: "ha", scope: "bookings" }] as const): BuiltInApp => ({
  id: "bookings", name: "Bookings", publisher: "platform", systemKinds: [], labelOnSystems: true, makeRealChannels: [], availability: [],
  releases: [{ key: "bookings.baseline", number: 1, summary: "x", shippedIn: null, changesLiveBehavior: false, gates: [], requiredConnections: [], eventSubscriptions: subscriptions }],
});

function setup(options: Partial<DispatchDeps> & { handler?: AppEventHandler | null; events?: AppEventType[]; maxAttempts?: number; active?: boolean } = {}) {
  const clock = { t: 1_000_000 };
  const memory = memoryStore(clock);
  const handler = options.handler === undefined ? vi.fn<AppEventHandler>(async () => undefined) : options.handler;
  const sendWebhook = vi.fn(async (): Promise<WebhookOutcome> => "delivered");
  const deps: DispatchDeps = {
    store: memory.store, apps: [app()], handlerFor: () => handler, workspaceOn: async () => true, webhooksOn: false,
    activeFor: async () => options.active === false ? new Map() : new Map([[SUB, { appId: "bookings" as const, handler: "ha", events: options.events ?? ["booking.made" as const], maxAttempts: options.maxAttempts ?? 8 }]]),
    sendWebhook, now: () => clock.t, deadlineMs: 45_000, laneLimit: 50, batch: 20, leaseSeconds: 120, handlerTimeoutMs: 10_000, ...options,
  };
  delete (deps as Partial<typeof options>).handler;
  return { clock, memory, handler, sendWebhook, deps, run: () => dispatchAppEvents(deps) };
}

describe("dispatchAppEvents", () => {
  it("delivers in sequence order across two lanes and acks each event", async () => {
    const t = setup();
    const seen: string[] = [];
    t.deps.handlerFor = () => async (event) => { seen.push(`${event.workspaceId.slice(-2)}#${event.sequence}`); };
    t.memory.api.seed(SUB, WS1); t.memory.api.seed(SUB, WS2);
    for (let i = 0; i < 3; i++) { t.memory.api.add(WS1, "booking.made"); t.memory.api.add(WS2, "booking.made"); }
    const result = await t.run();
    expect(result).toMatchObject({ status: "ran", lanes: 2, delivered: 6, retried: 0, dead: 0, errors: [] });
    expect(seen.filter((item) => item.startsWith("10"))).toEqual(["10#1", "10#2", "10#3"]);
    expect(seen.filter((item) => item.startsWith("11"))).toEqual(["11#1", "11#2", "11#3"]);
    expect(t.memory.api.cursor(SUB, WS1)).toMatchObject({ delivered: 3, lease: null });
    expect(t.memory.api.calls.ack).toHaveLength(6);
  });

  it("starts a new subscriber at the end so earlier events are not delivered", async () => {
    const t = setup();
    t.memory.api.add(WS1, "booking.made");
    const first = await t.run();
    expect(first.delivered).toBe(0);
    t.memory.api.add(WS1, "booking.made");
    expect((await t.run()).delivered).toBe(1);
  });

  it("stops the lane at a throwing handler, backs off 60 seconds, then resumes at the same event", async () => {
    const calls: number[] = [];
    let fail = true;
    const t = setup({ handler: async (event, context) => { calls.push(event.sequence * 10 + context.attempt); if (fail && event.sequence === 2) throw new Error("boom"); } });
    t.memory.api.seed(SUB, WS1);
    for (let i = 0; i < 3; i++) t.memory.api.add(WS1, "booking.made");
    const first = await t.run();
    expect(first).toMatchObject({ delivered: 1, retried: 1, dead: 0 });
    expect(calls).toEqual([11, 21]);
    expect(t.memory.api.cursor(SUB, WS1)).toMatchObject({ delivered: 1, attempts: 1, error: "boom" });
    expect(t.memory.api.cursor(SUB, WS1)!.nextAt).toBe(t.clock.t + 60_000);
    await t.run();
    expect(calls).toEqual([11, 21]);
    fail = false;
    t.clock.t += 61_000;
    const resumed = await t.run();
    expect(resumed.delivered).toBe(2);
    expect(calls).toEqual([11, 21, 22, 31]);
  });

  it("sets a permanent failure aside and delivers the next event in the same run", async () => {
    const t = setup({ handler: async (event) => { if (event.sequence === 1) throw new PermanentAppEventError("never"); } });
    t.memory.api.seed(SUB, WS1);
    t.memory.api.add(WS1, "booking.made"); t.memory.api.add(WS1, "booking.made");
    const result = await t.run();
    expect(result).toMatchObject({ dead: 1, delivered: 1, retried: 0 });
    expect(t.memory.api.deadLetters).toEqual([expect.objectContaining({ sequence: 1, subscriber: SUB })]);
    expect(t.memory.api.cursor(SUB, WS1)).toMatchObject({ delivered: 2, lease: null });
  });

  it("ends in a dead letter after the declared attempts", async () => {
    const t = setup({ maxAttempts: 2, handler: async () => { throw new Error("still failing"); } });
    t.memory.api.seed(SUB, WS1);
    t.memory.api.add(WS1, "booking.made");
    expect(await t.run()).toMatchObject({ retried: 1, dead: 0 });
    t.clock.t += 61_000;
    expect(await t.run()).toMatchObject({ retried: 0, dead: 1 });
    expect(t.memory.api.deadLetters).toHaveLength(1);
    expect(t.memory.api.cursor(SUB, WS1)).toMatchObject({ delivered: 1, attempts: 0 });
  });

  it("acks types the App did not subscribe to without calling the handler", async () => {
    const t = setup();
    t.memory.api.seed(SUB, WS1);
    t.memory.api.add(WS1, "booking.changed"); t.memory.api.add(WS1, "booking.made"); t.memory.api.add(WS1, "fact.changed");
    const result = await t.run();
    expect(t.handler).toHaveBeenCalledTimes(1);
    expect(result.delivered).toBe(1);
    expect(t.memory.api.cursor(SUB, WS1)).toMatchObject({ delivered: 3 });
  });

  it("skips a subscriber that is not active for the business and jumps to the end", async () => {
    const t = setup({ active: false });
    t.memory.api.seed(SUB, WS1);
    t.memory.api.add(WS1, "booking.made"); t.memory.api.add(WS1, "booking.made");
    const result = await t.run();
    expect(result.skipped).toBe(1);
    expect(t.handler).not.toHaveBeenCalled();
    expect(t.memory.api.cursor(SUB, WS1)).toMatchObject({ delivered: 2, lease: null });
  });

  it("releases the lane, without advancing, when reading the subscriptions throws", async () => {
    const t = setup({ activeFor: async () => { throw new Error("flag read failed"); } });
    t.memory.api.seed(SUB, WS1);
    t.memory.api.add(WS1, "booking.made"); t.memory.api.add(WS1, "booking.made");
    const result = await t.run();
    expect(result.skipped).toBe(0);
    expect(t.handler).not.toHaveBeenCalled();
    expect(t.memory.api.calls.skip).toEqual([]);
    expect(t.memory.api.cursor(SUB, WS1)).toMatchObject({ delivered: 0, lease: null });
  });

  it("stops a lane between events once the deadline has passed", async () => {
    const holder: { clock?: { t: number } } = {};
    const t = setup({ handler: async () => { holder.clock!.t += 60_000; } });
    holder.clock = t.clock;
    t.memory.api.seed(SUB, WS1);
    t.memory.api.add(WS1, "booking.made"); t.memory.api.add(WS1, "booking.made");
    const result = await t.run();
    expect(result.delivered).toBe(1);
        expect(t.memory.api.cursor(SUB, WS1)).toMatchObject({ delivered: 1, lease: null });
  });

  it("releases a lane whose handler is not registered, without advancing", async () => {
    const t = setup({ handler: null });
    t.memory.api.seed(SUB, WS1);
    t.memory.api.add(WS1, "booking.made");
    const result = await t.run();
    expect(result.unregistered).toBe(1);
    expect(t.memory.api.cursor(SUB, WS1)).toMatchObject({ delivered: 0, lease: null });
  });

  it("counts a handler timeout as a retry and aborts its signal", async () => {
    let aborted = false;
    const t = setup({ handlerTimeoutMs: 15, handler: (_event, context) => new Promise<void>(() => { context.signal.addEventListener("abort", () => { aborted = true; }); }) });
    t.memory.api.seed(SUB, WS1);
    t.memory.api.add(WS1, "booking.made");
    const result = await t.run();
    expect(result.retried).toBe(1);
    expect(aborted).toBe(true);
    expect(t.memory.api.cursor(SUB, WS1)).toMatchObject({ error: "timed out", attempts: 1 });
  });

  it("releases the remaining lanes when the deadline passes", async () => {
    const holder: { clock?: { t: number } } = {};
    const t = setup({ handler: async () => { holder.clock!.t += 60_000; } });
    holder.clock = t.clock;
    t.memory.api.seed(SUB, WS1); t.memory.api.seed(SUB, WS2);
    t.memory.api.add(WS1, "booking.made"); t.memory.api.add(WS2, "booking.made");
    const result = await t.run();
    expect(result.delivered).toBe(1);
    expect(t.memory.api.calls.release.filter((item) => item.endsWith(WS2))).toHaveLength(1);
    expect(t.memory.api.cursor(SUB, WS2)).toMatchObject({ delivered: 0, lease: null });
  });

  it("reads each business's subscriptions once per run", async () => {
    const activeFor = vi.fn(async () => new Map([[SUB, { appId: "bookings" as const, handler: "ha", events: ["booking.made" as const], maxAttempts: 8 }]]));
    const t = setup({ activeFor });
    t.memory.api.seed(SUB, WS1);
    t.memory.api.add(WS1, "booking.made");
    await t.run();
    expect(activeFor).toHaveBeenCalledTimes(1);
  });

  it("records a store error and still returns", async () => {
    const t = setup();
    t.memory.api.failures.add("claimLanes");
    t.memory.api.failures.add("purgeAppEvents");
    t.memory.api.add(WS1, "booking.made");
    const result = await t.run();
    expect(result.status).toBe("ran");
    expect(result.errors).toHaveLength(2);
    expect(result.errors.join(" ")).not.toMatch(/https?:|@/);
    expect(result.purged).toBeNull();
  });

  it("holds the error list to twenty", async () => {
    const t = setup();
    for (const name of ["recentWorkspaces", "claimLanes", "purgeAppEvents"]) t.memory.api.failures.add(name);
    expect((await t.run()).errors.length).toBeLessThanOrEqual(20);
  });

  describe("Webhook lanes", () => {
    const endpoint = { id: ENDPOINT, workspaceId: WS1, url: "https://maker.example.test/e", eventTypes: ["booking.made" as const], secretCiphertext: "enc:v1:x", createdByKind: "business" as const, agencyWorkspaceId: null };
    const withEndpoint = (options: Parameters<typeof setup>[0] = {}) => {
      const t = setup({ webhooksOn: true, apps: [], ...options });
      t.memory.api.endpoints.push(endpoint);
      t.memory.api.seed(WEBHOOK, WS1);
      return t;
    };

    it("sends allowed events of the endpoint's types and acks the rest without sending", async () => {
      const t = withEndpoint();
      t.memory.api.allowWhen((event) => event.sequence !== 2);
      t.memory.api.add(WS1, "booking.made"); t.memory.api.add(WS1, "booking.made"); t.memory.api.add(WS1, "fact.changed"); t.memory.api.add(WS1, "booking.made");
      const result = await t.run();
      expect(t.sendWebhook).toHaveBeenCalledTimes(2);
      expect(result.webhooks.delivered).toBe(2);
      expect(t.memory.api.cursor(WEBHOOK, WS1)).toMatchObject({ delivered: 4 });
    });

    it("disables an endpoint that answered gone and dead-letters the event", async () => {
      const t = withEndpoint();
      t.sendWebhook.mockResolvedValueOnce("gone");
      t.memory.api.add(WS1, "booking.made"); t.memory.api.add(WS1, "booking.made");
      const result = await t.run();
      expect(t.memory.api.disabled).toEqual([ENDPOINT]);
      expect(result.webhooks).toMatchObject({ disabled: 1, dead: 1, delivered: 0 });
      expect(t.memory.api.deadLetters).toHaveLength(1);
      expect(t.sendWebhook).toHaveBeenCalledTimes(1);
    });

    it("retries with backoff and stops the lane", async () => {
      const t = withEndpoint();
      t.sendWebhook.mockResolvedValue("retry");
      t.memory.api.add(WS1, "booking.made"); t.memory.api.add(WS1, "booking.made");
      const result = await t.run();
      expect(result.webhooks).toMatchObject({ retried: 1, delivered: 0 });
      expect(t.sendWebhook).toHaveBeenCalledTimes(1);
      expect(t.memory.api.cursor(WEBHOOK, WS1)).toMatchObject({ delivered: 0, attempts: 1 });
    });

    it("sets a refused event aside and carries on", async () => {
      const t = withEndpoint();
      t.sendWebhook.mockResolvedValueOnce("permanent");
      t.memory.api.add(WS1, "booking.made"); t.memory.api.add(WS1, "booking.made");
      const result = await t.run();
      expect(result.webhooks).toMatchObject({ dead: 1, delivered: 1 });
    });

    it("skips every Webhook lane while the switch is off", async () => {
      const t = withEndpoint({ webhooksOn: false });
      t.memory.api.add(WS1, "booking.made");
      const lanes = await dispatchAppEvents({ ...t.deps, apps: [], webhooksOn: false });
      expect(lanes.lanes).toBe(0);
      expect(t.sendWebhook).not.toHaveBeenCalled();
    });

    it("releases a Webhook lane, without advancing, when the business read throws", async () => {
      const t = withEndpoint({ workspaceOn: async () => { throw new Error("flag read failed"); } });
      t.memory.api.add(WS1, "booking.made");
      const result = await t.run();
      expect(result.webhooks.skipped).toBe(0);
      expect(t.sendWebhook).not.toHaveBeenCalled();
      expect(t.memory.api.cursor(WEBHOOK, WS1)).toMatchObject({ delivered: 0, lease: null });
    });

    it("stops a Webhook lane between events once the deadline has passed", async () => {
      const t = withEndpoint();
      t.sendWebhook.mockImplementation(async () => { t.clock.t += 60_000; return "delivered"; });
      t.memory.api.add(WS1, "booking.made"); t.memory.api.add(WS1, "booking.made");
      const result = await t.run();
      expect(t.sendWebhook).toHaveBeenCalledTimes(1);
      expect(result.webhooks.delivered).toBe(1);
      expect(t.memory.api.cursor(WEBHOOK, WS1)).toMatchObject({ delivered: 1, lease: null });
    });

    it("skips a claimed Webhook lane when the switch or the business is off", async () => {
      const t = withEndpoint({ workspaceOn: async () => false });
      t.memory.api.add(WS1, "booking.made");
      const result = await t.run();
      expect(result.webhooks.skipped).toBe(1);
      expect(t.sendWebhook).not.toHaveBeenCalled();
      expect(t.memory.api.cursor(WEBHOOK, WS1)).toMatchObject({ delivered: 1 });
    });
  });

  describe("replays", () => {
    const replayEvent = (): AppEvent => ({
      id: "28100000-0000-4000-8000-0000000000b9", workspaceId: WS1, sequence: 9, type: "booking.made", schemaVersion: 1, subject: { kind: "booking", id: "b9" },
      area: "bookings", occurredAt: "2026-10-15T10:00:00+00:00", recordedAt: "2026-10-15T10:00:00+00:00", data: {},
    });

    it("runs the handler with replay set and finishes delivered", async () => {
      const t = setup();
      t.memory.api.replays.push({ id: "dl1", subscriber: SUB, workspaceId: WS1, leaseToken: "t1", event: replayEvent(), allowed: true });
      const result = await t.run();
      expect(t.handler).toHaveBeenCalledWith(expect.objectContaining({ sequence: 9 }), expect.objectContaining({ replay: true, attempt: 1, subscriber: SUB }));
      expect(result.replays).toEqual({ delivered: 1, failed: 0 });
      expect(t.memory.api.finished).toEqual([{ id: "dl1", ok: true, error: null }]);
    });

    it("finishes failed when the handler throws", async () => {
      const t = setup({ handler: async () => { throw new Error("nope for ops@example.test"); } });
      t.memory.api.replays.push({ id: "dl2", subscriber: SUB, workspaceId: WS1, leaseToken: "t2", event: replayEvent(), allowed: true });
      const result = await t.run();
      expect(result.replays).toEqual({ delivered: 0, failed: 1 });
      expect(t.memory.api.finished[0]).toEqual({ id: "dl2", ok: false, error: "nope for <email>" });
    });

    it("finishes failed for a Webhook replay when the business's app_events row is off or unreadable", async () => {
      for (const workspaceOn of [async () => false, async () => { throw new Error("flag read failed"); }]) {
        const t = setup({ webhooksOn: true, workspaceOn });
        t.memory.api.endpoints.push({ id: ENDPOINT, workspaceId: WS1, url: "https://maker.example.test/e", eventTypes: ["booking.made"], secretCiphertext: "enc:v1:x", createdByKind: "business", agencyWorkspaceId: null });
        t.memory.api.replays.push({ id: "dl4", subscriber: WEBHOOK, workspaceId: WS1, leaseToken: "t4", event: replayEvent(), allowed: true });
        const result = await t.run();
        expect(result.replays).toEqual({ delivered: 0, failed: 1 });
        expect(t.memory.api.finished[0]).toEqual({ id: "dl4", ok: false, error: "The webhook is not receiving events." });
        expect(t.sendWebhook).not.toHaveBeenCalled();
      }
    });

    it("finishes failed for a Webhook that is not allowed", async () => {
      const t = setup({ webhooksOn: true });
      t.memory.api.replays.push({ id: "dl3", subscriber: WEBHOOK, workspaceId: WS1, leaseToken: "t3", event: replayEvent(), allowed: false });
      const result = await t.run();
      expect(result.replays.failed).toBe(1);
      expect(t.sendWebhook).not.toHaveBeenCalled();
    });
  });
});

describe("safeError", () => {
  it("strips addresses and emails and keeps it short", () => {
    expect(safeError(new Error("POST https://maker.example.test/hook?token=abc failed for owner@example.test"))).toBe("POST <url> failed for <email>");
    expect(safeError("x".repeat(500))).toHaveLength(300);
    expect(safeError(undefined)).toBe("failed");
    expect(safeError(new Error("   "))).toBe("failed");
  });
});
