import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWebsiteContentRestoreService } from "@/products/websites/history-restore";

const actor = { userId: "76000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const workspaceId = "76000000-0000-4000-8000-000000000002";
const systemId = "76000000-0000-4000-8000-000000000003";
const input = { workspaceId, systemId, section: "hero", versionId: "saved-hero" };
const ports = {
  released: vi.fn(), workspaces: vi.fn(), systems: vi.fn(), operator: vi.fn(), tenant: vi.fn(),
  template: vi.fn(), capabilities: vi.fn(), canWrite: vi.fn(), subscribed: vi.fn(), versions: vi.fn(), apply: vi.fn(),
};
const restore = createWebsiteContentRestoreService(ports);
beforeEach(() => {
  vi.clearAllMocks();
  ports.released.mockResolvedValue(true);
  ports.workspaces.mockResolvedValue([{ id: workspaceId, kind: "customer", access: "member", role: "owner" }]);
  ports.systems.mockResolvedValue({ systems: [{ system: { id: systemId, kind: "website" }, references: { tenantId: "gldf" } }] });
  ports.operator.mockResolvedValue(false); ports.canWrite.mockResolvedValue(true); ports.subscribed.mockResolvedValue(true);
  ports.tenant.mockResolvedValue({ id: "gldf", active: true, deliveryModel: "custom_repo" });
  ports.template.mockResolvedValue({ contentSections: ["hero"] }); ports.capabilities.mockResolvedValue({ fixture: "manifest" });
  ports.versions.mockResolvedValue([{ id: input.versionId, data: { headline: "Earlier reviewed headline" } }]);
  ports.apply.mockResolvedValue({ status: "queued", section: "hero", eventId: "review-event" });
});

describe("website History restore authority and review", () => {
  it("flags off reads no content and queues no change", async () => {
    ports.released.mockResolvedValue(false);
    await expect(restore(actor, input)).rejects.toThrow("not enabled");
    expect(ports.workspaces).not.toHaveBeenCalled();expect(ports.versions).not.toHaveBeenCalled();expect(ports.apply).not.toHaveBeenCalled();
  });
  it("prepares the selected historical content through the shared forced-review path", async () => {
    expect(await restore(actor, input)).toMatchObject({ status: "queued", eventId: "review-event" });
    expect(ports.versions).toHaveBeenCalledWith("hero", "gldf");
    expect(ports.apply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tenantId: "gldf", section: "hero", data: { headline: "Earlier reviewed headline" }, forceReview: true, siteManifest: { fixture: "manifest" } }));
  });
  it.each(["member", "admin"])("refuses a %s who is not a Strelva operator", async role => {
    ports.workspaces.mockResolvedValue([{ id: workspaceId, kind: "customer", access: "member", role }]);
    await expect(restore(actor, input)).rejects.toThrow("Only the owner");expect(ports.systems).not.toHaveBeenCalled();expect(ports.apply).not.toHaveBeenCalled();
  });
  it("allows a currently authorized Strelva admin, still under the tenant's own gates", async () => {
    ports.workspaces.mockResolvedValue([{ id: workspaceId, kind: "customer", access: "member", role: "admin" }]);ports.operator.mockResolvedValue(true);
    await restore(actor, input);expect(ports.canWrite).toHaveBeenCalledWith("gldf");expect(ports.subscribed).toHaveBeenCalledWith("gldf");
    ports.canWrite.mockResolvedValue(false);ports.apply.mockClear();await expect(restore(actor, input)).rejects.toThrow("Workspace access denied");expect(ports.apply).not.toHaveBeenCalled();
  });
  it("does not accept another business's System, a guessed version, or an undeclared section", async () => {
    await expect(restore(actor, { ...input, systemId: workspaceId })).rejects.toThrow("Workspace access denied");
    await expect(restore(actor, { ...input, versionId: "another-tenant-version" })).rejects.toThrow("unavailable");
    await expect(restore(actor, { ...input, section: "settings" })).rejects.toThrow("not editable");expect(ports.apply).not.toHaveBeenCalled();
  });
  it("refuses repo-only, inactive and unsubscribed sites", async () => {
    ports.tenant.mockResolvedValue({ id: "mclears", active: true, deliveryModel: "custom_repo" });
    await expect(restore(actor, input)).rejects.toThrow("Requests");
    ports.tenant.mockResolvedValue({ id: "gldf", active: false, deliveryModel: "custom_repo" });await expect(restore(actor, input)).rejects.toThrow("Requests");
    ports.subscribed.mockResolvedValue(false);await expect(restore(actor, input)).rejects.toThrow("service is not active");expect(ports.apply).not.toHaveBeenCalled();
  });
  it("never retries a queue write after an unconfirmed result", async () => {
    ports.apply.mockRejectedValue(new Error("review event accepted; response lost"));
    await expect(restore(actor, input)).rejects.toThrow("response lost");expect(ports.apply).toHaveBeenCalledOnce();
  });
});
