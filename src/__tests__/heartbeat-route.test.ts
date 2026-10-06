import { afterEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
const mockRedis = {
  set: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
    return "OK";
  }),
  get: vi.fn(async (key: string) => store.get(key) ?? null),
};

vi.mock("@/platform/infra/redis", () => ({ getRedis: () => mockRedis }));
vi.mock("../lib/cron-auth", () => ({ requireCronRequest: () => null }));
const alertOnce = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/platform/infra/monitoring", () => ({ alertOnce }));

import { GET } from "../app/api/cron/heartbeat/route";

afterEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe("heartbeat watchdog cron", () => {
  it("records its own heartbeat so it is not reported stale on the next pass", async () => {
    const first = await GET(new Request("https://app.strelva.com/api/cron/heartbeat"));
    expect(first.status).toBe(200);
    expect(store.has("reb:heartbeat:heartbeat")).toBe(true);
    alertOnce.mockClear();

    const second = await GET(new Request("https://app.strelva.com/api/cron/heartbeat"));
    const body = (await second.json()) as { statuses: Array<{ cron: string; stale: boolean }> };
    const self = body.statuses.find((status) => status.cron === "heartbeat");
    expect(self?.stale).toBe(false);
    expect(alertOnce).not.toHaveBeenCalledWith("cron_stale", "high", expect.objectContaining({ cron: "heartbeat" }), expect.anything());
  });
});
