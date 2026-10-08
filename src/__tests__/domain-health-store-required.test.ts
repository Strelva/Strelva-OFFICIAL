import { beforeEach, describe, expect, it, vi } from "vitest";
const ports = vi.hoisted(() => ({ redis: vi.fn(), set: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: ports.redis }));
import { saveDomainHealth } from "@/lib/domain-monitor-store";
beforeEach(() => { vi.clearAllMocks(); ports.redis.mockReturnValue({ set: ports.set }); ports.set.mockResolvedValue("OK"); });
describe("required provider domain evidence", () => {
  it("rejects missing Redis and failed saves when the provider queue depends on them", async () => {
    ports.redis.mockReturnValue(null); await expect(saveDomainHealth([], { requireStore: true })).rejects.toThrow("unavailable");
    ports.redis.mockReturnValue({ set: ports.set }); ports.set.mockRejectedValue(Error("unreachable"));
    await expect(saveDomainHealth([], { requireStore: true })).rejects.toThrow("could not be saved");
  });
  it("retains flag-off best effort semantics", async () => {
    ports.redis.mockReturnValue(null); await expect(saveDomainHealth([])).resolves.toBeUndefined();
    ports.redis.mockReturnValue({ set: ports.set }); ports.set.mockRejectedValue(Error("unreachable"));
    await expect(saveDomainHealth([])).resolves.toBeUndefined();
  });
});
