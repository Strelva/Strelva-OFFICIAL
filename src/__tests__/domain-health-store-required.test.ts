import { beforeEach, describe, expect, it, vi } from "vitest";
const ports = vi.hoisted(() => ({ redis: vi.fn(), set: vi.fn(), get: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: ports.redis }));
import { saveDomainHealth } from "@/lib/domain-monitor-store";
import * as legacy from "@/lib/domain-monitor-store";
import * as shared from "@/platform/infra/domain-health";
beforeEach(() => { vi.clearAllMocks(); ports.redis.mockReturnValue({ set: ports.set, get: ports.get }); ports.set.mockResolvedValue("OK"); });
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
  it("shares the same persisted evidence and dedup signature across legacy and workspace callers", async () => {
    expect(legacy.saveDomainHealth).toBe(shared.saveDomainHealth);
    expect(legacy.getDomainHealth).toBe(shared.getDomainHealth);
    expect(legacy.setAlertSignature).toBe(shared.setAlertSignature);
    expect(legacy.getAlertSignature).toBe(shared.getAlertSignature);

    await shared.saveDomainHealth([], { requireStore: true });
    const snapshot = ports.set.mock.calls[0]?.[1];
    expect(ports.set).toHaveBeenCalledWith("reb:domain-monitor:latest", snapshot, { ex: 2_592_000 });
    expect(snapshot).toEqual({ scannedAt: expect.any(String), results: [] });
    ports.get.mockResolvedValueOnce(snapshot);
    await expect(legacy.getDomainHealth()).resolves.toBe(snapshot);
    expect(ports.get).toHaveBeenLastCalledWith("reb:domain-monitor:latest");

    await legacy.setAlertSignature("same-outage");
    expect(ports.set).toHaveBeenLastCalledWith("reb:domain-monitor:alert-sig", "same-outage", { ex: 2_592_000 });
    ports.get.mockResolvedValueOnce("same-outage");
    await expect(shared.getAlertSignature()).resolves.toBe("same-outage");
    expect(ports.get).toHaveBeenLastCalledWith("reb:domain-monitor:alert-sig");
  });
});
