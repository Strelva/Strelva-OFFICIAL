import { describe, expect, it } from "vitest";
import { createInMemoryVersionStore, createInMemoryConnectionOwnership } from "@/platform/system-versions/store";
import { createSystemVersions, validateLockedPaths } from "@/platform/system-versions/service";
import type { VersionActor } from "@/platform/system-versions/types";
const source = { businessId: "brand", systemId: "site" };
const owner: VersionActor = { userId: "owner", memberships: [{ businessId: "brand", role: "owner" }, { businessId: "location", role: "owner" }] };
const definition = { brand: { name: "Brand", policy: "One policy" }, hours: "Local" };
async function fixture(locks: string[] = []) {
  const versions = createSystemVersions({ store: createInMemoryVersionStore(), connections: createInMemoryConnectionOwnership() });
  const revision = await versions.publishSourceRevision(owner, { source, definition, summary: "Brand standard", lockedPaths: locks });
  await versions.shareSource(owner, source, "location");
  const version = await versions.createVersion(owner, { source: revision.source, version: { businessId: "location", systemId: "local-site" }, context: { kind: "location", label: "Location" } });
  return { versions, version };
}
describe("pushed standards keep local ownership", () => {
  it("rejects direct, ancestor and root overrides while allowing local fields", async () => {
    const { versions, version } = await fixture(["brand.name"]);
    for (const path of ["brand.name", "brand", "*"]) await expect(versions.setOverride(owner, version.id, { path, value: "Other", expectedRowRevision: 1 })).rejects.toThrow("pushed standard");
    const local = await versions.setOverride(owner, version.id, { path: "hours", value: "Different hours", expectedRowRevision: 1 });
    expect(local.overrides[0]?.path).toBe("hours");
  });
  it("newly locked unchanged source fields create a conflict and require upstream", async () => {
    const { versions, version } = await fixture();
    const local = await versions.setOverride(owner, version.id, { path: "brand", value: { name: "Local", policy: "One policy" }, expectedRowRevision: 1 });
    await versions.publishSourceRevision(owner, { source, definition, summary: "Lock brand", lockedPaths: ["brand.name"] });
    const comparison = await versions.compareImprovement(owner, local.id, 2);
    expect(comparison.status).toBe("blocked"); expect(comparison.conflicts[0]?.path).toBe("brand");
    await expect(versions.adoptImprovement(owner, local.id, { revision: 2, expectedRowRevision: local.rowRevision, resolutions: [{ path: "brand", choice: "keep_local" }] })).rejects.toThrow("upstream");
    const adopted = await versions.adoptImprovement(owner, local.id, { revision: 2, expectedRowRevision: local.rowRevision, resolutions: [{ path: "brand", choice: "take_upstream" }] });
    expect(adopted.version.businessId).toBe("location"); expect(adopted.currentRelease).toBe(null); expect(adopted.overrides).toEqual([]);
  });
  it("restoring an old release cannot bypass newly locked policy", async () => {
    const { versions, version } = await fixture();
    let local = await versions.setOverride(owner, version.id, { path: "brand.name", value: "Local", expectedRowRevision: version.rowRevision });
    local = await versions.release(owner, local.id, { expectedRowRevision: local.rowRevision });
    await versions.publishSourceRevision(owner, { source, definition, summary: "Lock brand", lockedPaths: ["brand.name"] });
    local = await versions.adoptImprovement(owner, local.id, { revision: 2, expectedRowRevision: local.rowRevision, resolutions: [{ path: "brand.name", choice: "take_upstream" }] });
    await expect(versions.restoreReleaseDraft(owner, local.id, { releaseNumber: 1, expectedRowRevision: local.rowRevision })).rejects.toThrow("pushed standard");
    expect((await versions.readVersion(owner, local.id)).releases[0]?.definition.brand).toEqual({ name: "Local", policy: "One policy" });
  });
  it("rejects missing, prototype, whole-system and excessive locks", () => {
    for (const paths of [["missing"], ["*"], ["__proto__"], Array(101).fill("hours")]) expect(() => validateLockedPaths(definition, paths)).toThrow();
    expect(validateLockedPaths(definition, ["brand.name", "brand.name"])).toEqual(["brand.name"]);
  });
  it("refuses null and non-string lock entries at the actual service boundary", () => {
    const numericNamedDefinition = { title: "Locked", "17": "Numeric key", true: "Boolean key" };
    for (const paths of [[null], [17], [true], ["title", null]]) {
      expect(() => Reflect.apply(validateLockedPaths, undefined, [numericNamedDefinition, paths])).toThrow();
    }
  });
  it("a foreign actor cannot edit the location or publish the source", async () => {
    const { versions, version } = await fixture(["brand.name"]);
    const outsider: VersionActor = { userId: "outsider", memberships: [] };
    await expect(versions.setOverride(outsider, version.id, { path: "hours", value: "Other", expectedRowRevision: 1 })).rejects.toThrow("unavailable");
  });
});
