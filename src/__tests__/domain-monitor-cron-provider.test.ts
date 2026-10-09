import { beforeEach, describe, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({ scan: vi.fn(), save: vi.fn(), signature: vi.fn(), setSignature: vi.fn(), send: vi.fn(), heartbeat: vi.fn() }));
vi.mock("@/lib/domain-monitor", () => ({ scanPortfolioDomains: deps.scan, summarizeDomainAlerts: () => ({ down: [{ siteName: "Fixture", host: "fixture.example.test", problem: "down" }], expiring: [], signature: "down" }) }));
vi.mock("@/lib/domain-monitor-store", () => ({ saveDomainHealth: deps.save, getAlertSignature: deps.signature, setAlertSignature: deps.setSignature }));
vi.mock("@/products/domain-monitor/server", () => ({ sendDomainAlertEmail: deps.send }));
vi.mock("@/platform/infra/heartbeat", () => ({ recordHeartbeat: deps.heartbeat }));
import { GET } from "@/app/api/cron/domain-monitor/route";
function request() { return new Request("https://fixture.example.test/api/cron/domain-monitor", { headers: { authorization: "Bearer fixture-cron-secret" } }); }
beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.stubEnv("CRON_SECRET", "fixture-cron-secret"); vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "1"); deps.scan.mockResolvedValue([{}]); deps.save.mockResolvedValue(undefined); deps.signature.mockResolvedValue(""); });
describe("provider domain alerts", () => {
  it("requires saved evidence and retains current delivery until provider queue promotion", async () => {
    const response = await GET(request()); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ scanned: 1, down: 1 });
    expect(deps.save).toHaveBeenCalledWith([{}], { requireStore: true }); expect(deps.send).toHaveBeenCalledOnce(); expect(deps.signature).toHaveBeenCalledOnce();
  });
  it("reports storage failure instead of claiming the provider was alerted", async () => {
    deps.save.mockRejectedValue(Error("Redis unavailable")); expect((await GET(request())).status).toBe(500);
    expect(deps.send).not.toHaveBeenCalled(); expect(deps.heartbeat).toHaveBeenCalledWith("domain-monitor", expect.objectContaining({ ok: false }));
  });
  it("preserves legacy delivery with the release off", async () => {
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "0"); expect((await GET(request())).status).toBe(200);
    expect(deps.send).toHaveBeenCalledOnce(); expect(deps.setSignature).toHaveBeenCalledWith("down");
  });
  it("authenticates before portfolio reads", async () => {
    expect((await GET(new Request("https://fixture.example.test/api/cron/domain-monitor"))).status).toBe(401); expect(deps.scan).not.toHaveBeenCalled();
  });
});
