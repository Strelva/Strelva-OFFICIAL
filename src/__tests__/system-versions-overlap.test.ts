import { beforeEach, describe, expect, it } from "vitest";
import {
  VersionConflictError,
  createInMemoryConnectionOwnership,
  createInMemoryVersionStore,
  createSystemVersions,
  threeWayCompare,
  type JsonObject,
  type SystemVersions,
  type VersionActor,
  type VersionLineage,
} from "@/platform/system-versions";

// Fictional fixture: Northside Studio publishes an intake System; The Mooney
// Firm runs its own Version. No real records or credentials.
const AGENCY = "biz_northside";
const MOONEY = "biz_mooney";
const SOURCE = { businessId: AGENCY, systemId: "sys_intake_source" };
const agencyOwner: VersionActor = { userId: "u_agency", memberships: [{ businessId: AGENCY, role: "owner" }] };
const mooneyOwner: VersionActor = { userId: "u_mooney", memberships: [{ businessId: MOONEY, role: "owner" }] };

const baseDefinition: JsonObject = {
  form: { title: "T1", color: "red" },
  steps: [{ id: "name", label: "Name" }, { id: "phone", label: "Phone" }],
  routing: { withinMinutes: 30 },
};

function edit(definition: JsonObject, mutate: (copy: JsonObject) => void): JsonObject {
  const copy = JSON.parse(JSON.stringify(definition)) as JsonObject;
  mutate(copy);
  return copy;
}

describe("System Versions: a local edit overlapping an upstream change is never silently lost", () => {
  let versions: SystemVersions;
  let version: VersionLineage;

  function publish(definition: JsonObject) {
    return versions.publishSourceRevision(agencyOwner, { source: SOURCE, definition, summary: "Update" });
  }

  function override(path: string, value: JsonObject[string]) {
    version = versions.setOverride(mooneyOwner, version.id, { path, value, expectedRowRevision: version.rowRevision });
  }

  function adopt(resolutions?: { path: string; choice: "keep_local" | "take_upstream" }[]) {
    version = versions.adoptImprovement(mooneyOwner, version.id, { revision: 2, expectedRowRevision: version.rowRevision, resolutions });
    return versions.readVersion(mooneyOwner, version.id).workingDefinition;
  }

  beforeEach(() => {
    const connections = createInMemoryConnectionOwnership({});
    versions = createSystemVersions({ store: createInMemoryVersionStore(), connections });
    const v1 = publish(baseDefinition);
    versions.shareSource(agencyOwner, SOURCE, MOONEY);
    version = versions.createVersion(mooneyOwner, {
      source: v1.source,
      version: { businessId: MOONEY, systemId: "sys_mooney_intake" },
      context: { kind: "agency_client", label: "The Mooney Firm" },
    });
  });

  describe("whole-object local override + upstream nested change", () => {
    beforeEach(() => {
      override("form", { title: "T1", color: "blue" });
      publish(edit(baseDefinition, (copy) => { (copy.form as JsonObject).title = "T2"; }));
    });

    it("reports a conflict at the override path and blocks adoption until a choice is made", () => {
      const comparison = versions.compareImprovement(mooneyOwner, version.id, 2);
      expect(comparison.status).toBe("blocked");
      expect(comparison.conflicts).toEqual([
        expect.objectContaining({ path: "form", local: { title: "T1", color: "blue" }, upstream: { title: "T2", color: "red" } }),
      ]);
      expect(() => adopt()).toThrow(VersionConflictError);
    });

    it("never adopts a result that differs from the preview or drops the customer's color", () => {
      const preview = versions.compareImprovement(mooneyOwner, version.id, 2).preview;
      let adopted: JsonObject | null = null;
      try {
        adopted = adopt();
      } catch (error) {
        expect(error).toBeInstanceOf(VersionConflictError);
      }
      if (adopted) expect(adopted).toEqual(preview);
      expect(preview.form).toMatchObject({ color: "blue" });
    });

    it("keeps the customer's whole object after keep_local, and preview matches the adopted result", () => {
      const preview = versions.compareImprovement(mooneyOwner, version.id, 2).preview;
      const adopted = adopt([{ path: "form", choice: "keep_local" }]);
      expect(adopted.form).toEqual({ title: "T1", color: "blue" });
      expect(adopted).toEqual(preview);
    });

    it("takes the upstream object after take_upstream", () => {
      const adopted = adopt([{ path: "form", choice: "take_upstream" }]);
      expect(adopted.form).toEqual({ title: "T2", color: "red" });
      expect(versions.readVersion(mooneyOwner, version.id).overrides).toEqual([]);
    });
  });

  it("reports a conflict when the local edit is nested and upstream replaces the whole object", () => {
    override("form.title", "Mine");
    publish(edit(baseDefinition, (copy) => { copy.form = null; }));
    const comparison = versions.compareImprovement(mooneyOwner, version.id, 2);
    expect(comparison.status).toBe("blocked");
    expect(comparison.conflicts).toEqual([expect.objectContaining({ path: "form", reason: "incompatible_override", upstream: null })]);
    expect(() => adopt()).toThrow(VersionConflictError);
    expect(adopt([{ path: "form", choice: "keep_local" }]).form).toEqual({ title: "Mine", color: "red" });
  });

  it("reports a conflict when upstream reshapes the object and drops the field the customer edited", () => {
    override("form.title", "Mine");
    publish(edit(baseDefinition, (copy) => { copy.form = { heading: "Contact us", color: "red" }; }));
    const comparison = versions.compareImprovement(mooneyOwner, version.id, 2);
    expect(comparison.status).toBe("blocked");
    expect(comparison.conflicts).toEqual([expect.objectContaining({ path: "form.title", local: "Mine", upstream: undefined })]);
    expect(() => adopt()).toThrow(VersionConflictError);
    const adopted = adopt([{ path: "form.title", choice: "take_upstream" }]);
    expect(adopted.form).toEqual({ heading: "Contact us", color: "red" });
  });

  it("treats an array as one value: a local element edit and an upstream edit to another element conflict", () => {
    override("steps", [{ id: "name", label: "Full name" }, { id: "phone", label: "Phone" }]);
    publish(edit(baseDefinition, (copy) => { (copy.steps as JsonObject[])[1]!.label = "Mobile"; }));
    const comparison = versions.compareImprovement(mooneyOwner, version.id, 2);
    expect(comparison.conflicts).toEqual([expect.objectContaining({ path: "steps" })]);
    expect(() => adopt()).toThrow(VersionConflictError);
    expect(adopt([{ path: "steps", choice: "keep_local" }]).steps).toEqual([
      { id: "name", label: "Full name" },
      { id: "phone", label: "Phone" },
    ]);
  });

  it("still merges non-overlapping changes automatically, and preview equals the adopted result", () => {
    override("form", { title: "T1", color: "blue" });
    publish(edit(baseDefinition, (copy) => { (copy.routing as JsonObject).withinMinutes = 10; }));
    const comparison = versions.compareImprovement(mooneyOwner, version.id, 2);
    expect(comparison).toMatchObject({ status: "auto_applicable", conflicts: [] });
    const adopted = adopt();
    expect(adopted).toEqual(comparison.preview);
    expect(adopted).toEqual(edit(baseDefinition, (copy) => {
      copy.form = { title: "T1", color: "blue" };
      (copy.routing as JsonObject).withinMinutes = 10;
    }));
  });

  it("drops an override that upstream now matches exactly, with preview equal to the adopted result", () => {
    override("form", { title: "T1", color: "blue" });
    publish(edit(baseDefinition, (copy) => { copy.form = { title: "T1", color: "blue" }; }));
    const comparison = versions.compareImprovement(mooneyOwner, version.id, 2);
    expect(comparison).toMatchObject({ status: "auto_applicable", conflicts: [] });
    expect(adopt()).toEqual(comparison.preview);
    expect(versions.readVersion(mooneyOwner, version.id).overrides).toEqual([]);
  });
});

describe("three-way compare: arrays are one value", () => {
  it("reports one conflict when each side edits a different element of the same list", () => {
    const base = { steps: [{ label: "a" }, { label: "b" }] };
    const result = threeWayCompare({
      base,
      local: { steps: [{ label: "a2" }, { label: "b" }] },
      upstream: { steps: [{ label: "a" }, { label: "b2" }] },
    });
    expect(result.upstreamPaths).toEqual(["steps"]);
    expect(result.localPaths).toEqual(["steps"]);
    expect(result.conflicts).toEqual([expect.objectContaining({ path: "steps", reason: "overlapping_edit" })]);
    expect(result.merged.steps).toEqual([{ label: "a2" }, { label: "b" }]);
  });

  it("treats a caller-declared local edit path as the unit of change", () => {
    const base = { form: { title: "T1", color: "red" } };
    const result = threeWayCompare({
      base,
      local: { form: { title: "T1", color: "blue" } },
      upstream: { form: { title: "T2", color: "red" } },
      localEditPaths: ["form"],
    });
    expect(result.localPaths).toEqual(["form"]);
    expect(result.conflicts).toEqual([expect.objectContaining({ path: "form", reason: "incompatible_override" })]);
    expect(result.merged.form).toEqual({ title: "T1", color: "blue" });
  });
});
