import { afterEach, describe, expect, it, vi } from "vitest";
import { CRON_MAX_AGE_SECONDS } from "@/platform/infra/heartbeat";

const store = new Map<string, unknown>();
async function recover(_script: string, keys: string[], args: Array<string | number>) {
  const heartbeat = store.get(keys[0]!) as { ts: number; ok: boolean } | undefined;
  if (heartbeat ? heartbeat.ts !== Number(args[1]) : args[1] !== "") return 0;
  if (args[0] === "healthy") {
    if (heartbeat?.ok) { store.delete(keys[1]!); store.delete(keys[2]!); }
    return 0;
  }
  if (args[0] === "failed" ? heartbeat?.ok !== false : heartbeat?.ok === false) return 0;
  const marker = keys[args[0] === "failed" ? 1 : 2]!;
  if (store.has(marker)) return 0;
  store.set(marker, "1");
  return 1;
}
const mockRedis = {
  set: vi.fn(async (key: string, value: unknown, options?: { nx?: boolean }) => {
    if (options?.nx && store.has(key)) return null;
    store.set(key, value);
    return "OK";
  }),
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  eval: vi.fn(recover),
};
const mocks = vi.hoisted(() => ({ denied: false, error: vi.fn(), capture: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => mockRedis }));
vi.mock("../lib/cron-auth", () => ({ requireCronRequest: () => mocks.denied ? new Response(null, { status: 401 }) : null }));
vi.mock("@/platform/infra/logger", () => ({ logger: { error: mocks.error } }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: mocks.capture }));

import { GET } from "../app/api/cron/heartbeat/route";
import { reportCronHeartbeat } from "@/platform/infra/monitoring";

function seedHealthy() {
  for (const cron of Object.keys(CRON_MAX_AGE_SECONDS)) {
    store.set(`reb:heartbeat:${cron}`, { cron, ts: Date.now(), ok: true });
  }
}
const request = () => new Request("https://app.strelva.com/api/cron/heartbeat");
afterEach(() => {
  store.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  mocks.denied = false;
  mockRedis.eval.mockImplementation(recover);
});

describe("heartbeat watchdog cron", () => {
  it("records its own heartbeat so it is not reported stale on the next pass", async () => {
    const first = await GET(request());
    expect(first.status).toBe(200);
    expect(store.has("reb:heartbeat:heartbeat")).toBe(true);
    mocks.error.mockClear();
    const second = await GET(request());
    const body = await second.json();
    expect(body.statuses.find((status: { cron: string }) => status.cron === "heartbeat").stale).toBe(false);
    expect(mocks.error.mock.calls.some(([, context]) => context.cron === "heartbeat")).toBe(false);
  });

  it("pages a fresh failed cron once even across new failed runs", async () => {
    vi.useFakeTimers();
    seedHealthy();
    store.set("reb:heartbeat:weekly-report", { cron: "weekly-report", ts: Date.now(), ok: false });
    const first = await GET(request());
    expect((await first.json()).failed).toBe(1);
    vi.advanceTimersByTime(30 * 60 * 1000);
    store.set("reb:heartbeat:weekly-report", { cron: "weekly-report", ts: Date.now(), ok: false });
    await GET(request());
    expect(mocks.error.mock.calls.filter(([event]) => event.includes("cron_failed"))).toHaveLength(1);
  });

  it("dedupes continuing staleness as age and last-seen change", async () => {
    vi.useFakeTimers();
    seedHealthy();
    const staleTs = Date.now() - (CRON_MAX_AGE_SECONDS["weekly-report"] + 3600) * 1000;
    store.set("reb:heartbeat:weekly-report", { cron: "weekly-report", ts: staleTs, ok: true });
    await GET(request());
    vi.advanceTimersByTime(30 * 60 * 1000);
    store.set("reb:heartbeat:weekly-report", { cron: "weekly-report", ts: staleTs + 1000, ok: true });
    await GET(request());
    expect(mocks.error.mock.calls.filter(([, context]) => context.cron === "weekly-report")).toHaveLength(1);
  });

  it("clears failed and stale incidents on recovery so a new failure pages", async () => {
    seedHealthy();
    store.set("reb:heartbeat:weekly-report", { cron: "weekly-report", ts: 0, ok: false });
    await GET(request());
    store.set("reb:heartbeat:weekly-report", { cron: "weekly-report", ts: Date.now(), ok: true });
    await GET(request());
    store.set("reb:heartbeat:weekly-report", { cron: "weekly-report", ts: Date.now(), ok: false });
    await GET(request());
    expect(mocks.error.mock.calls.filter(([event]) => event.includes("cron_failed"))).toHaveLength(2);
  });

  it("emits only safe operational metadata from a failed heartbeat", async () => {
    vi.stubEnv("SENTRY_DSN", "https://public@example.test/1");
    seedHealthy();
    store.set("reb:heartbeat:weekly-report", { cron: "weekly-report", ts: Date.now(), ok: false, content: "private fixture content", secret: "private fixture secret", actorRole: "forged" });
    await GET(request());
    expect(mocks.capture).toHaveBeenCalledWith("cron_failed", expect.objectContaining({ extra: expect.objectContaining({ cron: "weekly-report", actorRole: "cron", operation: "heartbeat_check", outcome: "failed", requestId: expect.any(String) }) }));
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toMatch(/private fixture|forged/);
  });

  it("cannot clear a new failure after reading an earlier healthy snapshot", async () => {
    seedHealthy();
    let interleaved = false;
    mockRedis.eval.mockImplementation(async (script, keys, args) => {
      if (!interleaved && keys[0] === "reb:heartbeat:weekly-report") {
        interleaved = true;
        store.set(keys[0], { cron: "weekly-report", ts: Number(args[1]) + 1, ok: false });
        await reportCronHeartbeat({ cron: "weekly-report", lastSeen: new Date(Number(args[1]) + 1).toISOString(), lastOk: false, stale: false, ageSeconds: 0, maxAgeSeconds: 1000 }, "newer-request");
      }
      return recover(script, keys, args);
    });
    await GET(request());
    expect(interleaved).toBe(true);
    expect(store.has("reb:alert-dedup:cron_failed:cron=weekly-report")).toBe(true);
    await GET(request());
    expect(mocks.error.mock.calls.filter(([event]) => event.includes("cron_failed"))).toHaveLength(1);
  });

  it("cannot recreate an obsolete failure marker after recovery", async () => {
    seedHealthy();
    const timestamp = Date.now();
    store.set("reb:heartbeat:weekly-report", { cron: "weekly-report", ts: timestamp, ok: false });
    let interleaved = false;
    mockRedis.eval.mockImplementation(async (script, keys, args) => {
      if (!interleaved && keys[0] === "reb:heartbeat:weekly-report" && args[0] === "failed") {
        interleaved = true;
        store.set(keys[0], { cron: "weekly-report", ts: timestamp + 1, ok: true });
        await GET(request());
      }
      return recover(script, keys, args);
    });
    await GET(request());
    expect(interleaved).toBe(true);
    expect(store.has("reb:alert-dedup:cron_failed:cron=weekly-report")).toBe(false);
    expect(mocks.error).not.toHaveBeenCalled();
    store.set("reb:heartbeat:weekly-report", { cron: "weekly-report", ts: timestamp + 2, ok: false });
    await GET(request());
    expect(mocks.error.mock.calls.filter(([event]) => event.includes("cron_failed"))).toHaveLength(1);
  });

  it("rejects unauthenticated requests without reading or changing incidents", async () => {
    mocks.denied = true;
    expect((await GET(request())).status).toBe(401);
    expect(mockRedis.get).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
    expect(mockRedis.eval).not.toHaveBeenCalled();
  });
});
