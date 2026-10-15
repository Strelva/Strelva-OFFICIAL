import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectedSitesStore } from "@/products/connected-sites/store";

const mocks = vi.hoisted(() => ({ heartbeat: vi.fn(), denied: vi.fn(), purge: vi.fn(), intakePurge: vi.fn() }));
vi.mock("@/platform/infra/heartbeat", () => ({ recordHeartbeat: mocks.heartbeat }));
vi.mock("@/lib/cron-auth", () => ({ requireCronRequest: mocks.denied }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/products/vertical-intake/server", async () => {
  const release = await import("@/products/vertical-intake/release");
  return { verticalIntakeReleaseMayBeOn: release.verticalIntakeReleaseMayBeOn, intakeSensitiveFieldsAvailable: release.intakeSensitiveFieldsAvailable, purgeIntakeSensitive: mocks.intakePurge };
});

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

  describe("Dental intake member IDs", () => {
    const on = () => { vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_VERTICAL_INTAKE_RELEASE", "1"); };

    it("does not touch them unless the App may be on", async () => {
      mocks.purge.mockResolvedValue({ events: 0, spam: 0 });
      const res = await GET(new Request(url));
      expect(await res.json()).toEqual({ events: 0, spam: 0 });
      expect(mocks.intakePurge).not.toHaveBeenCalled();
    });

    it("purges in batches when the App may be on, and reports the count", async () => {
      on();
      mocks.purge.mockResolvedValue({ events: 0, spam: 0 });
      mocks.intakePurge.mockResolvedValueOnce(1000).mockResolvedValueOnce(4);
      const res = await GET(new Request(url));
      expect(await res.json()).toEqual({ events: 0, spam: 0, intakeSensitive: 1004 });
      expect(mocks.intakePurge).toHaveBeenCalledWith(1000);
      expect(mocks.heartbeat).toHaveBeenCalledWith("connected-sites-purge", { ok: true, processed: 1004 });
    });

    it("also runs where member IDs may have been collected", async () => {
      vi.stubEnv("STRELVA_INTAKE_SENSITIVE_FIELDS", "1");
      vi.stubEnv("SECRETS_ENC_KEY", "test-key");
      mocks.purge.mockResolvedValue({ events: 0, spam: 0 });
      mocks.intakePurge.mockResolvedValue(0);
      await GET(new Request(url));
      expect(mocks.intakePurge).toHaveBeenCalledTimes(1);
    });

    it("runs even when connected sites are off, so retention never depends on that switch", async () => {
      on();
      vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "0");
      mocks.intakePurge.mockResolvedValue(2);
      expect(await (await GET(new Request(url))).json()).toEqual({ status: "disabled", intakeSensitive: 2 });
      expect(mocks.purge).not.toHaveBeenCalled();
    });

    it("a failed intake purge leaves connected-site counts intact, still answers 200 and beats not ok", async () => {
      on();
      mocks.purge.mockResolvedValueOnce({ events: 1000, spam: 3 }).mockResolvedValueOnce({ events: 12, spam: 0 });
      mocks.intakePurge.mockRejectedValue(new Error("table missing"));
      const res = await GET(new Request(url));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ events: 1012, spam: 3, intakeSensitive: 0 });
      expect(mocks.heartbeat).toHaveBeenCalledWith("connected-sites-purge", { ok: false, processed: 1015, failed: 1 });
    });

    it("caps the intake purge at ten batches", async () => {
      on();
      mocks.purge.mockResolvedValue({ events: 0, spam: 0 });
      mocks.intakePurge.mockResolvedValue(1000);
      await GET(new Request(url));
      expect(mocks.intakePurge).toHaveBeenCalledTimes(10);
    });
  });
});
