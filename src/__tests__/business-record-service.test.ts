import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BusinessRecordConflictError,
  BusinessRecordValidationError,
  convertTenantToBusiness,
  patchBusinessRecord,
  readBusinessRecord,
  resolveOwnerRecipient,
  setBusinessRecordDb,
  undoBusinessRecordRevision,
  upsertBusinessContacts,
} from "@/platform/business-record";
import { planTenantImport } from "@/platform/business-record/tenant-import";
import { WorkspaceAccessError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const actor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "Owner@Example.com " };
const workspace = "22222222-2222-4222-8222-222222222222";
const command = "33333333-3333-4333-8333-333333333333";
const writeResult = { workspaceId: workspace, sequence: 2, revision: 2, changeCount: 1, undoOf: null, contacts: { created: 0, merged: 0, unchanged: 0 }, replayed: false };

function db(data: unknown, error: { message?: string; code?: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  setBusinessRecordDb({ rpc });
  return rpc;
}

afterEach(() => setBusinessRecordDb(null));

describe("business record service", () => {
  it("sends a normalized actor, the expected revision and a digest bound to the change", async () => {
    const rpc = db(writeResult);
    await patchBusinessRecord(actor, workspace, 1, { facts: { phone: { value: "716-555-0100" } } }, { source: "owner", commandId: command });
    const [name, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe("patch_business_record");
    expect(args).toMatchObject({ p_workspace_id: workspace, p_user_id: actor.userId, p_verified_email: "owner@example.com", p_source: "owner", p_expected_revision: 1, p_command_id: command });
    expect(args.p_command_digest).toMatch(/^[0-9a-f]{64}$/);

    await patchBusinessRecord(actor, workspace, 1, { facts: { phone: { value: "716-555-0100" } } }, { source: "owner", commandId: command });
    await patchBusinessRecord(actor, workspace, 1, { facts: { phone: { value: "716-555-0101" } } }, { source: "owner", commandId: command });
    const digests = rpc.mock.calls.map((call) => (call as unknown as [string, Record<string, unknown>])[1].p_command_digest);
    expect(digests[1]).toBe(digests[0]);
    expect(digests[2]).not.toBe(digests[0]);
  });

  it("refuses invalid changes before reaching the database", async () => {
    const rpc = db(writeResult);
    await expect(patchBusinessRecord(actor, workspace, 0, { facts: { phone: { value: "12" } } }, { source: "owner" })).rejects.toThrow();
    await expect(patchBusinessRecord(actor, workspace, 0, { facts: { phone: { value: "716-555-0100" } } }, { source: "tenant_import" })).rejects.toThrow();
    await expect(patchBusinessRecord(actor, workspace, 0, { facts: { phone: { value: "716-555-0100", verified: true } } }, { source: "bookings" }))
      .rejects.toBeInstanceOf(BusinessRecordValidationError);
    await expect(upsertBusinessContacts(actor, workspace, [{ name: "No details", source: "inquiry" }], { source: "inquiries" })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps database refusals to access, conflict and validation errors", async () => {
    db(null, { message: "business_record_access_denied" });
    await expect(readBusinessRecord(actor, workspace)).rejects.toBeInstanceOf(WorkspaceAccessError);
    db(null, { message: "business_record_revision_conflict" });
    await expect(patchBusinessRecord(actor, workspace, 0, { facts: { phone: null } }, { source: "owner" }))
      .rejects.toMatchObject({ name: "BusinessRecordConflictError", code: "business_record_revision_conflict" });
    db(null, { message: "business_record_undo_conflict" });
    await expect(undoBusinessRecordRevision(actor, workspace, 3, { source: "owner" })).rejects.toBeInstanceOf(BusinessRecordConflictError);
    db(null, { message: "workspace_exit_future_work_blocked" });
    await expect(upsertBusinessContacts(actor, workspace, [{ email: "a@example.com", source: "inquiry" }], { source: "inquiries" }))
      .rejects.toBeInstanceOf(BusinessRecordConflictError);
    db(null, { message: "business_record_patch_invalid" });
    await expect(patchBusinessRecord(actor, workspace, 0, { facts: { phone: null } }, { source: "owner" })).rejects.toBeInstanceOf(BusinessRecordValidationError);
    db(null, { message: "connection reset" });
    await expect(readBusinessRecord(actor, workspace)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });

  it("rejects a malformed response instead of trusting it", async () => {
    db({ workspaceId: workspace, revision: "one" });
    await expect(readBusinessRecord(actor, workspace)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });

  it("parses a record and an owner recipient", async () => {
    db({
      workspaceId: workspace, access: "member", revision: 1, lastSequence: 3, updatedAt: "2026-10-02T12:00:00Z",
      facts: { phone: { value: "716-555-0100", source: "tenant_import", verified: false, updatedAt: "2026-10-02T12:00:00Z", updatedBy: actor.userId } },
      services: [], people: [], contactCount: 4,
    });
    await expect(readBusinessRecord(actor, workspace)).resolves.toMatchObject({ revision: 1, contactCount: 4 });
    db({ email: "owner@example.com", name: null, from: "tenant_fallback", source: null, verified: false, tenantId: "gldf" });
    await expect(resolveOwnerRecipient(workspace)).resolves.toMatchObject({ from: "tenant_fallback" });
    db(null);
    await expect(resolveOwnerRecipient(workspace)).resolves.toBeNull();
  });

  it("refuses a conversion whose digest does not match its payload", async () => {
    const rpc = db({});
    const plan = planTenantImport(JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/business-record-tenant-source.json"), "utf8")));
    await expect(convertTenantToBusiness("operator@example.com", plan.payload, { commandId: plan.commandId, digest: "0".repeat(64) }))
      .rejects.toBeInstanceOf(BusinessRecordValidationError);
    expect(rpc).not.toHaveBeenCalled();
  });
});
