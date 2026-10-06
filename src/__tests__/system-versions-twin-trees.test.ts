import { describe, expect, it } from "vitest";
import {
  VersionAccessError,
  VersionValidationError,
  createInMemoryConnectionOwnership,
  createInMemoryVersionStore,
  createSystemVersions,
  multiSiteAccountAsVersions,
  type JsonObject,
  type VersionActor,
} from "@/platform/system-versions";

// Local fixture shaped like Twin Trees (one account, two location sites).
// Hours, domains and connection IDs are placeholders, not their real data.
const TWIN_TREES = "biz_twintrees";
const owner: VersionActor = { userId: "u_tt_owner", memberships: [{ businessId: TWIN_TREES, role: "owner" }] };
const outsider: VersionActor = { userId: "u_other", memberships: [{ businessId: "biz_other", role: "owner" }] };

const websiteV1: JsonObject = {
  header: { tagline: "[tagline]" },
  hours: { weekday: "[weekday hours]", weekend: "[weekend hours]" },
  menu: { highlight: "[menu highlight]" },
  booking: { enabled: true, partySizeLimit: 8 },
};

describe("Twin Trees: one business, one website System, two location Versions", () => {
  it("keeps per-location hours and accounts, and offers one menu fix to both", () => {
    const connections = createInMemoryConnectionOwnership({
      conn_tt_camillus_calendar: TWIN_TREES,
      conn_tt_fayetteville_calendar: TWIN_TREES,
      conn_tt_camillus_domain: TWIN_TREES,
      conn_tt_fayetteville_domain: TWIN_TREES,
    });
    const versions = createSystemVersions({ store: createInMemoryVersionStore(), connections });
    const plan = multiSiteAccountAsVersions({
      businessId: TWIN_TREES,
      accountName: "Twin Trees",
      tenantIds: ["twintrees-camillus", "twintrees-fayetteville"],
      locationLabels: { "twintrees-camillus": "Camillus", "twintrees-fayetteville": "Fayetteville" },
    });

    const v1 = versions.publishSourceRevision(owner, {
      source: plan.source,
      definition: websiteV1,
      requires: { bindingKinds: ["booking_calendar", "domain"] },
      summary: "Shared Twin Trees website",
    });
    const [camillusPlan, fayettevillePlan] = plan.versions;
    let camillus = versions.createVersion(owner, { source: v1.source, version: camillusPlan!.version, context: camillusPlan!.context });
    let fayetteville = versions.createVersion(owner, { source: v1.source, version: fayettevillePlan!.version, context: fayettevillePlan!.context });

    camillus = versions.setOverride(owner, camillus.id, { path: "hours.weekend", value: "[Camillus weekend hours]", expectedRowRevision: camillus.rowRevision });
    camillus = versions.bindAccount(owner, camillus.id, { kind: "booking_calendar", connectionId: "conn_tt_camillus_calendar", expectedRowRevision: camillus.rowRevision });
    camillus = versions.bindAccount(owner, camillus.id, { kind: "domain", connectionId: "conn_tt_camillus_domain", expectedRowRevision: camillus.rowRevision });

    // Fayetteville changed the highlight locally, then tried to share Camillus's calendar.
    fayetteville = versions.setOverride(owner, fayetteville.id, { path: "menu.highlight", value: "[Fayetteville special]", expectedRowRevision: fayetteville.rowRevision });
    expect(() => versions.bindAccount(owner, fayetteville.id, { kind: "booking_calendar", connectionId: "conn_tt_camillus_calendar", expectedRowRevision: fayetteville.rowRevision }))
      .toThrow(VersionValidationError);
    fayetteville = versions.bindAccount(owner, fayetteville.id, { kind: "booking_calendar", connectionId: "conn_tt_fayetteville_calendar", expectedRowRevision: fayetteville.rowRevision });
    fayetteville = versions.bindAccount(owner, fayetteville.id, { kind: "domain", connectionId: "conn_tt_fayetteville_domain", expectedRowRevision: fayetteville.rowRevision });

    // One shared fix: a corrected menu highlight and a bigger party size.
    const fix = JSON.parse(JSON.stringify(websiteV1)) as JsonObject;
    (fix.menu as JsonObject).highlight = "[corrected menu highlight]";
    (fix.booking as JsonObject).partySizeLimit = 10;
    versions.publishSourceRevision(owner, { source: plan.source, definition: fix, requires: { bindingKinds: ["booking_calendar", "domain"] }, summary: "Menu fix" });

    expect(versions.compareImprovement(owner, camillus.id, 2).status).toBe("auto_applicable");
    const blocked = versions.compareImprovement(owner, fayetteville.id, 2);
    expect(blocked.status).toBe("blocked");
    expect(blocked.conflicts).toEqual([expect.objectContaining({ path: "menu.highlight", reason: "overlapping_edit" })]);

    camillus = versions.adoptImprovement(owner, camillus.id, { revision: 2, expectedRowRevision: camillus.rowRevision });
    fayetteville = versions.adoptImprovement(owner, fayetteville.id, {
      revision: 2,
      expectedRowRevision: fayetteville.rowRevision,
      resolutions: [{ path: "menu.highlight", choice: "keep_local" }],
    });
    const c = versions.readVersion(owner, camillus.id);
    const f = versions.readVersion(owner, fayetteville.id);
    expect(c.workingDefinition).toMatchObject({ hours: { weekend: "[Camillus weekend hours]" }, menu: { highlight: "[corrected menu highlight]" }, booking: { partySizeLimit: 10 } });
    expect(f.workingDefinition).toMatchObject({ hours: { weekend: "[weekend hours]" }, menu: { highlight: "[Fayetteville special]" }, booking: { partySizeLimit: 10 } });
    expect(c.bindings!.map((binding) => binding.connectionId).sort()).toEqual(["conn_tt_camillus_calendar", "conn_tt_camillus_domain"]);
    expect(f.bindings!.map((binding) => binding.connectionId).sort()).toEqual(["conn_tt_fayetteville_calendar", "conn_tt_fayetteville_domain"]);
    expect(() => versions.readVersion(outsider, camillus.id)).toThrow(VersionAccessError);
  });
});
