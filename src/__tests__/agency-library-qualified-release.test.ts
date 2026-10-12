import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryConnectionOwnership, createInMemoryVersionStore, createSystemVersions, type VersionActor } from "@/platform/system-versions";
import type { AgencyClientsPage } from "@/experience/workspace/agency-clients";
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
vi.mock("@/experience/workspace/agency/operator-overview", () => ({ addAgencyOperatorOverview: async (_actor: unknown, page: AgencyClientsPage) => page }));
import { readAgencyClientsPage, readAgencyLibrary, reviewAllImprovements } from "@/experience/workspace/agency-server";

const agency = "11111111-1111-4111-8111-111111111111", client = "22222222-2222-4222-8222-222222222222";
const sourceId = "33333333-3333-4333-8333-333333333333", clientSystem = "44444444-4444-4444-8444-444444444444";
const actor: VersionActor = { userId: "55555555-5555-4555-8555-555555555555", memberships: [{ businessId: agency, role: "owner" }, { businessId: client, role: "admin" }] };
const workspaceActor = { userId: actor.userId, verifiedEmail: "agency@example.test" };
const definition = { kind: "internal_app", title: "Requests", fields: [{ id: "request", label: "Request", type: "text", required: true }], components: [{ kind: "form", fields: ["request"] }, { kind: "list", fields: ["request"] }] };

async function setup(bindingKinds: string[] = []) {
  const store = createInMemoryVersionStore(); mocks.store = store; mocks.actor = actor;
  const versions = createSystemVersions({ store, connections: createInMemoryConnectionOwnership(), rehearsePackage: revision => rehearseApplicationPackage(revision.source.revisionId, revision.definition) });
  const source = { businessId: agency, systemId: sourceId };
  const publish = (number: number) => versions.publishSourceRevision(actor, { source, definition: { ...definition, title: `Requests ${number}` }, summary: `Release ${number}`, requires: { bindingKinds: number > 1 ? bindingKinds : [] } });
  const qualify = async (number: number) => {
    const revision = (await store.getRevision(actor, source, number))!;
    await store.recordQualification!(actor, { ...revision.qualification!, status: "qualified", humanReview: { state: "approved", reviewerId: "reviewer", reviewedAt: "2026-10-12T00:00:00Z", note: "Reviewed this exact release" } });
  };
  const first = await publish(1); await qualify(1); await versions.shareSource(actor, source, client);
  const version = await versions.createVersion(actor, { source: first.source, version: { businessId: client, systemId: clientSystem }, context: { kind: "agency_client", label: "Harbor Dental" } });
  await publish(2); await qualify(2); await publish(3);
  const page: AgencyClientsPage = { agencyWorkspaceId: agency, clients: [{ workspaceId: client, name: "Harbor Dental", reach: "agency", role: "agency", provider: true, status: "ready", systems: [{ id: clientSystem, name: "Requests", kind: "internal_app", lifecycle: "draft", versionContext: "Harbor Dental" }], needsYou: { count: 0, oldestAt: null }, openRequests: 0, improvementsWaiting: 99, lastReceiptAt: null }], queue: [{ id: `improvement:${version.id}:3`, kind: "improvement", workspaceId: client, clientName: "Harbor Dental", title: "Unreviewed latest release", systemId: clientSystem, workId: null, since: "2026-10-12T00:00:00Z" }], team: [], total: 1, nextCursor: null, providersRead: true };
  const revisions = (await store.listRevisions(actor, source)).map(revision => ({ number: revision.source.number, label: null, summary: revision.summary, publishedAt: revision.publishedAt }));
  const db = { rpc: vi.fn(async (name: string) => ({ error: null, data: name === "agency_client_overview_v3" ? page : { workspaceId: agency, sources: [{ systemId: sourceId, workspaceId: agency, hidden: false, name: "Requests", revisions, versions: [{ versionId: version.id, workspaceId: client, clientName: "Harbor Dental", systemId: clientSystem, systemName: "Requests", access: "full" }] }] } })) };
  return { store, versions, version, db, source, page };
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


describe("Queue/Clients share the qualified Library offer", () => {
  it("replaces the raw latest-release count/Queue with qualified Release 2", async () => {
    const { db, version } = await setup();
    const result = await readAgencyClientsPage(workspaceActor, agency, null, db);
    expect(result.clients[0]).toMatchObject({ improvementsWaiting: 1, improvementsStatus: "ready" });
    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]).toMatchObject({ id: `improvement:${version.id}:2`, systemId: clientSystem, label: "Improvement ready", title: "Requests: Release 2 · Release 2", href: expect.stringContaining(`system=${clientSystem}`) });
    expect(result.queueComplete).toBe(true);
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual(["agency_client_overview_v3", "read_workspace_version_sources"]);
  });
  it.each(["decline", "adopt", "revoke"])("does not resurrect an old/unqualified offer after %s", async action => {
    const { db, versions, version, store, source } = await setup();
    if (action === "decline") await versions.declineImprovement(actor, version.id, { revision: 2, reason: "Keep our existing process", expectedRowRevision: version.rowRevision });
    if (action === "adopt") await versions.adoptImprovement(actor, version.id, { revision: 2, expectedRowRevision: version.rowRevision });
    if (action === "revoke") {
      const revision = (await store.getRevision(actor, source, 2))!;
      await store.recordQualification!(actor, { ...revision.qualification!, status: "pending" });
    }
    const library = await readAgencyLibrary(workspaceActor, agency, db);
    expect(library.sources[0]!.versions[0]!.state).toBe(action === "decline" ? "declined" : "up_to_date");
    const result = await readAgencyClientsPage(workspaceActor, agency, null, db);
    expect(result.queue).toEqual([]);
    expect(result.clients[0]).toMatchObject({ improvementsWaiting: 0, improvementsStatus: "ready" });
  });
  it("keeps the Library's conflict state instead of calling it ready", async () => {
    const { db, versions, version } = await setup();
    await versions.setOverride(actor, version.id, { path: "title", value: "Local name", expectedRowRevision: version.rowRevision });
    const library = await readAgencyLibrary(workspaceActor, agency, db);
    expect(library.sources[0]!.versions[0]).toMatchObject({ state: "conflicts", improvementRevision: 2 });
    const result = await readAgencyClientsPage(workspaceActor, agency, null, db);
    expect(result.clients[0]!.improvementsWaiting).toBe(1);
    expect(result.queue[0]).toMatchObject({ label: "Needs a choice on 1 change", title: "Requests: Release 2 · Release 2" });
  });
  it("keeps the Library's missing local-account requirement", async () => {
    const { db } = await setup(["google_calendar"]);
    expect((await readAgencyLibrary(workspaceActor, agency, db)).sources[0]!.versions[0]).toMatchObject({ state: "missing_accounts", improvementRevision: 2 });
    const result = await readAgencyClientsPage(workspaceActor, agency, null, db);
    expect(result.clients[0]!.improvementsWaiting).toBe(1);
    expect(result.queue[0]!.label).toBe("Needs Google Calendar connected first");
  });
  it("leaves the Queue incomplete when qualification cannot be read", async () => {
    const { db, page, store } = await setup();
    const request = { ...page.queue[0]!, id: "request:fixture", kind: "request" as const, title: "Retained request" }; page.queue.push(request);
    vi.spyOn(store, "listRevisions").mockRejectedValue(new Error("Source read failed"));
    const result = await readAgencyClientsPage(workspaceActor, agency, null, db);
    expect(result.queue).toEqual([request]);
    expect(result.clients[0]).toMatchObject({ status: "ready", improvementsWaiting: 0, improvementsStatus: "unavailable" });
    expect(result.queueComplete).toBe(false);
    expect(result.queueGaps).toEqual(["Harbor Dental: some improvements could not be read."]);
  });
  it("keeps service reads on source discovery failure without forwarding raw offers", async () => {
    const { db, page } = await setup();
    db.rpc.mockImplementation(async name => { if (name !== "agency_client_overview_v3") throw new Error("Library unavailable"); return { error: null, data: page }; });
    const result = await readAgencyClientsPage(workspaceActor, agency, null, db);
    expect(result.queue).toEqual([]);
    expect(result.clients[0]).toMatchObject({ status: "ready", improvementsWaiting: 0, improvementsStatus: "unavailable" });
    expect(result.queueComplete).toBe(false);
    expect(result.queueGaps).toEqual(["Harbor Dental: improvements could not be read."]);
  });
  it("does not compare or project a Version outside the loaded client's System scope", async () => {
    const { db, page, store } = await setup();
    page.clients[0]!.systems[0]!.id = "66666666-6666-4666-8666-666666666666";
    const getLineage = vi.spyOn(store, "getLineage");
    const result = await readAgencyClientsPage(workspaceActor, agency, null, db);
    expect(getLineage).not.toHaveBeenCalled();
    expect(result.queue).toEqual([]);
    expect(result.clients[0]!.improvementsWaiting).toBe(0);
  });
});
