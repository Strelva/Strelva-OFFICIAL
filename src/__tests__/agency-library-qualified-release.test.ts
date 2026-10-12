import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryConnectionOwnership, createInMemoryVersionStore, createSystemVersions, type VersionActor } from "@/platform/system-versions";
import { rehearseApplicationPackage } from "@/products/applications/package-rehearsal";

const mocks = vi.hoisted(() => ({ store: null as unknown, actor: null as unknown }));
vi.mock("@/platform/system-versions/supabase-store", async original => ({
  ...await original<typeof import("@/platform/system-versions/supabase-store")>(),
  createSupabaseVersionStore: () => mocks.store,
  createSupabaseConnectionOwnership: () => createInMemoryConnectionOwnership(),
  readVersionActor: () => Promise.resolve(mocks.actor),
}));
vi.mock("@/platform/systems-release", () => ({ systemsReleasedFor: async () => true }));
vi.mock("@/products/inquiries", () => ({ inquiryReleaseMayBeOn: () => false }));
import { readAgencyLibrary, reviewAllImprovements } from "@/experience/workspace/agency-server";

const agency = "11111111-1111-4111-8111-111111111111", client = "22222222-2222-4222-8222-222222222222";
const sourceId = "33333333-3333-4333-8333-333333333333", clientSystem = "44444444-4444-4444-8444-444444444444";
const actor: VersionActor = { userId: "55555555-5555-4555-8555-555555555555", memberships: [{ businessId: agency, role: "owner" }, { businessId: client, role: "admin" }] };
const workspaceActor = { userId: actor.userId, verifiedEmail: "agency@example.test" };
const definition = { kind: "internal_app", title: "Requests", fields: [{ id: "request", label: "Request", type: "text", required: true }], components: [{ kind: "form", fields: ["request"] }, { kind: "list", fields: ["request"] }] };

async function setup() {
  const store = createInMemoryVersionStore(); mocks.store = store; mocks.actor = actor;
  const versions = createSystemVersions({ store, connections: createInMemoryConnectionOwnership(), rehearsePackage: revision => rehearseApplicationPackage(revision.source.revisionId, revision.definition) });
  const source = { businessId: agency, systemId: sourceId };
  const publish = (number: number) => versions.publishSourceRevision(actor, { source, definition: { ...definition, title: `Requests ${number}` }, summary: `Release ${number}` });
  const qualify = async (number: number) => {
    const revision = (await store.getRevision(actor, source, number))!;
    await store.recordQualification!(actor, { ...revision.qualification!, status: "qualified", humanReview: { state: "approved", reviewerId: "reviewer", reviewedAt: "2026-10-12T00:00:00Z", note: "Reviewed this exact release" } });
  };
  const first = await publish(1); await qualify(1); await versions.shareSource(actor, source, client);
  const version = await versions.createVersion(actor, { source: first.source, version: { businessId: client, systemId: clientSystem }, context: { kind: "agency_client", label: "Harbor Dental" } });
  await publish(2); await qualify(2); await publish(3);
  const db = { rpc: vi.fn(async () => ({ error: null, data: { workspaceId: agency, sources: [{ systemId: sourceId, workspaceId: agency, hidden: false, name: "Requests", revisions: (await store.listRevisions(actor, source)).map(revision => ({ number: revision.source.number, label: null, summary: revision.summary, publishedAt: revision.publishedAt })), versions: [{ versionId: version.id, workspaceId: client, clientName: "Harbor Dental", systemId: clientSystem, systemName: "Requests", access: "full" }] }] } })) };
  return { store, versions, version, db, source };
}

beforeEach(() => vi.clearAllMocks());
describe("Library exact qualified release", () => {
  it("displays and prepares qualified Release 2 while the newest Release 3 is unreviewed", async () => {
    const { version, db, versions } = await setup();
    const library = await readAgencyLibrary(workspaceActor, agency, db);
    expect(library.sources[0]!.revisions.at(-1)!.number).toBe(3);
    expect(library.sources[0]!.versions[0]).toMatchObject({ state: "ready", improvementRevision: 2 });
    const prepare = vi.fn(async () => ({ receiptId: "receipt", decisionId: "decision", workspaceId: client, versionId: version.id, rowRevision: 2 }));
    const result = await reviewAllImprovements(workspaceActor, { agencyWorkspaceId: agency, sourceSystemId: sourceId, revision: 2, versionIds: [version.id] }, db, prepare);
    expect(result.results[0]!.outcome).toBe("prepared");
    expect(prepare).toHaveBeenCalledWith(workspaceActor, expect.objectContaining({ baseline: expect.objectContaining({ revision: 2 }) }));
    expect((await versions.readVersion(actor, version.id)).releases).toEqual([]);
    expect((await readAgencyLibrary(workspaceActor, agency, db)).sources[0]!.versions[0]).toMatchObject({ state: "up_to_date", improvementRevision: null, baselineRevision: 2 });
    prepare.mockClear();
    const older = await reviewAllImprovements(workspaceActor, { agencyWorkspaceId: agency, sourceSystemId: sourceId, revision: 1, versionIds: [version.id] }, db, prepare);
    expect(older.results[0]!.outcome).toBe("skipped_up_to_date");
    expect(prepare).not.toHaveBeenCalled();
    const resumed = await reviewAllImprovements(workspaceActor, { agencyWorkspaceId: agency, sourceSystemId: sourceId, revision: 2, versionIds: [version.id] }, db, prepare);
    expect(resumed.results[0]!.outcome).toBe("prepared");
    expect(prepare).toHaveBeenCalledTimes(1);

  });
  it("rechecks qualification on preparation and refuses an unreviewed or revoked release", async () => {
    const { version, db, versions, store, source } = await setup();
    const prepare = vi.fn(async () => null);
    const input = { agencyWorkspaceId: agency, sourceSystemId: sourceId, revision: 3, versionIds: [version.id] };
    expect((await reviewAllImprovements(workspaceActor, input, db, prepare)).results[0]).toMatchObject({ outcome: "failed", detail: expect.stringContaining("qualification and human review") });
    const revision = (await store.getRevision(actor, source, 2))!;
    await store.recordQualification!(actor, { ...revision.qualification!, status: "pending" });
    expect((await reviewAllImprovements(workspaceActor, { ...input, revision: 2 }, db, prepare)).results[0]!.outcome).toBe("failed");
    expect(prepare).not.toHaveBeenCalled();
    expect((await versions.readVersion(actor, version.id)).baselineRevision).toBe(1);
    await expect(reviewAllImprovements(workspaceActor, { ...input, revision: 4 }, db, prepare)).rejects.toThrow("not in this library");
  });
  it("counts retained local changes independently of conflicts with the offered release", async () => {
    const { version, versions, db } = await setup();
    await versions.setOverride(actor, version.id, { path: "fields", value: [{ ...definition.fields[0]!, label: "Local request wording" }], expectedRowRevision: version.rowRevision });
    expect((await readAgencyLibrary(workspaceActor, agency, db)).sources[0]!.versions[0]).toMatchObject({ state: "ready", improvementRevision: 2, localChanges: 1, conflicts: [] });
  });

});
