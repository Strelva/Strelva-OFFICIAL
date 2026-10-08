import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWebsiteContentRestoreService } from "@/app/api/workspace/systems/website/restore/service";

const actor = { userId: "76000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const workspaceId = "76000000-0000-4000-8000-000000000002";
const systemId = "76000000-0000-4000-8000-000000000003";
const workId = "76000000-0000-4000-8000-000000000004";
const hash = "a".repeat(64);
const input = { workspaceId, systemId, section: "hero", versionId: "saved-hero" };
const ports = {
  released: vi.fn(), workspaces: vi.fn(), systems: vi.fn(), operator: vi.fn(), tenant: vi.fn(),
  template: vi.fn(), capabilities: vi.fn(), canWrite: vi.fn(), subscribed: vi.fn(), versions: vi.fn(), apply: vi.fn(),
  snapshots: vi.fn(), rebuildReleased: vi.fn(), document: vi.fn(), rebuild: vi.fn(), undo: vi.fn(), request: vi.fn(), audit: vi.fn(),
};
const restore = createWebsiteContentRestoreService(ports);
beforeEach(() => {
  vi.clearAllMocks();
  ports.released.mockResolvedValue(true);
  ports.workspaces.mockResolvedValue([{ id: workspaceId, kind: "customer", access: "member", role: "owner" }]);
  ports.systems.mockResolvedValue({ systems: [{ system: { id: systemId, kind: "website" }, references: { tenantId: "gldf", tenantStableId: workspaceId, savedWorkId: workId } }] });
  ports.operator.mockResolvedValue(false); ports.canWrite.mockResolvedValue(true); ports.subscribed.mockResolvedValue(true);
  ports.audit.mockReset().mockResolvedValue({});
  ports.tenant.mockResolvedValue({ id: "gldf", active: true, deliveryModel: "custom_repo" });
  ports.template.mockResolvedValue({ contentSections: ["hero"] }); ports.capabilities.mockResolvedValue({ fixture: "manifest" });
  ports.versions.mockResolvedValue([{ id: input.versionId, data: { headline: "Earlier reviewed headline" } }]);
  ports.apply.mockResolvedValue({ status: "queued", section: "hero", eventId: "review-event" });
  ports.snapshots.mockResolvedValue([{ id: "snap_one", tenantId: "gldf", label: "Before changing hours", createdAt: "2026-10-01T12:00:00Z", status: "available" }]);
  ports.request.mockResolvedValue({ id: "restore-request" });
  ports.rebuildReleased.mockResolvedValue(true);
  ports.document.mockResolvedValue({ revision: 1, contentHash: hash });
  ports.rebuild.mockResolvedValue({ workId, workspaceId, rebuild: { revision: 9, candidate: { revision: 3, contentHash: "b".repeat(64) } } });
  ports.undo.mockResolvedValue({ workId, workspaceId, rebuild: { candidate: { revision: 4, previewHref: "/preview-restored-site" }, approvedCandidateRevision: null, status: "review_ready" } });
});

describe("saved copy restore Requests", () => {
  const savedCopy = { workspaceId, systemId, kind: "snapshot", snapshotId: "snap_one" };
  it("files an exact, idempotent Request without touching live content, drafts or the snapshot", async () => {
    const result = await restore(actor, savedCopy);
    expect(result).toMatchObject({ status: "requested", requestId: "restore-request" });
    if (result.status !== "requested") throw new Error("Expected a restore Request");
    expect(result.message).toContain("preview still needs to be prepared and approved");
    expect(ports.request).toHaveBeenCalledWith(actor, expect.objectContaining({
      status: "requested", request: expect.stringContaining("snap_one, saved 2026-10-01T12:00:00Z"),
      context: expect.objectContaining({ systemId, tenantStableId: workspaceId, restoreSnapshotId: "snap_one", restoreSnapshotCreatedAt: "2026-10-01T12:00:00Z" }),
      idempotencyKey: expect.stringMatching(/^restore-snapshot:[a-f0-9]{64}$/),
    }));
    const command = ports.request.mock.calls[0]![1];
    await restore(actor, savedCopy);expect(ports.request.mock.calls[1]![1]).toEqual(command);
    expect(ports.apply).not.toHaveBeenCalled();expect(ports.undo).not.toHaveBeenCalled();
  });
  it("supports repository clients through the same reviewed Request delivery", async () => {
    ports.tenant.mockResolvedValue({ id: "mclears", active: true, deliveryModel: "custom_repo" });
    await restore(actor, savedCopy);
    expect(ports.request).toHaveBeenCalledWith(actor, expect.objectContaining({ context: expect.objectContaining({ implementation: "custom_repo" }) }));
  });
  it.each([
    { id: "snap_other", tenantId: "gldf", status: "available" },
    { id: "snap_one", tenantId: "another-tenant", status: "available" },
    { id: "snap_one", tenantId: "gldf", status: "restored" },
  ])("refuses an unavailable or foreign saved copy", async row => {
    ports.snapshots.mockResolvedValue([row]);await expect(restore(actor, savedCopy)).rejects.toThrow("unavailable");expect(ports.request).not.toHaveBeenCalled();
  });
  it("keeps owner, tenant permission, subscription and release gates ahead of requests", async () => {
    ports.released.mockResolvedValue(false);await expect(restore(actor, savedCopy)).rejects.toThrow("not enabled");expect(ports.snapshots).not.toHaveBeenCalled();
    ports.released.mockResolvedValue(true);ports.canWrite.mockResolvedValue(false);await expect(restore(actor, savedCopy)).rejects.toThrow("access denied");
    ports.canWrite.mockResolvedValue(true);ports.subscribed.mockResolvedValue(false);await expect(restore(actor, savedCopy)).rejects.toThrow("service is not active");expect(ports.request).not.toHaveBeenCalled();
  });
  it("does not automatically repeat an unconfirmed Request write", async () => {
    ports.request.mockRejectedValue(new Error("Request accepted; response lost"));await expect(restore(actor, savedCopy)).rejects.toThrow("response lost");expect(ports.request).toHaveBeenCalledOnce();
  });
});

describe("site document restore from System History", () => {
  const savedRevision = { workspaceId, systemId, kind: "document", workId, targetRevision: 1, targetContentHash: hash };
  it("pins the exact historical revision and current candidate through shared undo", async () => {
    expect(await restore(actor, savedRevision)).toMatchObject({ status: "queued", previewHref: "/preview-restored-site" });
    expect(ports.document).toHaveBeenCalledWith(actor, { workspaceId, workId, revision: 1 });
    expect(ports.undo).toHaveBeenCalledExactlyOnceWith(actor, workId, { expectedRevision: 9, candidateRevision: 3, candidateContentHash: "b".repeat(64), targetRevision: 1 });
    expect(ports.apply).not.toHaveBeenCalled();expect(ports.request).not.toHaveBeenCalled();
  });
  it("refuses another System's work and an altered target hash", async () => {
    await expect(restore(actor, { ...savedRevision, workId: workspaceId })).rejects.toThrow("access denied");expect(ports.document).not.toHaveBeenCalled();
    await expect(restore(actor, { ...savedRevision, targetContentHash: "b".repeat(64) })).rejects.toThrow("unavailable");expect(ports.undo).not.toHaveBeenCalled();
  });
  it("refuses revision restore with its independent gate off", async () => {
    ports.rebuildReleased.mockResolvedValue(false);await expect(restore(actor, savedRevision)).rejects.toThrow("not enabled");expect(ports.document).not.toHaveBeenCalled();expect(ports.undo).not.toHaveBeenCalled();
  });
  it("refuses a current or future revision and changed workspace", async () => {
    ports.rebuild.mockResolvedValue({ workspaceId, rebuild: { candidate: { revision: 1 } } });await expect(restore(actor, savedRevision)).rejects.toThrow("earlier saved");
    ports.rebuild.mockResolvedValue({ workspaceId: systemId, rebuild: { candidate: { revision: 3 } } });await expect(restore(actor, savedRevision)).rejects.toThrow("earlier saved");expect(ports.undo).not.toHaveBeenCalled();
  });
  it("preserves a concurrent change or revoked membership instead of retrying undo", async () => {
    ports.undo.mockRejectedValue(new Error("This website changed. Reload"));await expect(restore(actor, savedRevision)).rejects.toThrow("website changed");expect(ports.undo).toHaveBeenCalledOnce();
  });
});

describe("website History restore authority and review", () => {
  it("records the preparer and selected restore without treating it as owner approval", async () => {
    ports.workspaces.mockResolvedValue([{ id: workspaceId, kind: "customer", access: "member", role: "admin" }]);ports.operator.mockResolvedValue(true);
    await restore(actor, input);
    expect(ports.apply).toHaveBeenCalledWith(expect.objectContaining({ forceReview: true, preparer: { userId: actor.userId, email: actor.verifiedEmail, kind: "operator" } }));
    expect(ports.audit).toHaveBeenNthCalledWith(1, expect.objectContaining({ tenant: "gldf", action: "website.section.restore.prepare", targetId: input.versionId,
      actor: expect.objectContaining({ userId: actor.userId, type: "super_admin" }), metadata: { workspaceId, systemId, section: "hero", phase: "attempt" } }));
    expect(ports.audit.mock.invocationCallOrder[0]).toBeLessThan(ports.apply.mock.invocationCallOrder[0]!);
    expect(ports.audit).toHaveBeenLastCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ phase: "result", status: "queued", eventId: "review-event" }) }));
  });
  it("does not queue a restore when its audit attempt fails", async () => {
    ports.audit.mockRejectedValueOnce(new Error("Audit unavailable"));await expect(restore(actor, input)).rejects.toThrow("Audit unavailable");expect(ports.apply).not.toHaveBeenCalled();
  });
  it("does not repeat or report a queued restore as failed when the result audit is lost", async () => {
    ports.audit.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("Result unavailable"));
    expect(await restore(actor, input)).toMatchObject({ status: "queued" });expect(ports.apply).toHaveBeenCalledOnce();
  });
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
