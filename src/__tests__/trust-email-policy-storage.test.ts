import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ redis: vi.fn(), set: vi.fn(), source: vi.fn(), mirror: vi.fn(), db: vi.fn(), rpc: vi.fn(), read: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: mock.redis }));
vi.mock("@/platform/client-records/move", () => ({ clientRecordReadSource: mock.source, readThroughFlag: mock.read }));
vi.mock("@/platform/client-records/mirror", () => ({ mirrorClientRecord: mock.mirror }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: mock.db }));
import { getClientEmailOverride, setClientEmailOverride } from "@/platform/infra/email/client-override";
const workspace = "workspace:cc000000-0000-4000-8000-000000000003";
beforeEach(() => { vi.resetAllMocks(); mock.redis.mockReturnValue({ set: mock.set }); mock.set.mockResolvedValue("OK"); mock.source.mockResolvedValue("redis"); mock.mirror.mockResolvedValue({ status: "recorded" }); mock.db.mockReturnValue({ rpc: mock.rpc }); });
it.each(["off", "on", "inherit"])("reads native business %s from its durable control without tenant cutover or Redis", async state => {
  mock.rpc.mockResolvedValue({ data: state, error: null });
  expect(await getClientEmailOverride(workspace)).toBe(state === "off" ? "off" : "inherit");
  expect(mock.read).not.toHaveBeenCalled(); expect(mock.redis).not.toHaveBeenCalled();
});
it.each([null, "unexpected", { state: "on" }])("holds malformed or unavailable native business policy", async data => {
  mock.rpc.mockResolvedValue({ data, error: null }); expect(await getClientEmailOverride(workspace)).toBe("off");
});
it("holds failed native policy reads, even if the caller requests a display fallback", async () => {
  mock.db.mockReturnValue(null); expect(await getClientEmailOverride(workspace, { failClosed: false })).toBe("off");
  mock.db.mockReturnValue({ rpc: mock.rpc }); mock.rpc.mockRejectedValue(new Error("unavailable")); expect(await getClientEmailOverride(workspace)).toBe("off");
});
it("requires a confirmed authoritative save after Postgres cutover", async () => {
  mock.source.mockResolvedValue("postgres"); mock.mirror.mockResolvedValue({ status: "failed", reason: "unavailable" });
  await expect(setClientEmailOverride("fixture", "off")).rejects.toThrow("authoritative store"); expect(mock.set).not.toHaveBeenCalled();
});
it("saves exclusion to Postgres before cache refresh and preserves it through a cache failure", async () => {
  mock.source.mockResolvedValue("postgres"); mock.set.mockRejectedValue(new Error("cache unavailable"));
  expect(await setClientEmailOverride("fixture", "off")).toBe("off");
  expect(mock.mirror.mock.invocationCallOrder[0]!).toBeLessThan(mock.set.mock.invocationCallOrder[0]!);
});
it("never reports a saved Redis exclusion when Redis is missing", async () => {
  mock.redis.mockReturnValue(null); await expect(setClientEmailOverride("fixture", "off")).rejects.toThrow("Nothing was saved");
});
it("holds an unreadable qualified policy instead of inheriting global-on", async () => {
  mock.read.mockRejectedValue(new Error("qualified Postgres read unavailable")); expect(await getClientEmailOverride("fixture")).toBe("off");
});
