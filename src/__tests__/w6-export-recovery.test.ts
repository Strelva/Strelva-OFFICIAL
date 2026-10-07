import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueExportRecovery, runExportRecovery } from "@/platform/workspace-exports/recovery";
import type { WorkspaceExportSnapshot } from "@/platform/workspace-exports/contracts";
vi.mock("@/platform/infra/crypto/secrets", () => ({ encryptSecret: (v: string) => `enc:v1:${v}`, decryptSecret: (v: string) => v.replace("enc:v1:", "") }));
const job = { buildId: "11111111-1111-4111-8111-111111111111", workspaceId: "22222222-2222-4222-8222-222222222222", userId: "33333333-3333-4333-8333-333333333333", verifiedEmail: "operator@example.test", deliverTo: "owner@example.test", leaseToken: "44444444-4444-4444-8444-444444444444", stage: "build", tokenCiphertext: null, tenantIds: [], manifest: null };
beforeEach(() => { vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_EXPORT_SCHEMA_3", "1"); vi.stubEnv("STRELVA_EXPORT_RECOVERY", "1"); });
function deps(stage = "build") {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "claim_workspace_export_recovery") return { data: { ...job, stage, tokenCiphertext: stage === "delivery" ? "enc:v1:download-token" : null, manifest: { included: [], omitted: [], unavailable: [] } }, error: null };
    if (name === "workspace_export_v3_role") return { data: "operator", error: null };
    if (name === "export_workspace_v3_category") return { data: { items: args.p_category === "linked_sites" ? [{ tenantId: "client-a" }] : [], next: null }, error: null };
    return { data: {}, error: null };
  });
  return { rpc, snapshot: vi.fn(async () => ({ schemaVersion: 2 } as WorkspaceExportSnapshot)), deliver: vi.fn(async () => "accepted" as const), onFailure: vi.fn() };
}
describe("durable export recovery", () => {
  it("does no IO when recovery is off", async () => {
    vi.stubEnv("STRELVA_EXPORT_RECOVERY", "0"); const input = deps();
    expect(await runExportRecovery(input)).toEqual({ processed: 0, failed: 0, delivered: false }); expect(input.rpc).not.toHaveBeenCalled();
  });
  it("writes behind the claim lease and persists encrypted delivery data before sending", async () => {
    const input = deps(); expect(await runExportRecovery(input)).toEqual({ processed: 1, failed: 0, delivered: true });
    expect(input.deliver).toHaveBeenCalledWith(expect.objectContaining({ deliverTo: "owner@example.test", tenantIds: ["client-a"] }));
    expect(input.rpc).toHaveBeenCalledWith("write_workspace_export_recovery", expect.objectContaining({ p_lease_token: job.leaseToken, p_operation: "complete_workspace_export_build", p_args: expect.objectContaining({ tokenCiphertext: expect.stringMatching(/^enc:v1:/), tenantIds: ["client-a"] }) }));
    expect(input.rpc).toHaveBeenCalledWith("write_workspace_export_recovery", expect.objectContaining({ p_operation: "delivered" }));
  });
  it("retries a failed email from the completed archive without collecting again", async () => {
    const input = deps("delivery"); input.deliver.mockRejectedValue(new Error("provider unavailable"));
    expect(await runExportRecovery(input)).toEqual({ processed: 1, failed: 1, delivered: false }); expect(input.snapshot).not.toHaveBeenCalled();
    expect(input.rpc).toHaveBeenCalledWith("write_workspace_export_recovery", expect.objectContaining({ p_operation: "delivery_failed" }));
    expect(input.onFailure).toHaveBeenCalledWith(job.buildId, "export_link_delivery_failed");
  });
  it("does not send a partial archive after collection fails", async () => {
    const input = deps(); input.snapshot.mockRejectedValue(new Error("record reader unavailable"));
    expect((await runExportRecovery(input)).failed).toBe(1); expect(input.deliver).not.toHaveBeenCalled();
    expect(input.rpc).toHaveBeenCalledWith("write_workspace_export_recovery", expect.objectContaining({ p_operation: "fail_workspace_export_build" }));
  });
  it("does not send or complete after losing the lease", async () => {
    const input = deps(); const original = input.rpc.getMockImplementation()!;
    input.rpc.mockImplementation(async (name, args) => name === "write_workspace_export_recovery" ? { data: null, error: { message: "workspace_export_lease_lost" } } as never : original(name, args));
    expect((await runExportRecovery(input)).failed).toBe(1); expect(input.deliver).not.toHaveBeenCalled();
  });
  it("reports revoked enqueue authority without accepting work", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "workspace_export_denied" } }));
    await expect(enqueueExportRecovery({ userId: job.userId, verifiedEmail: job.verifiedEmail }, job.workspaceId, rpc)).rejects.toMatchObject({ code: "denied" });
  });
});
