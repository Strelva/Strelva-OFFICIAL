import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  VersionAccessError,
  VersionConflictError,
  VersionIncompatibleError,
  VersionStaleError,
  VersionValidationError,
  createSystemVersions,
  type JsonObject,
} from "@/platform/system-versions";
import { memoryHarness, postgresHarness, type Harness } from "./support/versions-postgres";

/**
 * One contract for every Version store. It runs on the in-memory reference
 * store here, and on createSupabaseVersionStore against a throwaway local
 * PostgreSQL cluster when STRELVA_VERSIONS_PSQL is set (scripts/
 * check-workspace-sql.sh sets it after applying the migrations). Fixtures are
 * fictional. Nothing here can reach a remote database.
 */

const intakeV1: JsonObject = {
  form: { title: "Request a consultation", fields: [{ id: "name" }, { id: "phone" }] },
  routing: { withinMinutes: 30 },
  followUp: { afterMinutes: 1440, messageTemplate: "We will call you back soon." },
  branding: { accent: "#1f4e79" },
};
const withFollowUp = (message: string): JsonObject => ({ ...intakeV1, followUp: { afterMinutes: 1440, messageTemplate: message } });

let clock = 0;
const now = () => new Date(Date.UTC(2026, 9, 7, 12, 0, 0, clock++)).toISOString();

async function agencyFixture(h: Harness) {
  const agency = await h.business("Northside Studio", "agency");
  const mooney = await h.business("The Mooney Firm");
  const lakeside = await h.business("Lakeside Dental");
  const agencyOwner = await h.actor([{ businessId: agency, role: "owner" }]);
  const mooneyOwner = await h.actor([{ businessId: mooney, role: "owner" }]);
  const mooneyMember = await h.actor([{ businessId: mooney, role: "member" }]);
  const lakesideOwner = await h.actor([{ businessId: lakeside, role: "owner" }]);
  const stranger = await h.actor([]);
  const source = await h.system(agency, "Inquiry intake");
  const mooneySystem = await h.system(mooney, "Inquiries");
  const lakesideSystem = await h.system(lakeside, "Inquiries");
  const versions = createSystemVersions({ store: h.store, connections: h.connections, now });
  const v1 = await versions.publishSourceRevision(agencyOwner, { source, definition: intakeV1, requires: { bindingKinds: ["booking_calendar"] }, summary: "Consultation intake", label: "1.0.0" });
  await versions.shareSource(agencyOwner, source, mooney);
  await versions.shareSource(agencyOwner, source, lakeside);
  return { agency, mooney, lakeside, agencyOwner, mooneyOwner, mooneyMember, lakesideOwner, stranger, source, mooneySystem, lakesideSystem, versions, v1 };
}

function contract(name: string, make: () => Harness) {
  describe(`Version store contract: ${name}`, () => {
    it("creates a Version owned by its business, copying only the definition, and releases it", async () => {
      const h = make();
      const f = await agencyFixture(h);
      let mooney = await f.versions.createVersion(f.mooneyOwner, { source: f.v1.source, version: f.mooneySystem, context: { kind: "agency_client", label: "The Mooney Firm, Buffalo" } });
      expect(mooney).toMatchObject({ version: f.mooneySystem, source: f.source, baseline: { revision: 1, definition: intakeV1 }, overrides: [], bindings: [], grants: [], localData: {}, rowRevision: 1 });
      mooney = await f.versions.setOverride(f.mooneyOwner, mooney.id, { path: "branding.accent", value: "#0b3d2e", expectedRowRevision: mooney.rowRevision });
      const calendar = await h.connection(f.mooney, "google");
      mooney = await f.versions.bindAccount(f.mooneyOwner, mooney.id, { kind: "booking_calendar", connectionId: calendar, expectedRowRevision: mooney.rowRevision });
      mooney = await f.versions.putLocalData(f.mooneyMember, mooney.id, { key: "practiceAreas", value: ["estate planning"], expectedRowRevision: mooney.rowRevision });
      mooney = await f.versions.release(f.mooneyOwner, mooney.id, { expectedRowRevision: mooney.rowRevision });
      const view = await f.versions.readVersion(f.mooneyOwner, mooney.id);
      expect(view.access).toBe("owner");
      expect(view.overrides.map((item) => item.path)).toEqual(["branding.accent"]);
      expect(view.bindings).toEqual([expect.objectContaining({ kind: "booking_calendar", connectionId: calendar, ownerBusinessId: f.mooney })]);
      expect(view.localData).toEqual({ practiceAreas: ["estate planning"] });
      expect(view.currentRelease).toBe(1);
      expect(view.releases[0]!.definition).toEqual({ ...intakeV1, branding: { accent: "#0b3d2e" } });
      expect(mooney.rowRevision).toBe(5);
      if (h.spineRevisions) {
        // History and the spine agree: the release is a system_revisions row and the current pointer.
        expect(await h.spineRevisions(f.mooneySystem.systemId)).toEqual([{ number: 1, kind: "system_version_release" }]);
        expect(await h.currentRevision!(f.mooneySystem.systemId)).toBe(1);
      }
    });

    it("keeps published revisions append-only and numbered", async () => {
      const h = make();
      const f = await agencyFixture(h);
      const v2 = await f.versions.publishSourceRevision(f.agencyOwner, { source: f.source, definition: withFollowUp("Within one business day."), summary: "Callback window" });
      expect(v2.source.number).toBe(2);
      await expect(h.store.insertRevision(f.agencyOwner, { ...v2, source: { ...v2.source, revisionId: randomUUID() } })).rejects.toBeInstanceOf(VersionStaleError);
      expect((await h.store.listRevisions(f.agencyOwner, f.source)).map((item) => item.source.number)).toEqual([1, 2]);
      expect((await h.store.getRevision(f.agencyOwner, f.source, 1))?.label).toBe("1.0.0");
      // Only the source business publishes.
      await expect(f.versions.publishSourceRevision(f.mooneyOwner, { source: f.source, definition: intakeV1, summary: "Taken over" })).rejects.toBeInstanceOf(VersionAccessError);
    });

    it("compare-and-sets every change on rowRevision", async () => {
      const h = make();
      const f = await agencyFixture(h);
      const mooney = await f.versions.createVersion(f.mooneyOwner, { source: f.v1.source, version: f.mooneySystem, context: { kind: "agency_client", label: "Mooney" } });
      await f.versions.setOverride(f.mooneyOwner, mooney.id, { path: "branding.accent", value: "#111111", expectedRowRevision: 1 });
      await expect(f.versions.setOverride(f.mooneyOwner, mooney.id, { path: "branding.accent", value: "#222222", expectedRowRevision: 1 })).rejects.toBeInstanceOf(VersionStaleError);
      const current = (await h.store.getLineage(f.mooneyOwner, mooney.id))!;
      await expect(h.store.updateLineage(f.mooneyOwner, { ...current, localData: { x: 1 } }, current.rowRevision - 1)).rejects.toBeInstanceOf(VersionStaleError);
    });

    it("refuses strangers, the source author without a grant, and members changing anything but local data", async () => {
      const h = make();
      const f = await agencyFixture(h);
      const mooney = await f.versions.createVersion(f.mooneyOwner, { source: f.v1.source, version: f.mooneySystem, context: { kind: "agency_client", label: "Mooney" } });
      await expect(f.versions.readVersion(f.stranger, mooney.id)).rejects.toBeInstanceOf(VersionAccessError);
      await expect(f.versions.readVersion(f.agencyOwner, mooney.id)).rejects.toBeInstanceOf(VersionAccessError);
      await expect(f.versions.readVersion(f.lakesideOwner, mooney.id)).rejects.toBeInstanceOf(VersionAccessError);
      await expect(f.versions.setOverride(f.agencyOwner, mooney.id, { path: "form.title", value: "x", expectedRowRevision: 1 })).rejects.toBeInstanceOf(VersionAccessError);
      await expect(f.versions.setOverride(f.mooneyMember, mooney.id, { path: "form.title", value: "x", expectedRowRevision: 1 })).rejects.toBeInstanceOf(VersionAccessError);
      // A Version for a business the source was never shared with is refused.
      const other = await h.business("Unshared Bakery");
      const otherOwner = await h.actor([{ businessId: other, role: "owner" }]);
      await expect(f.versions.createVersion(otherOwner, { source: f.v1.source, version: await h.system(other, "Inquiries"), context: { kind: "agency_client", label: "Bakery" } })).rejects.toBeInstanceOf(VersionAccessError);
      // A Version cannot be created in someone else's business.
      await expect(f.versions.createVersion(f.lakesideOwner, { source: f.v1.source, version: f.mooneySystem, context: { kind: "agency_client", label: "Mooney" } })).rejects.toBeInstanceOf(VersionAccessError);
      // A business does not get a second Version on one System.
      await expect(f.versions.createVersion(f.mooneyOwner, { source: f.v1.source, version: f.mooneySystem, context: { kind: "agency_client", label: "Again" } })).rejects.toBeInstanceOf(VersionValidationError);
    });

    it("reserves lineage and data grants for the business owner, including direct database saves", async () => {
      const h = make();
      const f = await agencyFixture(h);
      const admin = await h.actor([{ businessId: f.mooney, role: "admin" }]);
      let version = await f.versions.createVersion(f.mooneyOwner, { source: f.v1.source, version: f.mooneySystem, context: { kind: "agency_client", label: "Mooney" } });
      await expect(f.versions.grantAccess(admin, version.id, { granteeBusinessId: f.agency, scope: "lineage_and_data", expectedRowRevision: version.rowRevision })).rejects.toBeInstanceOf(VersionAccessError);
      if (h.db) {
        const forged = { ...version, grants: [{ granteeBusinessId: f.agency, scope: "lineage" as const, grantedBy: admin.userId, grantedAt: now() }] };
        await expect(h.store.updateLineage(admin, forged, version.rowRevision)).rejects.toBeInstanceOf(VersionAccessError);
      }
      expect((await f.versions.readVersion(f.mooneyOwner, version.id)).grants).toEqual([]);
      version = await f.versions.grantAccess(f.mooneyOwner, version.id, { granteeBusinessId: f.agency, scope: "lineage", expectedRowRevision: version.rowRevision });
      await expect(f.versions.revokeAccess(admin, version.id, { granteeBusinessId: f.agency, expectedRowRevision: version.rowRevision })).rejects.toBeInstanceOf(VersionAccessError);
      if (h.db) {
        const revoked = { ...version, grants: version.grants.map(grant => ({ ...grant, revokedAt: now() })) };
        await expect(h.store.updateLineage(admin, revoked, version.rowRevision)).rejects.toBeInstanceOf(VersionAccessError);
        expect((await h.db.rpc("save_system_version_owner_grants_core", { p_user_id: admin.userId, p_verified_email: admin.verifiedEmail,
          p_version_id: version.id, p_expected_row_revision: version.rowRevision, p_lineage: revoked })).error?.message).toContain("permission denied");
      }
      // Normal draft edits keep the owner's exact grants and remain permitted.
      version = await f.versions.setOverride(admin, version.id, { path: "form.title", value: "Client wording", expectedRowRevision: version.rowRevision });
      expect(version.grants).toHaveLength(1);
      await expect(f.versions.readVersion(f.agencyOwner, version.id)).resolves.toMatchObject({ access: "lineage" });
      await f.versions.revokeAccess(f.mooneyOwner, version.id, { granteeBusinessId: f.agency, expectedRowRevision: version.rowRevision });
      await expect(f.versions.readVersion(f.agencyOwner, version.id)).rejects.toBeInstanceOf(VersionAccessError);
    }, 30_000);

    it("shows lineage to a granted business without bindings, and data only with lineage_and_data", async () => {
      const h = make();
      const f = await agencyFixture(h);
      let mooney = await f.versions.createVersion(f.mooneyOwner, { source: f.v1.source, version: f.mooneySystem, context: { kind: "agency_client", label: "Mooney" } });
      const calendar = await h.connection(f.mooney, "google");
      mooney = await f.versions.bindAccount(f.mooneyOwner, mooney.id, { kind: "booking_calendar", connectionId: calendar, expectedRowRevision: mooney.rowRevision });
      mooney = await f.versions.putLocalData(f.mooneyOwner, mooney.id, { key: "chairs", value: 4, expectedRowRevision: mooney.rowRevision });
      mooney = await f.versions.grantAccess(f.mooneyOwner, mooney.id, { granteeBusinessId: f.agency, scope: "lineage", expectedRowRevision: mooney.rowRevision });
      const seen = await f.versions.readVersion(f.agencyOwner, mooney.id);
      expect(seen.access).toBe("lineage");
      expect(seen.bindings).toBeUndefined();
      expect(seen.localData).toBeUndefined();
      expect(JSON.stringify(seen)).not.toContain(calendar);
      mooney = await f.versions.grantAccess(f.mooneyOwner, mooney.id, { granteeBusinessId: f.agency, scope: "lineage_and_data", expectedRowRevision: mooney.rowRevision });
      expect((await f.versions.readVersion(f.agencyOwner, mooney.id)).localData).toEqual({ chairs: 4 });
      mooney = await f.versions.revokeAccess(f.mooneyOwner, mooney.id, { granteeBusinessId: f.agency, expectedRowRevision: mooney.rowRevision });
      await expect(f.versions.readVersion(f.agencyOwner, mooney.id)).rejects.toBeInstanceOf(VersionAccessError);
      expect(mooney.grants.filter((grant) => !grant.revokedAt)).toEqual([]);
      expect(mooney.grants).toHaveLength(2);
    });

    it("binds only this business's own accounts, and one account to one Version", async () => {
      const h = make();
      const f = await agencyFixture(h);
      let mooney = await f.versions.createVersion(f.mooneyOwner, { source: f.v1.source, version: f.mooneySystem, context: { kind: "agency_client", label: "Mooney" } });
      let lakeside = await f.versions.createVersion(f.lakesideOwner, { source: f.v1.source, version: f.lakesideSystem, context: { kind: "agency_client", label: "Lakeside" } });
      const lakesideCalendar = await h.connection(f.lakeside, "google");
      await expect(f.versions.bindAccount(f.mooneyOwner, mooney.id, { kind: "booking_calendar", connectionId: lakesideCalendar, expectedRowRevision: mooney.rowRevision })).rejects.toBeInstanceOf(VersionAccessError);
      await expect(f.versions.bindAccount(f.mooneyOwner, mooney.id, { kind: "booking_calendar", connectionId: "calendar:not-a-connection", expectedRowRevision: mooney.rowRevision })).rejects.toBeInstanceOf(VersionAccessError);
      lakeside = await f.versions.bindAccount(f.lakesideOwner, lakeside.id, { kind: "booking_calendar", connectionId: lakesideCalendar, expectedRowRevision: lakeside.rowRevision });
      expect(lakeside.bindings).toHaveLength(1);
      // Same business, two Versions of one hidden source: each keeps its own calendar.
      const camillusSystem = await h.system(f.mooney, "Camillus site");
      const camillus = await f.versions.createVersion(f.mooneyOwner, { source: f.v1.source, version: camillusSystem, context: { kind: "location", label: "Camillus" } });
      const google = await h.connection(f.mooney, "google");
      await f.versions.bindAccount(f.mooneyOwner, camillus.id, { kind: "booking_calendar", connectionId: google, expectedRowRevision: camillus.rowRevision });
      await expect(f.versions.bindAccount(f.mooneyOwner, mooney.id, { kind: "booking_calendar", connectionId: google, expectedRowRevision: mooney.rowRevision })).rejects.toBeInstanceOf(VersionValidationError);
      const outlook = await h.connection(f.mooney, "outlook");
      mooney = await f.versions.bindAccount(f.mooneyOwner, mooney.id, { kind: "booking_calendar", connectionId: outlook, expectedRowRevision: mooney.rowRevision });
      expect(mooney.bindings.map((item) => item.connectionId)).toEqual([outlook]);
    });

    it("offers an improvement as a three-way compare and adopts exactly the preview plus chosen values", async () => {
      const h = make();
      const f = await agencyFixture(h);
      let mooney = await f.versions.createVersion(f.mooneyOwner, { source: f.v1.source, version: f.mooneySystem, context: { kind: "agency_client", label: "Mooney" } });
      mooney = await f.versions.setOverride(f.mooneyOwner, mooney.id, { path: "followUp.messageTemplate", value: "We'll call you within one business day", expectedRowRevision: mooney.rowRevision });
      mooney = await f.versions.setOverride(f.mooneyOwner, mooney.id, { path: "branding.accent", value: "#0b3d2e", expectedRowRevision: mooney.rowRevision });
      await f.versions.publishSourceRevision(f.agencyOwner, { source: f.source, definition: { ...withFollowUp("A new default follow-up."), routing: { withinMinutes: 15 } }, requires: { bindingKinds: ["booking_calendar"] }, summary: "Faster routing, new follow-up" });

      const [offer] = await f.versions.listAvailableImprovements(f.mooneyOwner, mooney.id);
      expect(offer).toMatchObject({ sourceRevision: 2, status: "blocked", missingBindings: ["booking_calendar"] });
      expect(offer!.conflicts).toEqual([expect.objectContaining({ path: "followUp.messageTemplate", local: "We'll call you within one business day", upstream: "A new default follow-up." })]);
      await expect(f.versions.adoptImprovement(f.mooneyOwner, mooney.id, { revision: 2, expectedRowRevision: mooney.rowRevision })).rejects.toBeInstanceOf(VersionIncompatibleError);
      mooney = await f.versions.bindAccount(f.mooneyOwner, mooney.id, { kind: "booking_calendar", connectionId: await h.connection(f.mooney, "google"), expectedRowRevision: mooney.rowRevision });
      await expect(f.versions.adoptImprovement(f.mooneyOwner, mooney.id, { revision: 2, expectedRowRevision: mooney.rowRevision })).rejects.toBeInstanceOf(VersionConflictError);

      const preview = (await f.versions.compareImprovement(f.mooneyOwner, mooney.id, 2)).preview;
      mooney = await f.versions.adoptImprovement(f.mooneyOwner, mooney.id, { revision: 2, expectedRowRevision: mooney.rowRevision, resolutions: [{ path: "followUp.messageTemplate", choice: "keep_local" }] });
      const view = await f.versions.readVersion(f.mooneyOwner, mooney.id);
      expect(view.workingDefinition).toEqual(preview);
      expect(view.workingDefinition.routing).toEqual({ withinMinutes: 15 });
      expect((view.workingDefinition.followUp as JsonObject).messageTemplate).toBe("We'll call you within one business day");
      expect(view.baselineRevision).toBe(2);
      // Adoption never releases.
      expect(view.currentRelease).toBeNull();
      expect(view.decisions).toEqual([expect.objectContaining({ sourceRevision: 2, choice: "adopted" })]);
      expect(await f.versions.listAvailableImprovements(f.mooneyOwner, mooney.id)).toEqual([]);
    });

    it("records a decline, re-offers the change with the next revision, and stops offering after unshare", async () => {
      const h = make();
      const f = await agencyFixture(h);
      let lakeside = await f.versions.createVersion(f.lakesideOwner, { source: f.v1.source, version: f.lakesideSystem, context: { kind: "agency_client", label: "Lakeside" } });
      lakeside = await f.versions.bindAccount(f.lakesideOwner, lakeside.id, { kind: "booking_calendar", connectionId: await h.connection(f.lakeside, "google"), expectedRowRevision: lakeside.rowRevision });
      lakeside = await f.versions.release(f.lakesideOwner, lakeside.id, { expectedRowRevision: lakeside.rowRevision });
      await f.versions.publishSourceRevision(f.agencyOwner, { source: f.source, definition: withFollowUp("Two."), summary: "Two" });
      lakeside = await f.versions.declineImprovement(f.lakesideOwner, lakeside.id, { revision: 2, reason: "We call every lead ourselves.", expectedRowRevision: lakeside.rowRevision });
      expect(lakeside.decisions).toEqual([expect.objectContaining({ sourceRevision: 2, choice: "declined", reason: "We call every lead ourselves." })]);
      await f.versions.publishSourceRevision(f.agencyOwner, { source: f.source, definition: withFollowUp("Three."), summary: "Three" });
      const offers = await f.versions.listAvailableImprovements(f.lakesideOwner, lakeside.id);
      expect(offers.map((item) => item.sourceRevision)).toEqual([2, 3]);
      expect(offers[1]!.changes.map((change) => change.path)).toContain("followUp.messageTemplate");
      await f.versions.unshareSource(f.agencyOwner, f.source, f.lakeside);
      expect(await f.versions.listAvailableImprovements(f.lakesideOwner, lakeside.id)).toEqual([]);
      // The Version keeps its definition and releases.
      const kept = await f.versions.readVersion(f.lakesideOwner, lakeside.id);
      expect(kept.releases).toHaveLength(1);
      expect(kept.baselineRevision).toBe(1);
    });

    it("refuses a release when nothing changed and numbers releases per Version", async () => {
      const h = make();
      const f = await agencyFixture(h);
      let mooney = await f.versions.createVersion(f.mooneyOwner, { source: f.v1.source, version: f.mooneySystem, context: { kind: "agency_client", label: "Mooney" } });
      mooney = await f.versions.release(f.mooneyOwner, mooney.id, { expectedRowRevision: mooney.rowRevision });
      await expect(f.versions.release(f.mooneyOwner, mooney.id, { expectedRowRevision: mooney.rowRevision })).rejects.toBeInstanceOf(VersionValidationError);
      mooney = await f.versions.setOverride(f.mooneyOwner, mooney.id, { path: "routing.withinMinutes", value: 5, expectedRowRevision: mooney.rowRevision });
      mooney = await f.versions.release(f.mooneyOwner, mooney.id, { expectedRowRevision: mooney.rowRevision });
      expect(mooney.releases.map((item) => item.number)).toEqual([1, 2]);
      await expect(f.versions.release(f.mooneyMember, mooney.id, { expectedRowRevision: mooney.rowRevision })).rejects.toBeInstanceOf(VersionAccessError);
      if (h.spineRevisions) expect((await h.spineRevisions(f.mooneySystem.systemId)).map((item) => item.number)).toEqual([1, 2]);
    });
  });
}

contract("in-memory", memoryHarness);

const PSQL = process.env.STRELVA_VERSIONS_PSQL;
describe.runIf(Boolean(PSQL))("Postgres", () => {
  contract("createSupabaseVersionStore on local PostgreSQL", () => postgresHarness(PSQL!));

  it("refuses history edits the service would never send", async () => {
    const h = postgresHarness(PSQL!);
    const f = await agencyFixture(h);
    let mooney = await f.versions.createVersion(f.mooneyOwner, { source: f.v1.source, version: f.mooneySystem, context: { kind: "agency_client", label: "Mooney" } });
    mooney = await f.versions.release(f.mooneyOwner, mooney.id, { expectedRowRevision: mooney.rowRevision });
    // Rewriting a past release, dropping a decision or forging a baseline is refused by the database itself.
    await expect(h.store.updateLineage(f.mooneyOwner, { ...mooney, releases: [] }, mooney.rowRevision)).rejects.toBeInstanceOf(VersionValidationError);
    await expect(h.store.updateLineage(f.mooneyOwner, { ...mooney, releases: [{ ...mooney.releases[0]!, definition: { forged: true } }] }, mooney.rowRevision)).rejects.toBeInstanceOf(VersionValidationError);
    await expect(h.store.updateLineage(f.mooneyOwner, { ...mooney, baseline: { revision: 1, definition: { forged: true } } }, mooney.rowRevision)).rejects.toBeInstanceOf(VersionValidationError);
    await expect(h.store.updateLineage(f.mooneyOwner, { ...mooney, context: { kind: "location", label: "Moved" } }, mooney.rowRevision)).rejects.toBeInstanceOf(VersionValidationError);
  });
});
