import { beforeEach, describe, expect, it, vi } from "vitest";
import { VersionAccessError } from "@/platform/system-versions";
import { WorkspaceAccessError, WorkspaceStoreError } from "@/platform/workspaces/types";

const inquiry = vi.hoisted(() => ({ gate: vi.fn(), linked: vi.fn(), portfolio: vi.fn() }));
vi.mock("@/products/inquiries", () => ({ inquiryReleaseMayBeOn: () => true,
  inquiryReleaseEnabledForWorkspace: inquiry.gate, discoverInquiryPortfolio: inquiry.portfolio,
  inquiryReleasedForCurrentUser: vi.fn() }));
vi.mock("@/platform/owner-entry/linked-sites", () => ({ readLinkedSites: inquiry.linked }));

import { readVersionCreationChoices } from "@/experience/workspace/agency/version-server";
import { readAgencyLibrary } from "@/experience/workspace/agency-server";

const agency = "d7100000-0000-4000-8000-000000000002";
const systemId = "d7100000-0000-4000-8000-000000000003";
const foreign = "d7100000-0000-4000-8000-000000000004";
const actor = { userId: "d7100000-0000-4000-8000-000000000001", verifiedEmail: "OWNER@example.test" };
const at = "2026-10-09T12:00:00.000Z";

function revision(number: number) {
  const revisionId = `d7100000-0000-4000-8000-${String(number).padStart(12, "0")}`;
  return { source: { businessId: agency, systemId, revisionId, number }, summary: `Revision ${number}`,
    definition: { kind: "internal_app", title: "Fictional intake", fields: [], components: [] },
    requires: { bindingKinds: [] }, publishedBy: actor.userId, publishedAt: at,
    qualification: { revisionId, status: "qualified", evidence: ["shareable_definition", "declaration_match", "rehearsal", "prior_revision_compare"]
      .map(check => ({ revisionId, check, status: "passed", note: "Fictional passing evidence" })),
    humanReview: { state: "approved", reviewerId: actor.userId, reviewedAt: at, note: "Fictional approval" } } };
}

function database(overrides: Record<string, unknown> = {}) {
  const qualified = revision(1), pending = revision(2), stale = revision(3);
  pending.qualification.humanReview.state = "pending";
  stale.qualification.revisionId = qualified.source.revisionId;
  const values: Record<string, unknown> = {
    require_agency_authoring_scope: true,
    read_workspace_version_sources: { workspaceId: agency, sources: [{ systemId, workspaceId: agency,
      name: "Fictional intake", hidden: true, revisions: [], versions: [{ versionId: foreign, workspaceId: foreign,
        clientName: "Fictional client", systemId: foreign, systemName: "Client intake", access: "full" }] }] },
    read_version_actor: { userId: actor.userId, memberships: [{ businessId: agency, role: "owner" }] },
    read_system_version_source_revisions: [qualified, pending, stale], ...overrides,
  };
  return { rpc: vi.fn(async (name: string, _args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> => {
    if (!(name in values)) throw new Error(`Unexpected portfolio/comparison RPC: ${name}`);
    return { data: values[name], error: null };
  }) };
}

beforeEach(() => { vi.clearAllMocks(); inquiry.gate.mockResolvedValue(true);
  inquiry.linked.mockResolvedValue({ sites: [] }); inquiry.portfolio.mockResolvedValue({ versions: [], unavailableTenantIds: [] }); });

describe("Create Version source discovery through the real server adapters", () => {
  it("keeps qualified sources and exact actor/scope without client comparisons or inquiry reads", async () => {
    const db = database();
    expect(await readVersionCreationChoices(actor, agency, db)).toEqual({ workspaceId: agency,
      sources: [{ systemId, name: "Fictional intake", revisions: [{ source: revision(1).source, summary: "Revision 1" }] }] });
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual(["require_agency_authoring_scope",
      "read_workspace_version_sources", "read_version_actor", "read_system_version_source_revisions"]);
    expect(db.rpc).toHaveBeenCalledWith("require_agency_authoring_scope", {
      p_agency_workspace_id: agency, p_workspace_id: agency, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
    expect(db.rpc).toHaveBeenCalledWith("read_workspace_version_sources", {
      p_workspace_id: agency, p_user_id: actor.userId, p_verified_email: "owner@example.test" });
    expect(db.rpc).toHaveBeenCalledWith("read_system_version_source_revisions", {
      p_workspace_id: agency, p_system_id: systemId, p_number: null, p_user_id: actor.userId, p_verified_email: "owner@example.test" });
    expect(inquiry.gate).not.toHaveBeenCalled(); expect(inquiry.linked).not.toHaveBeenCalled(); expect(inquiry.portfolio).not.toHaveBeenCalled();
  });

  it("denies authoring before discovery or private client reads", async () => {
    const db = database({ require_agency_authoring_scope: false });
    await expect(readVersionCreationChoices(actor, agency, db)).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual(["require_agency_authoring_scope"]);
    expect(inquiry.portfolio).not.toHaveBeenCalled();
  });

  it("rejects mismatched discovery identity before revision reads", async () => {
    const db = database({ read_workspace_version_sources: { workspaceId: foreign, sources: [] } });
    await expect(readVersionCreationChoices(actor, agency, db)).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual(["require_agency_authoring_scope", "read_workspace_version_sources"]);
  });

  it.each(["read_version_actor", "read_system_version_source_revisions"])("rejects revoked authority at %s", async name => {
    const db = database(), original = db.rpc.getMockImplementation()!;
    db.rpc.mockImplementation((rpcName, args) => rpcName === name
      ? Promise.resolve({ data: null, error: { message: "business_record_access_denied" } })
      : original(rpcName, args));
    await expect(readVersionCreationChoices(actor, agency, db)).rejects.toBeInstanceOf(VersionAccessError);
  });

  it.each([false, true])("the full Library still compares client improvements and hydrates inquiries (local edit: %s)", async localEdit => {
    const base = revision(1), latest = revision(2);
    latest.definition.title = "Updated fictional intake";
    const db = database({
      read_version_actor: { userId: actor.userId, memberships: [{ businessId: agency, role: "owner" }, { businessId: foreign, role: "admin" }] },
      read_system_version_source_revisions: [base, latest],
      read_system_version_source: { source: { businessId: agency, systemId }, hidden: true, sharedWith: [foreign], createdAt: at },
      read_system_version: { id: foreign, version: { businessId: foreign, systemId: foreign }, source: { businessId: agency, systemId },
        context: { kind: "agency_client", label: "Fictional client" }, baseline: { revision: 1, definition: base.definition },
        overrides: localEdit ? [{ path: "title", value: "Client-specific intake", setBy: actor.userId, setAt: at }] : [],
        bindings: [], localData: {}, releases: [], currentRelease: null, decisions: [], grants: [], rowRevision: 1,
        createdBy: actor.userId, createdAt: at, updatedAt: at },
    });
    const library = await readAgencyLibrary(actor, agency, db);
    expect(library.sources[0]?.versions[0]).toMatchObject({ versionId: foreign, state: localEdit ? "conflicts" : "ready", missingBindings: [] });
    expect(library.sources[0]?.versions[0]?.conflicts).toEqual(localEdit
      ? [{ path: "title", local: "Client-specific intake", upstream: "Updated fictional intake" }] : []);
    expect(db.rpc.mock.calls.filter(([name]) => name === "read_system_version")).toHaveLength(2);
    expect(inquiry.linked).toHaveBeenCalledWith(actor, agency); expect(inquiry.portfolio).toHaveBeenCalled();
    expect(library.inquiryVersions).toEqual([]);
  });
});
