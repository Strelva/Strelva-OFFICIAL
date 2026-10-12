import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ rpc: vi.fn(), released: true }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: boundary.rpc }) }));
vi.mock("@/platform/release-flags/store", () => ({ workspaceReleaseFlagEnabled: async () => boundary.released }));
vi.mock("@/platform/release-flags/viewer", () => ({ releaseViewerFor: async () => ({ operator: false, tester: false }) }));
import { createApplicationAccessService, postgresApplicationUsePersistence, type ApplicationUseContext, type ApplicationUsePersistence } from "@/products/applications/access";
const workId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const grantId = "33333333-3333-4333-8333-333333333333";
const actor = { userId: "44444444-4444-4444-8444-444444444444", verifiedEmail: "staff@example.test" };
const contactId = "55555555-5555-4555-8555-555555555555";
const personId = "66666666-6666-4666-8666-666666666666";
const otherId = "77777777-7777-4777-8777-777777777777";
const now = () => new Date("2026-10-07T12:00:00Z");
const context = (): ApplicationUseContext => ({ workId, workspaceId, title: "Intake", releaseVersion: 1,
  releasedSpec: { title: "Intake", maintenanceOwner: actor.userId,
    fields: [{ id: "client", label: "Client", type: "contact", required: true }, { id: "handler", label: "Staff", type: "assigned_person", required: false },
      { id: "private", label: "Private contact", type: "contact", required: false }],
    components: [{ kind: "form", fields: ["client", "handler"] }, { kind: "list", fields: ["client", "handler"] }, { kind: "detail", fields: ["private"] }] },
  records: [{ id: "mine", values: { client: contactId, handler: personId, private: otherId }, createdBy: actor.userId, revision: 1 },
    { id: "other", values: { client: otherId }, createdBy: otherId, revision: 1 }],
  grant: { id: grantId, workId, workspaceId, recipientEmail: actor.verifiedEmail, views: ["form", "list"], recordRead: "own", recordEdit: "own", recordSubmit: true,
    purpose: "Intake", expiresAt: "2027-01-01T00:00:00Z", status: "active", grantedBy: actor.userId, createdAt: "2026-10-01T00:00:00Z" } });
const labels = () => ({ workId, workspaceId, grantId, releaseVersion: 1, labels: [
  { recordId: "mine", fieldId: "client", linkId: contactId, label: "Acme · client@example.test" },
  { recordId: "mine", fieldId: "handler", linkId: personId, label: "Sam Rivera · sam@example.test" },
] });
const row = () => ({ ...context(), work_id: workId, workspace_id: workspaceId, release_version: 1, released_spec: context().releasedSpec });
beforeEach(() => { boundary.released = true; boundary.rpc.mockReset();
  boundary.rpc.mockImplementation(async (name: string) => ({ data: name === "read_internal_tool_use_link_labels" ? labels() : [row()], error: null }));
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "1"); });
afterEach(() => vi.unstubAllEnvs());
describe("authorized linked record labels", () => {
  it("returns names and email separately from the stored IDs", async () => {
    const result = await createApplicationAccessService(postgresApplicationUsePersistence, now).inspect(actor, workId);
    expect(result.records).toEqual([{ id: "mine", values: { client: contactId, handler: personId }, revision: 1,
      linkLabels: { client: "Acme · client@example.test", handler: "Sam Rivera · sam@example.test" } }]);
    expect(boundary.rpc.mock.calls.map(call => call[0])).toEqual(["read_application_use_v2", "read_internal_tool_use_link_labels"]);
    expect(boundary.rpc.mock.calls[1]![1]).toEqual({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
      p_work_id: workId, p_grant_id: grantId, p_release_version: 1 });
  });
  it.each(["global", "workspace"])("keeps the %s flag-off read unchanged", async scope => {
    if (scope === "global") vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "0"); else boundary.released = false;
    const result = await createApplicationAccessService(postgresApplicationUsePersistence, now).inspect(actor, workId);
    expect(result.records[0]).not.toHaveProperty("linkLabels");
    expect(boundary.rpc.mock.calls.map(call => call[0])).toEqual(["read_application_use_v2"]);
  });
  it("fails closed if the grant is revoked during label lookup", async () => {
    boundary.rpc.mockImplementation(async (name: string) => name === "read_internal_tool_use_link_labels"
      ? { data: null, error: { message: "application_use_denied" } } : { data: [row()], error: null });
    await expect(createApplicationAccessService(postgresApplicationUsePersistence, now).inspect(actor, workId)).rejects.toThrow("no longer available");
  });
  it("does not publish labels for hidden fields, another submitter or a stale ID", async () => {
    const current = context();
    current.linkLabels = [...labels().labels,
      { recordId: "mine", fieldId: "private", linkId: otherId, label: "Hidden contact" },
      { recordId: "other", fieldId: "client", linkId: otherId, label: "Other person's client" },
      { recordId: "mine", fieldId: "client", linkId: otherId, label: "Old client" }];
    const persistence: ApplicationUsePersistence = { ...postgresApplicationUsePersistence, inspect: async () => current };
    const result = await createApplicationAccessService(persistence, now).inspect(actor, workId);
    expect(JSON.stringify(result)).not.toMatch(/Hidden contact|Other person's client|Old client|private/);
    expect(result.records[0]?.linkLabels?.client).toBe("Acme · client@example.test");
  });
  it("rejects label data bound to another workspace", async () => {
    boundary.rpc.mockImplementation(async (name: string) => ({ data: name === "read_internal_tool_use_link_labels" ? { ...labels(), workspaceId: otherId } : [row()], error: null }));
    await expect(createApplicationAccessService(postgresApplicationUsePersistence, now).inspect(actor, workId)).rejects.toThrow("linked record details are unavailable");
  });
  it.each(["submit", "edit"])("includes current labels in the %s result", async operation => {
    boundary.rpc.mockImplementation(async (name: string) => ({ data: name === "read_internal_tool_use_link_labels" ? labels()
      : name === "claim_internal_tool_submit_notice" ? null : [row()], error: null }));
    const input = { releaseVersion: 1, expectedRecordRevision: 1, idempotencyKey: "label-correction",
      record: { id: "mine", values: { client: contactId, handler: personId } } };
    const current = context();
    const saved = operation === "submit" ? await postgresApplicationUsePersistence.submit(actor, workId, input, current.grant)
      : await postgresApplicationUsePersistence.edit!(actor, workId, input, current.grant);
    expect(saved.linkLabels).toEqual(labels().labels);
    const calls = boundary.rpc.mock.calls.map(call => call[0]);
    expect(calls).toContain(operation === "submit" ? "submit_internal_tool_use_record" : "edit_internal_tool_use_record");
    expect(calls.at(-1)).toBe("read_internal_tool_use_link_labels");
  });
});
