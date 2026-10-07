import { describe, expect, it } from "vitest";
import { createInMemoryVersionStore, createInMemoryConnectionOwnership, createSystemVersions, type VersionActor } from "@/platform/system-versions";
import { projectVersionPossibilities } from "@/platform/system-versions/possibilities";
import { versionReleaseRevision } from "@/platform/needs-you/sources/version-release";

const agencyId = crypto.randomUUID(), businessId = crypto.randomUUID(), systemId = crypto.randomUUID();
const actor: VersionActor = { userId: crypto.randomUUID(), memberships: [{ businessId: agencyId, role: "owner" }, { businessId, role: "owner" }] };
async function world() {
  const store = createInMemoryVersionStore();
  const versions = createSystemVersions({ store, connections: createInMemoryConnectionOwnership() });
  const source = { businessId: agencyId, systemId: crypto.randomUUID() };
  const first = await versions.publishSourceRevision(actor, { source, definition: { title: "Intake", message: "Old", localData: {} }, summary: "First" });
  await versions.shareSource(actor, source, businessId);
  const lineage = await versions.createVersion(actor, { source: first.source, version: { businessId, systemId }, context: { kind: "agency_client", label: "The Mooney Firm" } });
  const released = await versions.release(actor, lineage.id, { expectedRowRevision: lineage.rowRevision });
  await versions.publishSourceRevision(actor, { source, definition: { title: "Intake", message: "New", localData: {} }, summary: "Better follow-up" });
  return { store, versions, lineage: released };
}
describe("Version alternatives in the Possibilities projection", () => {
  it("projects only this business System's source improvement and transitions into its pinned release candidate", async () => {
    const { versions, lineage } = await world();
    const projection = projectVersionPossibilities(lineage, await versions.listAvailableImprovements(actor, lineage.id), "Intake");
    expect(projection.possibilities).toMatchObject([{ system: { businessId, systemId }, status: "ready", preview: { message: "New" }, makeReal: { kind: "version_release", versionId: lineage.id } }]);
    expect(projection.pendingRelease).toBeNull();
    const adopted = await versions.adoptImprovement(actor, lineage.id, { revision: 2, expectedRowRevision: lineage.rowRevision });
    const prepared = projectVersionPossibilities(adopted, await versions.listAvailableImprovements(actor, lineage.id), "Intake");
    expect(prepared.possibilities).toEqual([]);
    expect(prepared.pendingRelease).toMatchObject({ system: { businessId, systemId }, rowRevision: adopted.rowRevision,
      decisionRevision: versionReleaseRevision(lineage.id, adopted.rowRevision), current: { message: "Old" }, preview: { message: "New" } });
    expect((await versions.readVersion(actor, lineage.id)).currentRelease).toBe(1);
    const changed = await versions.setOverride(actor, lineage.id, { path: "title", value: "Mediation intake", expectedRowRevision: adopted.rowRevision });
    expect(projectVersionPossibilities(changed, [], "Intake").pendingRelease?.decisionRevision).not.toBe(prepared.pendingRelease?.decisionRevision);
    const live = await versions.release(actor, lineage.id, { expectedRowRevision: changed.rowRevision });
    expect(projectVersionPossibilities(live, [], "Intake").pendingRelease).toBeNull();
  });
  it("keeps conflicts Exploring with both values and hides a declined improvement without changing live state", async () => {
    const { versions, lineage } = await world();
    const local = await versions.setOverride(actor, lineage.id, { path: "message", value: "Local", expectedRowRevision: lineage.rowRevision });
    const offers = await versions.listAvailableImprovements(actor, lineage.id);
    expect(projectVersionPossibilities(local, offers, "Intake").possibilities).toMatchObject([{ status: "exploring", conflicts: [{ path: "message", local: "Local", upstream: "New" }] }]);
    const declined = await versions.declineImprovement(actor, lineage.id, { revision: 2, reason: "Keep our promise", expectedRowRevision: local.rowRevision });
    expect(projectVersionPossibilities(declined, offers, "Intake").possibilities).toEqual([]);
    expect(declined.releases).toEqual(local.releases);
  });
});
