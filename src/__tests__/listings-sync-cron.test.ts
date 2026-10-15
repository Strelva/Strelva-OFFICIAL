import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sweep = vi.hoisted(() => vi.fn(async () => ({ queued: 1, ran: 1, failed: 0 })));
vi.mock("@/products/listings-sync/check", async original => ({ ...(await original<typeof import("@/products/listings-sync/check")>()), sweepListingsSync: sweep }));

import { GET } from "@/app/api/cron/listings-sync/route";
import vercel from "../../vercel.json";

const request = (auth?: string) => new Request("http://localhost/api/cron/listings-sync", { headers: auth ? { authorization: auth } : {} });

beforeEach(() => { sweep.mockClear(); vi.stubEnv("CRON_SECRET", "secret"); });
afterEach(() => vi.unstubAllEnvs());

describe("listings-sync cron", () => {
  it("refuses a request without the cron secret", async () => {
    expect((await GET(request())).status).toBe(401);
    expect(sweep).not.toHaveBeenCalled();
  });
  it("skips while the App cannot be on", async () => {
    const response = await GET(request("Bearer secret"));
    expect(await response.json()).toEqual({ skipped: true, reason: "listings_sync off" });
    expect(sweep).not.toHaveBeenCalled();
  });
  it("sweeps when the App can be on", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_LISTINGS_SYNC_RELEASE", "workspace");
    expect(await (await GET(request("Bearer secret"))).json()).toEqual({ queued: 1, ran: 1, failed: 0 });
  });
  it("stays out of vercel.json", () => {
    expect(vercel.crons.some((cron: { path: string }) => cron.path.includes("listings-sync"))).toBe(false);
  });
});
