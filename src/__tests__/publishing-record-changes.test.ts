import { describe, expect, it, vi } from "vitest";
import { changeRecordWithGoogle, recordGoogleApprovalCopy, type RecordChangeDeps } from "@/products/publishing/record-changes";
import type { BusinessRecord } from "@/platform/business-record/contracts";
const actor = { userId: "7f000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const workspaceId = "7f000000-0000-4000-8000-000000000010";
const commandId = "7f000000-0000-4000-8000-000000000099";
const record: BusinessRecord = { workspaceId, access: "owner", revision: 1, lastSequence: 1, updatedAt: null, facts: {}, services: [], people: [], contactCount: 0 };
const saved = { workspaceId, sequence: 2, revision: 2, changeCount: 1, undoOf: null, contacts: { created: 0, merged: 0, unchanged: 0 }, replayed: false };
function deps(): RecordChangeDeps {
  return { read: vi.fn(async () => record), patch: vi.fn(async () => saved), publishing: vi.fn(async () => true), policy: vi.fn(async () => false), locations: vi.fn(async () => [{ tenantId: "mooney", locationId: "first" }, { tenantId: "mooney", locationId: "second" }]), prepare: vi.fn(async () => ({ id: "draft" })), approve: vi.fn(async () => ({ changed: true })) };
}
const patch = { facts: { phone: { value: "716-555-0100" } } };
describe("record changes and Google policy", () => {
  it("flags off calls the original record writer without reading listings or changing Google", async () => {
    const d = deps(); d.publishing = vi.fn(async () => false);
    expect(await changeRecordWithGoogle(actor, workspaceId, 1, patch, { source: "owner", commandId }, d)).toEqual({ record: saved, google: [] });
    expect(d.patch).toHaveBeenCalledWith(actor, workspaceId, 1, patch, { source: "owner", commandId });
    expect(d.read).not.toHaveBeenCalled(); expect(d.policy).not.toHaveBeenCalled(); expect(d.locations).not.toHaveBeenCalled();
  });
  it("default policy creates separate approvals per location and never writes", async () => {
    const d = deps(); const result = await changeRecordWithGoogle(actor, workspaceId, 1, patch, { source: "owner", commandId }, d);
    expect(result.google.map(effect => effect.status)).toEqual(["needs_approval", "needs_approval"]);
    expect(d.prepare).toHaveBeenCalledWith(actor, { workspaceId, tenantId: "mooney", locationId: "second", kind: "info", commandId });
    expect(d.approve).not.toHaveBeenCalled();
  });
  it("activated policy approves the exact drafts and retains the saved record after partial Google failure", async () => {
    const d = deps(); d.policy = vi.fn(async () => true); d.approve = vi.fn().mockResolvedValueOnce({ changed: true }).mockResolvedValueOnce({ changed: false, reason: "Google access pending" });
    const result = await changeRecordWithGoogle(actor, workspaceId, 1, patch, { source: "owner", commandId }, d);
    expect(result.record).toEqual(saved); expect(result.google.map(effect => effect.status)).toEqual(["posted", "failed"]);
    expect(d.approve).toHaveBeenCalledWith("mooney", "draft", actor.userId);
  });
  it("never treats an operator record edit as owner approval", async () => {
    const d = deps(); d.policy = vi.fn(async () => true);
    const result = await changeRecordWithGoogle(actor, workspaceId, 1, patch, { source: "operator", commandId }, d);
    expect(result.google.every(effect => effect.status === "needs_approval")).toBe(true);
    expect(d.policy).not.toHaveBeenCalled(); expect(d.approve).not.toHaveBeenCalled();
  });
  it("does not claim failed listing discovery rolled the record back", async () => {
    const d = deps(); d.locations = vi.fn(async () => { throw new Error("storage unavailable"); });
    const result = await changeRecordWithGoogle(actor, workspaceId, 1, patch, { source: "owner", commandId }, d);
    expect(result.record).toEqual(saved); expect(result.propagationError).toContain("record was saved"); expect(d.approve).not.toHaveBeenCalled();
  });
  it("rejects a member before a policy write and names the owner consent effect only when enabled", async () => {
    const d = deps(); d.read = vi.fn(async () => ({ ...record, access: "member" as const }));
    await expect(changeRecordWithGoogle(actor, workspaceId, 1, patch, { source: "owner", commandId }, d)).rejects.toThrow("Only an owner");
    expect(d.patch).not.toHaveBeenCalled(); expect(recordGoogleApprovalCopy(record, false)).toBeNull(); expect(recordGoogleApprovalCopy(record, true)).toContain("also approves");
  });
});
