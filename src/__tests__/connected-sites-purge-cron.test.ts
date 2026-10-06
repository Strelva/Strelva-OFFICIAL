import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectedSitesStore } from "@/products/connected-sites/store";

const mocks = vi.hoisted(() => ({ heartbeat: vi.fn(), denied: vi.fn(), purge: vi.fn() }));
vi.mock("@/platform/infra/heartbeat", () => ({ recordHeartbeat: mocks.heartbeat }));
vi.mock("@/lib/cron-auth", () => ({ requireCronRequest: mocks.denied }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));

import { setConnectedSitesStoreForTests } from "@/products/connected-sites/store";
import { GET } from "@/app/api/cron/connected-sites-purge/route";
import vercel from "../../vercel.json";

const url = "http://localhost/api/cron/connected-sites-purge";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "1");
  mocks.denied.mockReturnValue(null);
  setConnectedSitesStoreForTests({ purge: mocks.purge } as unknown as ConnectedSitesStore);
});
afterEach(() => { vi.unstubAllEnvs(); setConnectedSitesStoreForTests(null); });

describe("connected-sites-purge cron", () => {
  it("is declared daily in vercel.json and registered for the heartbeat", async () => {
    const cron = vercel.crons.find((c: { path: string }) => c.path === "/api/cron/connected-sites-purge");
    expect(cron?.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
    const actual = await vi.importActual<typeof import("@/platform/infra/heartbeat")>("@/platform/infra/heartbeat");
    expect(actual.CRON_MAX_AGE_SECONDS["connected-sites-purge"]).toBe(26 * 3600);
  });

  it("rejects an unauthenticated call without purging", async () => {
    mocks.denied.mockReturnValue(new Response("no", { status: 401 }));
    expect((await GET(new Request(url))).status).toBe(401);
    expect(mocks.purge).not.toHaveBeenCalled();
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });

  it("does nothing but beat while the release is off", async () => {
    vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "0");
    expect(await (await GET(new Request(url))).json()).toEqual({ status: "disabled" });
    expect(mocks.purge).not.toHaveBeenCalled();
    expect(mocks.heartbeat).toHaveBeenCalledWith("connected-sites-purge", { ok: true, processed: 0 });
  });

  it("purges in batches until a batch comes back short", async () => {
    mocks.purge.mockResolvedValueOnce({ events: 1000, spam: 3 }).mockResolvedValueOnce({ events: 12, spam: 0 });
    const res = await GET(new Request(url));
    expect(await res.json()).toEqual({ events: 1012, spam: 3 });
    expect(mocks.purge).toHaveBeenCalledTimes(2);
    expect(mocks.purge).toHaveBeenCalledWith(1000);
    expect(mocks.heartbeat).toHaveBeenCalledWith("connected-sites-purge", { ok: true, processed: 1015 });
  });

  it("stops after ten batches so one run stays bounded", async () => {
    mocks.purge.mockResolvedValue({ events: 1000, spam: 1000 });
    await GET(new Request(url));
    expect(mocks.purge).toHaveBeenCalledTimes(10);
  });

  it("a failure reports what was removed and beats not ok", async () => {
    mocks.purge.mockResolvedValueOnce({ events: 1000, spam: 0 }).mockRejectedValueOnce(new Error("db down"));
    const res = await GET(new Request(url));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ events: 1000, spam: 0 });
    expect(mocks.heartbeat).toHaveBeenCalledWith("connected-sites-purge", { ok: false, processed: 1000, failed: 1 });
  });
});
