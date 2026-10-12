import { beforeEach, describe, expect, it } from "vitest";
import {
  VersionAccessError,
  VersionConflictError,
  VersionIncompatibleError,
  VersionStaleError,
  VersionValidationError,
  createInMemoryConnectionOwnership,
  createInMemoryVersionStore,
  createSystemVersions,
  type JsonObject,
  type SystemVersions,
  type VersionActor,
  type VersionLineage,
} from "@/platform/system-versions";

// Fictional fixture: Northside Studio is an agency; The Mooney Firm and
// Lakeside Dental are its clients. No real records or credentials.
const AGENCY = "biz_northside";
const MOONEY = "biz_mooney";
const LAKESIDE = "biz_lakeside";
const SOURCE = { businessId: AGENCY, systemId: "sys_intake_source" };

const agencyOwner: VersionActor = { userId: "u_agency", memberships: [{ businessId: AGENCY, role: "owner" }] };
const mooneyOwner: VersionActor = { userId: "u_mooney", memberships: [{ businessId: MOONEY, role: "owner" }] };
const mooneyMember: VersionActor = { userId: "u_mooney_staff", memberships: [{ businessId: MOONEY, role: "member" }] };
const lakesideOwner: VersionActor = { userId: "u_lakeside", memberships: [{ businessId: LAKESIDE, role: "owner" }] };

const intakeV1: JsonObject = {
  form: { title: "Request a consultation", fields: [{ id: "name" }, { id: "phone" }] },
  routing: { withinMinutes: 30 },
  followUp: { afterMinutes: 1440, messageTemplate: "Thanks for reaching out. We will call you back soon." },
  branding: { accent: "#1f4e79" },
};

function withPath(definition: JsonObject, mutate: (copy: JsonObject) => void): JsonObject {
  const copy = JSON.parse(JSON.stringify(definition)) as JsonObject;
  mutate(copy);
  return copy;
}

describe("System Versions: one agency source, two client Versions", () => {
  let versions: SystemVersions;
  let mooney: VersionLineage;
  let lakeside: VersionLineage;
  let clock = 0;

  beforeEach(async () => {
    clock = 0;
    const connections = createInMemoryConnectionOwnership({
      conn_mooney_mail: MOONEY,
      conn_mooney_calendar: MOONEY,
      conn_lakeside_mail: LAKESIDE,
      conn_agency_mail: AGENCY,
    });
    versions = createSystemVersions({
      store: createInMemoryVersionStore(),
      connections,
      now: () => new Date(Date.UTC(2026, 9, 4, 12, 0, clock++)).toISOString(),
    });
    const v1 = await versions.publishSourceRevision(agencyOwner, {
      source: SOURCE,
      definition: intakeV1,
      requires: { bindingKinds: ["email_sender"] },
      summary: "Consultation intake",
    });
    await versions.shareSource(agencyOwner, SOURCE, MOONEY);
    await versions.shareSource(agencyOwner, SOURCE, LAKESIDE);

    mooney = await versions.createVersion(mooneyOwner, {
      source: v1.source,
      version: { businessId: MOONEY, systemId: "sys_mooney_intake" },
      context: { kind: "agency_client", label: "The Mooney Firm, Buffalo" },
    });
    mooney = await versions.setOverride(mooneyOwner, mooney.id, { path: "branding.accent", value: "#0b3d2e", expectedRowRevision: mooney.rowRevision });
    mooney = await versions.setOverride(mooneyOwner, mooney.id, { path: "form.title", value: "Talk to a Buffalo attorney", expectedRowRevision: mooney.rowRevision });
    mooney = await versions.bindAccount(mooneyOwner, mooney.id, { kind: "email_sender", connectionId: "conn_mooney_mail", expectedRowRevision: mooney.rowRevision });
    mooney = await versions.putLocalData(mooneyOwner, mooney.id, { key: "practiceAreas", value: ["estate planning"], expectedRowRevision: mooney.rowRevision });
    mooney = await versions.release(mooneyOwner, mooney.id, { expectedRowRevision: mooney.rowRevision });

    lakeside = await versions.createVersion(lakesideOwner, {
      source: v1.source,
      version: { businessId: LAKESIDE, systemId: "sys_lakeside_intake" },
      context: { kind: "agency_client", label: "Lakeside Dental" },
    });
    // Lakeside calls every lead by phone, so it turns automated follow-up off.
    lakeside = await versions.setOverride(lakesideOwner, lakeside.id, { path: "followUp", value: null, expectedRowRevision: lakeside.rowRevision });
    lakeside = await versions.setOverride(lakesideOwner, lakeside.id, { path: "routing.withinMinutes", value: 10, expectedRowRevision: lakeside.rowRevision });
    lakeside = await versions.bindAccount(lakesideOwner, lakeside.id, { kind: "email_sender", connectionId: "conn_lakeside_mail", expectedRowRevision: lakeside.rowRevision });
    lakeside = await versions.putLocalData(lakesideOwner, lakeside.id, { key: "chairs", value: 4, expectedRowRevision: lakeside.rowRevision });
    lakeside = await versions.release(lakesideOwner, lakeside.id, { expectedRowRevision: lakeside.rowRevision });
  });

  it("gives each client its own System identity, overrides and bindings, and copies no bindings from the source", async () => {
    const m = await versions.readVersion(mooneyOwner, mooney.id);
    const l = await versions.readVersion(lakesideOwner, lakeside.id);
    expect(m.version).toEqual({ businessId: MOONEY, systemId: "sys_mooney_intake" });
    expect(l.version).toEqual({ businessId: LAKESIDE, systemId: "sys_lakeside_intake" });
    expect(m.source).toEqual(SOURCE);
    expect(m.overrides.map((item) => item.path).sort()).toEqual(["branding.accent", "form.title"]);
    expect(l.overrides.map((item) => item.path).sort()).toEqual(["followUp", "routing.withinMinutes"]);
    expect(m.bindings).toEqual([expect.objectContaining({ kind: "email_sender", connectionId: "conn_mooney_mail", ownerBusinessId: MOONEY })]);
    expect(l.bindings).toEqual([expect.objectContaining({ kind: "email_sender", connectionId: "conn_lakeside_mail", ownerBusinessId: LAKESIDE })]);
    expect(m.workingDefinition.followUp).toEqual(intakeV1.followUp);
    expect(l.workingDefinition.followUp).toBeNull();
  });

  it("offers a common fix to both: Mooney applies cleanly, Lakeside is blocked by its incompatible override", async () => {
    const fixed = withPath(intakeV1, (copy) => {
      (copy.followUp as JsonObject).messageTemplate = "Thanks for reaching out. We will call you back within one business day.";
    });
    await versions.publishSourceRevision(agencyOwner, { source: SOURCE, definition: fixed, requires: { bindingKinds: ["email_sender"] }, summary: "Promise a callback window" });

    // Publishing changes nothing locally. Both see it as available.
    expect((await versions.readVersion(mooneyOwner, mooney.id)).workingDefinition).toEqual((await versions.readVersion(mooneyOwner, mooney.id)).releases[0]!.definition);
    const [mooneyOffer] = await versions.listAvailableImprovements(mooneyOwner, mooney.id);
    const [lakesideOffer] = await versions.listAvailableImprovements(lakesideOwner, lakeside.id);
    expect(mooneyOffer).toMatchObject({ sourceRevision: 2, status: "auto_applicable", conflicts: [], missingBindings: [] });
    expect(lakesideOffer).toMatchObject({
      sourceRevision: 2,
      status: "blocked",
      conflicts: [{ path: "followUp", reason: "incompatible_override", local: null }],
    });

    mooney = await versions.adoptImprovement(mooneyOwner, mooney.id, { revision: 2, expectedRowRevision: mooney.rowRevision });
    const adopted = await versions.readVersion(mooneyOwner, mooney.id);
    expect(adopted.baselineRevision).toBe(2);
    expect((adopted.workingDefinition.followUp as JsonObject).messageTemplate).toContain("within one business day");
    expect(adopted.workingDefinition.branding).toEqual({ accent: "#0b3d2e" });
    expect((adopted.workingDefinition.form as JsonObject).title).toBe("Talk to a Buffalo attorney");
    // Adoption is not a release; the live release is unchanged until Mooney releases.
    expect(adopted.currentRelease).toBe(1);
    expect((adopted.releases[0]!.definition.followUp as JsonObject).messageTemplate).toBe("Thanks for reaching out. We will call you back soon.");

    await expect(versions.adoptImprovement(lakesideOwner, lakeside.id, { revision: 2, expectedRowRevision: lakeside.rowRevision }))
      .rejects.toThrow(VersionConflictError);
    const untouched = await versions.readVersion(lakesideOwner, lakeside.id);
    expect(untouched.baselineRevision).toBe(1);
    expect(untouched.workingDefinition.followUp).toBeNull();

    // Lakeside chooses. It stays pinned first, then later keeps its local choice explicitly.
    lakeside = await versions.declineImprovement(lakesideOwner, lakeside.id, { revision: 2, reason: "We follow up by phone.", expectedRowRevision: lakeside.rowRevision });
    lakeside = await versions.adoptImprovement(lakesideOwner, lakeside.id, {
      revision: 2,
      expectedRowRevision: lakeside.rowRevision,
      resolutions: [{ path: "followUp", choice: "keep_local" }],
    });
    const kept = await versions.readVersion(lakesideOwner, lakeside.id);
    expect(kept.baselineRevision).toBe(2);
    expect(kept.workingDefinition.followUp).toBeNull();
    expect(kept.decisions.map((decision) => decision.choice)).toEqual(["declined", "adopted"]);
  });

  it("blocks an improvement that needs an account the Version has not connected, until it binds its own", async () => {
    const withCalendar = withPath(intakeV1, (copy) => {
      copy.scheduling = { offerSlots: true };
    });
    await versions.publishSourceRevision(agencyOwner, { source: SOURCE, definition: withCalendar, requires: { bindingKinds: ["calendar", "email_sender"] }, summary: "Offer booking slots" });
    expect(await versions.compareImprovement(mooneyOwner, mooney.id, 2)).toMatchObject({ status: "blocked", conflicts: [], missingBindings: ["calendar"] });
    await expect(versions.adoptImprovement(mooneyOwner, mooney.id, { revision: 2, expectedRowRevision: mooney.rowRevision })).rejects.toThrow(VersionIncompatibleError);

    // Lakeside's or the agency's calendar can never stand in.
    await expect(versions.bindAccount(mooneyOwner, mooney.id, { kind: "calendar", connectionId: "conn_lakeside_mail", expectedRowRevision: mooney.rowRevision })).rejects.toThrow(VersionAccessError);
    await expect(versions.bindAccount(mooneyOwner, mooney.id, { kind: "calendar", connectionId: "conn_agency_mail", expectedRowRevision: mooney.rowRevision })).rejects.toThrow(VersionAccessError);

    mooney = await versions.bindAccount(mooneyOwner, mooney.id, { kind: "calendar", connectionId: "conn_mooney_calendar", expectedRowRevision: mooney.rowRevision });
    mooney = await versions.adoptImprovement(mooneyOwner, mooney.id, { revision: 2, expectedRowRevision: mooney.rowRevision });
    expect((await versions.readVersion(mooneyOwner, mooney.id)).workingDefinition.scheduling).toEqual({ offerSlots: true });
  });

  it("asks for a choice when both sides edited the same value, and take_upstream drops the local override", async () => {
    const retitled = withPath(intakeV1, (copy) => {
      (copy.form as JsonObject).title = "Book a free consultation";
    });
    await versions.publishSourceRevision(agencyOwner, { source: SOURCE, definition: retitled, requires: { bindingKinds: ["email_sender"] }, summary: "Clearer title" });
    const comparison = await versions.compareImprovement(mooneyOwner, mooney.id, 2);
    expect(comparison.conflicts).toEqual([expect.objectContaining({ path: "form.title", reason: "overlapping_edit", local: "Talk to a Buffalo attorney", upstream: "Book a free consultation" })]);
    await expect(versions.adoptImprovement(mooneyOwner, mooney.id, {
      revision: 2,
      expectedRowRevision: mooney.rowRevision,
      resolutions: [{ path: "form.fields", choice: "take_upstream" }],
    })).rejects.toThrow(VersionValidationError);
    mooney = await versions.adoptImprovement(mooneyOwner, mooney.id, {
      revision: 2,
      expectedRowRevision: mooney.rowRevision,
      resolutions: [{ path: "form.title", choice: "take_upstream" }],
    });
    const view = await versions.readVersion(mooneyOwner, mooney.id);
    expect((view.workingDefinition.form as JsonObject).title).toBe("Book a free consultation");
    expect(view.overrides.map((item) => item.path)).toEqual(["branding.accent"]);
  });

  it("keeps release history per Version, separate from source revisions", async () => {
    const fixed = withPath(intakeV1, (copy) => {
      (copy.routing as JsonObject).withinMinutes = 20;
    });
    await versions.publishSourceRevision(agencyOwner, { source: SOURCE, definition: fixed, requires: { bindingKinds: ["email_sender"] }, summary: "Faster routing" });
    mooney = await versions.adoptImprovement(mooneyOwner, mooney.id, { revision: 2, expectedRowRevision: mooney.rowRevision });
    mooney = await versions.release(mooneyOwner, mooney.id, { expectedRowRevision: mooney.rowRevision });
    const m = await versions.readVersion(mooneyOwner, mooney.id);
    expect(m.releases.map((release) => [release.number, release.baselineRevision])).toEqual([[1, 1], [2, 2]]);
    expect(m.currentRelease).toBe(2);
    expect((await versions.readVersion(lakesideOwner, lakeside.id)).releases.map((release) => release.number)).toEqual([1]);
    await expect(versions.release(mooneyOwner, mooney.id, { expectedRowRevision: mooney.rowRevision })).rejects.toThrow(VersionValidationError);
  });

  it("isolates the two clients from each other", async () => {
    await expect(versions.readVersion(lakesideOwner, mooney.id)).rejects.toThrow(VersionAccessError);
    await expect(versions.readVersion(mooneyOwner, lakeside.id)).rejects.toThrow(VersionAccessError);
    await expect(versions.setOverride(mooneyOwner, lakeside.id, { path: "branding.accent", value: "#000000", expectedRowRevision: lakeside.rowRevision })).rejects.toThrow(VersionAccessError);
    await expect(versions.listAvailableImprovements(lakesideOwner, mooney.id)).rejects.toThrow(VersionAccessError);
    await expect(versions.bindAccount(lakesideOwner, lakeside.id, { kind: "email_sender", connectionId: "conn_mooney_mail", expectedRowRevision: lakeside.rowRevision })).rejects.toThrow(VersionAccessError);
    // A grant to one client does not open the other.
    mooney = await versions.grantAccess(mooneyOwner, mooney.id, { granteeBusinessId: AGENCY, scope: "lineage_and_data", expectedRowRevision: mooney.rowRevision });
    await expect(versions.readVersion(lakesideOwner, mooney.id)).rejects.toThrow(VersionAccessError);
    expect(JSON.stringify(await versions.readVersion(lakesideOwner, lakeside.id))).not.toContain("conn_mooney");
  });

  it("does not let the source author read a client Version without that client's grant, and never shows bindings", async () => {
    await expect(versions.readVersion(agencyOwner, mooney.id)).rejects.toThrow(VersionAccessError);
    await expect(versions.setOverride(agencyOwner, mooney.id, { path: "branding.accent", value: "#ffffff", expectedRowRevision: mooney.rowRevision })).rejects.toThrow(VersionAccessError);

    mooney = await versions.grantAccess(mooneyOwner, mooney.id, { granteeBusinessId: AGENCY, scope: "lineage", expectedRowRevision: mooney.rowRevision });
    const lineageView = await versions.readVersion(agencyOwner, mooney.id);
    expect(lineageView.access).toBe("lineage");
    expect(lineageView.overrides.map((item) => item.path).sort()).toEqual(["branding.accent", "form.title"]);
    expect(lineageView.bindings).toBeUndefined();
    expect(lineageView.localData).toBeUndefined();
    expect(lineageView.grants).toBeUndefined();

    mooney = await versions.grantAccess(mooneyOwner, mooney.id, { granteeBusinessId: AGENCY, scope: "lineage_and_data", expectedRowRevision: mooney.rowRevision });
    const dataView = await versions.readVersion(agencyOwner, mooney.id);
    expect(dataView.localData).toEqual({ practiceAreas: ["estate planning"] });
    expect(dataView.bindings).toBeUndefined();
    expect(JSON.stringify(dataView)).not.toContain("conn_mooney_mail");

    mooney = await versions.revokeAccess(mooneyOwner, mooney.id, { granteeBusinessId: AGENCY, expectedRowRevision: mooney.rowRevision });
    await expect(versions.readVersion(agencyOwner, mooney.id)).rejects.toThrow(VersionAccessError);
  });

  it("rejects stale writes, member-only management and unshared sources", async () => {
    const stale = mooney.rowRevision - 1;
    await expect(versions.setOverride(mooneyOwner, mooney.id, { path: "branding.accent", value: "#111111", expectedRowRevision: stale })).rejects.toThrow(VersionStaleError);
    await expect(versions.setOverride(mooneyMember, mooney.id, { path: "branding.accent", value: "#111111", expectedRowRevision: mooney.rowRevision })).rejects.toThrow(VersionAccessError);
    expect((await versions.readVersion(mooneyMember, mooney.id)).access).toBe("owner");

    const stranger: VersionActor = { userId: "u_other", memberships: [{ businessId: "biz_other", role: "owner" }] };
    await expect(versions.createVersion(stranger, {
      source: { ...SOURCE, revisionId: "source_revision_0001", number: 1 },
      version: { businessId: "biz_other", systemId: "sys_other" },
      context: { kind: "location", label: "Rochester" },
    })).rejects.toThrow(VersionAccessError);
    // The revision number alone is not enough: the ref must name that exact revision.
    await expect(versions.createVersion(mooneyOwner, {
      source: { ...SOURCE, revisionId: "not_that_revision", number: 1 },
      version: { businessId: MOONEY, systemId: "sys_mooney_second" },
      context: { kind: "location", label: "Amherst" },
    })).rejects.toThrow(VersionValidationError);

    await versions.unshareSource(agencyOwner, SOURCE, LAKESIDE);
    await versions.publishSourceRevision(agencyOwner, { source: SOURCE, definition: withPath(intakeV1, (copy) => { copy.extra = true; }), requires: { bindingKinds: ["email_sender"] }, summary: "Extra" });
    expect(await versions.listAvailableImprovements(lakesideOwner, lakeside.id)).toEqual([]);
    expect(await versions.listAvailableImprovements(mooneyOwner, mooney.id)).toHaveLength(1);
  });

  it("refuses to publish records, bindings or secrets in a shareable definition", async () => {
    await expect(versions.publishSourceRevision(agencyOwner, { source: SOURCE, definition: { ...intakeV1, credentials: { user: "x" } }, summary: "bad" })).rejects.toThrow(/credentials/);
    await expect(versions.publishSourceRevision(agencyOwner, { source: SOURCE, definition: { ...intakeV1, bindings: [] }, summary: "bad" })).rejects.toThrow(/bindings/);
    await expect(versions.publishSourceRevision(agencyOwner, { source: SOURCE, definition: { ...intakeV1, note: "api_key=abc123" }, summary: "bad" })).rejects.toThrow(/secret/);
    await expect(versions.setOverride(mooneyOwner, mooney.id, { path: "branding.token", value: "x", expectedRowRevision: mooney.rowRevision })).rejects.toThrow(VersionValidationError);
  });
});
