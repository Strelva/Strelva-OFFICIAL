import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryVersionStore, createInMemoryConnectionOwnership, createSystemVersions, VersionAccessError, VersionStaleError, VersionConflictError, type VersionActor, type VersionStore } from "@/platform/system-versions";
const deps = vi.hoisted(() => ({ store: null as VersionStore | null, actor: null as VersionActor | null, prepare: vi.fn(), enabled: true }));
vi.mock("@/platform/system-versions/supabase-store", () => ({ createSupabaseVersionStore: () => deps.store, createSupabaseConnectionOwnership: () => createInMemoryConnectionOwnership(), readVersionActor: async () => deps.actor, versionsDb: () => ({}) }));
vi.mock("@/platform/system-versions/preparation", () => ({ prepareVersionRelease: deps.prepare }));
vi.mock("@/platform/needs-you/release", () => ({ needsYouReleaseEnabled: () => deps.enabled }));
import { decideSystemImprovement, readSystemVersion } from "@/experience/workspace/agency/version-server";
const workspaceId = crypto.randomUUID(), systemId = crypto.randomUUID(), agencyId = crypto.randomUUID();
const actor = { userId: crypto.randomUUID(), verifiedEmail: "operator@example.test" };
const versionActor: VersionActor = { ...actor, memberships: [{ businessId: workspaceId, role: "admin" }, { businessId: agencyId, role: "owner" }] };
async function setup(conflict = false) {
  const store = createInMemoryVersionStore(); deps.store = store; deps.actor = versionActor;
  const versions = createSystemVersions({ store, connections: createInMemoryConnectionOwnership() });
  const source = { businessId: agencyId, systemId: crypto.randomUUID() };
  const first = await versions.publishSourceRevision(versionActor, { source, definition: { text: "Old" }, summary: "First" });
  await versions.shareSource(versionActor, source, workspaceId);
  let lineage = await versions.createVersion(versionActor, { source: first.source, version: { businessId: workspaceId, systemId }, context: { kind: "agency_client", label: "Harbor" } });
  if (conflict) lineage = await versions.setOverride(versionActor, lineage.id, { path: "text", value: "Local", expectedRowRevision: lineage.rowRevision });
  await versions.publishSourceRevision(versionActor, { source, definition: { text: "New" }, summary: "Second" });
  const input = { workspaceId, systemId, versionId: lineage.id, rowRevision: lineage.rowRevision, revision: 2, action: "adopt" as const };
  return { versions, lineage, input };
}
beforeEach(() => { deps.enabled = true; deps.prepare.mockReset().mockImplementation(async (_actor, lineage) => ({ receiptId: crypto.randomUUID(), decisionId: crypto.randomUUID(), workspaceId, versionId: lineage.id, rowRevision: lineage.rowRevision })); });
describe("Version improvement decisions", () => {
  it("reads the owning System's conflicts and keeps adoption separate from release", async () => {
    const { versions, input } = await setup(true);
    expect(await readSystemVersion(actor, workspaceId, systemId)).toMatchObject({ versionId: input.versionId, canManage: true, offers: [expect.objectContaining({ conflicts: [expect.objectContaining({ local: "Local", upstream: "New" })] })] });
    await expect(decideSystemImprovement(actor, input)).rejects.toBeInstanceOf(VersionConflictError);
    expect(deps.prepare).not.toHaveBeenCalled();
    const result = await decideSystemImprovement(actor, { ...input, resolutions: [{ path: "text", choice: "keep_local" }] });
    expect(result).toMatchObject({ outcome: "prepared", rowRevision: input.rowRevision + 1 });
    expect(await versions.readVersion(versionActor, input.versionId)).toMatchObject({ baselineRevision: 2, workingDefinition: { text: "Local" }, currentRelease: null });
  });
  it("fails closed when Needs you is off, without adopting", async () => {
    const { versions, input } = await setup(); deps.enabled = false;
    await expect(decideSystemImprovement(actor, input)).rejects.toThrow(/Nothing was adopted/);
    expect((await versions.readVersion(versionActor, input.versionId)).baselineRevision).toBe(1);
    expect(deps.prepare).not.toHaveBeenCalled();
  });
  it("retries an interrupted preparation with the original command, without adopting twice", async () => {
    const { versions, input } = await setup();
    deps.prepare.mockRejectedValueOnce(new Error("Receipt storage unavailable"));
    await expect(decideSystemImprovement(actor, input)).rejects.toThrow(/Receipt storage/);
    const recovered = await decideSystemImprovement(actor, input);
    expect(recovered).toMatchObject({ outcome: "prepared", rowRevision: input.rowRevision + 1 });
    expect((await versions.readVersion(versionActor, input.versionId)).decisions).toHaveLength(1);
    expect(deps.prepare).toHaveBeenCalledTimes(2);
  });
  it("refuses a changed retry choice, another actor and edits made after adoption", async () => {
    const { versions, input } = await setup(true);
    const accepted = { ...input, resolutions: [{ path: "text", choice: "keep_local" as const }] };
    const result = await decideSystemImprovement(actor, accepted);
    await expect(decideSystemImprovement(actor, { ...accepted, resolutions: [{ path: "text", choice: "take_upstream" }] })).rejects.toBeInstanceOf(VersionStaleError);
    await expect(decideSystemImprovement({ ...actor, userId: crypto.randomUUID() }, accepted)).rejects.toBeInstanceOf(VersionStaleError);
    await versions.setOverride(versionActor, input.versionId, { path: "text", value: "Later", expectedRowRevision: result.rowRevision });
    await expect(decideSystemImprovement(actor, accepted)).rejects.toBeInstanceOf(VersionStaleError);
    expect(deps.prepare).toHaveBeenCalledTimes(1);
  });
  it("declines once and preserves the live release on an identical retry", async () => {
    const { versions, input } = await setup();
    const command = { ...input, action: "decline" as const, reason: "Keep our terms" };
    const declined = await decideSystemImprovement(actor, command);
    expect(await decideSystemImprovement(actor, command)).toEqual(declined);
    expect((await versions.readVersion(versionActor, input.versionId)).decisions).toHaveLength(1);
    await expect(decideSystemImprovement(actor, { ...command, reason: "Different" })).rejects.toBeInstanceOf(VersionStaleError);
    expect(deps.prepare).not.toHaveBeenCalled();
  });
  it("never uses a caller's unrelated Version id or exposes another business", async () => {
    const { input } = await setup();
    await expect(decideSystemImprovement(actor, { ...input, versionId: crypto.randomUUID() })).rejects.toBeInstanceOf(VersionAccessError);
    await expect(readSystemVersion(actor, crypto.randomUUID(), systemId)).rejects.toBeInstanceOf(VersionAccessError);
    deps.actor = { ...actor, memberships: [{ businessId: agencyId, role: "owner" }] };
    await expect(readSystemVersion(actor, workspaceId, systemId)).rejects.toBeInstanceOf(VersionAccessError);
  });
});
