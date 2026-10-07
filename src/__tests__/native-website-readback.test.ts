import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ flag: vi.fn(), viewer: vi.fn(), tenant: vi.fn(), read: vi.fn(), audit: vi.fn(), event: vi.fn() }));
vi.mock("@/platform/release-flags/store", () => ({ tenantReleaseFlagEnabled: f.flag }));
vi.mock("@/platform/release-flags/viewer", () => ({ currentReleaseViewer: f.viewer }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: f.tenant }));
vi.mock("@/products/websites/index", () => ({ readPublishedWebsiteContent: f.read }));
vi.mock("@/lib/storage", () => ({ logAuditEvent: f.audit }));
vi.mock("@/lib/events", () => ({ addEvent: f.event }));
import { observeAcceptedNativePublish } from "@/app/api/publish/native-readback";

const input = () => ({ tenantId: "gldf", section: "hero", expected: { title: "New title" }, actorId: "ai", publicationRef: "accepted-1", revalidation: Promise.resolve({ success: true }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "1");
  vi.stubEnv("STRELVA_MAKE_REAL_LIVE", "1");
  f.flag.mockResolvedValue(true);
  f.viewer.mockResolvedValue({ operator: false, tester: false });
  f.tenant.mockResolvedValue({ productionDomain: "trusted-client.example", siteUrl: "https://fallback.example" });
  f.read.mockResolvedValue({ ok: true, status: "verified", checkedAt: "2026-10-07T12:00:00Z", detail: "Public text matches" });
});
afterEach(() => vi.unstubAllEnvs());

describe("accepted native publication public read-back", () => {
  for (const name of ["STRELVA_WORKSPACE_RELEASE", "STRELVA_SYSTEMS_RELEASE", "STRELVA_MAKE_REAL_LIVE"]) {
    it(`does no flag, tenant, HTTP, receipt or event work with ${name} off`, async () => {
      vi.stubEnv(name, "0");
      await observeAcceptedNativePublish({ ...input(), revalidation: new Promise(() => {}) });
      for (const mock of Object.values(f)) expect(mock).not.toHaveBeenCalled();
    });
  }

  it("does no observation for a tenant whose rollout row is off", async () => {
    f.flag.mockResolvedValue(false);
    await observeAcceptedNativePublish(input());
    expect(f.tenant).not.toHaveBeenCalled();
    expect(f.read).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
    expect(f.event).not.toHaveBeenCalled();
  });

  it("waits for revalidation, then checks both tenant flags again before public HTTP", async () => {
    let finish!: () => void;
    const revalidation = new Promise<void>(resolve => { finish = resolve; });
    const work = observeAcceptedNativePublish({ ...input(), revalidation });
    await vi.waitFor(() => expect(f.flag).toHaveBeenCalledTimes(2));
    expect(f.read).not.toHaveBeenCalled();
    finish();
    await work;
    expect(f.flag).toHaveBeenCalledTimes(4);
    expect(f.tenant).toHaveBeenCalledWith("gldf");
    expect(f.read).toHaveBeenCalledWith({ tenant: { productionDomain: "trusted-client.example", siteUrl: "https://fallback.example" }, section: "hero", expected: { title: "New title" } });
    expect(f.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "content.public_read_back", metadata: expect.objectContaining({ ok: true, publicationAccepted: true }) }));
    expect(f.event).not.toHaveBeenCalled();
  });

  it("stops if the tenant's release changes while revalidation is in flight", async () => {
    let finish!: () => void;
    const work = observeAcceptedNativePublish({ ...input(), revalidation: new Promise<void>(resolve => { finish = resolve; }) });
    await vi.waitFor(() => expect(f.flag).toHaveBeenCalledTimes(2));
    f.flag.mockResolvedValue(false);
    finish();
    await work;
    expect(f.read).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
    expect(f.event).not.toHaveBeenCalled();
  });

  it("records failed observation separately for operators without throwing or publishing", async () => {
    f.read.mockRejectedValue(new Error("HTTP unavailable"));
    await expect(observeAcceptedNativePublish(input())).resolves.toBeUndefined();
    expect(f.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ ok: false, publicationAccepted: true }) }));
    expect(f.event).toHaveBeenCalledWith(expect.objectContaining({ type: "change_verify_failed", status: "pending", metadata: expect.objectContaining({ reviewAudience: "operator", publicationRef: "accepted-1", publicationAccepted: true }) }));
    expect(f.read).toHaveBeenCalledTimes(1);
  });

  it("keeps acceptance even if audit and operator-event stores are unavailable", async () => {
    f.read.mockResolvedValue({ ok: false, detail: "Public copy differs" });
    f.audit.mockRejectedValue(new Error("Audit unavailable"));
    f.event.mockRejectedValue(new Error("Events unavailable"));
    await expect(observeAcceptedNativePublish(input())).resolves.toBeUndefined();
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(f.event).toHaveBeenCalledTimes(1);
  });
});
