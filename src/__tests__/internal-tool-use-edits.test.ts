import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ rpc: vi.fn(), released: true }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: boundary.rpc }) }));
vi.mock("@/platform/release-flags/store", () => ({ workspaceReleaseFlagEnabled: async () => boundary.released }));
vi.mock("@/platform/release-flags/viewer", () => ({ releaseViewerFor: async () => ({ operator: false, tester: false }) }));
import { postgresApplicationUsePersistence, type ApplicationUseGrant } from "@/products/applications/access";
const workId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const actor = { userId: "44444444-4444-4444-8444-444444444444", verifiedEmail: "staff@example.test" };
const grant: ApplicationUseGrant = { id: "33333333-3333-4333-8333-333333333333", workId, workspaceId, recipientEmail: actor.verifiedEmail,
  views: ["form", "list"], recordRead: "own", recordEdit: "own", recordSubmit: false, purpose: "Correct records",
  expiresAt: "2027-01-01T00:00:00Z", status: "active", grantedBy: actor.userId, createdAt: "2026-10-01T00:00:00Z", revokedAt: null };
const spec = { title: "Intake", maintenanceOwner: actor.userId,
  fields: [{ id: "client", label: "Client", type: "contact", required: true }, { id: "handler", label: "Staff", type: "assigned_person", required: false }],
  components: [{ kind: "form", fields: ["client", "handler"] }] };
const row = () => ({ work_id: workId, workspace_id: workspaceId, title: "Intake", release_version: 1, released_spec: spec, records: [], grant });
const input = { releaseVersion: 1, expectedRecordRevision: 2, idempotencyKey: "edit-1", record: { id: "r1", values: { client: "client@example.test", handler: "sam@example.test" } } };
beforeEach(() => { boundary.rpc.mockReset(); boundary.released = true; boundary.rpc.mockResolvedValue({ data: [row()], error: null });
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "1"); });
afterEach(() => vi.unstubAllEnvs());
describe("linked recipient corrections", () => {
  it("uses one atomic linked RPC for an edit-only grant", async () => {
    await postgresApplicationUsePersistence.edit!(actor, workId, input, grant);
    expect(boundary.rpc.mock.calls.map(call => call[0])).toEqual(["read_application_use_v2", "edit_internal_tool_use_record"]);
    expect(boundary.rpc.mock.calls[1]![1]).toEqual({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_work_id: workId, p_grant_id: grant.id,
      p_release_version: 1, p_expected_record_revision: 2, p_record: input.record, p_idempotency_key: "edit-1" });
  });
  it("keeps the legacy edit and performs no extra reads with Systems off", async () => {
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "0");
    await postgresApplicationUsePersistence.edit!(actor, workId, input, grant);
    expect(boundary.rpc.mock.calls.map(call => call[0])).toEqual(["edit_application_use_record"]);
  });
  it("refuses links for a workspace whose release is off before writing", async () => {
    boundary.released = false;
    await expect(postgresApplicationUsePersistence.edit!(actor, workId, input, grant)).rejects.toThrow("Contact and assigned-person fields are not available yet.");
    expect(boundary.rpc.mock.calls.map(call => call[0])).toEqual(["read_application_use_v2"]);
  });
  it("keeps link and staff failures actionable", async () => {
    boundary.rpc.mockImplementation(async (name: string) => name === "read_application_use_v2" ? { data: [row()], error: null }
      : { data: null, error: { message: "application_record_person_unknown" } });
    await expect(postgresApplicationUsePersistence.edit!(actor, workId, input, grant)).rejects.toThrow("That email isn't on this business's staff.");
  });
});
