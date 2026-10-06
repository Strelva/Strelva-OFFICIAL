import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listOfferingDefinitions, getOfferingDefinition } from "@/platform/offerings/definitions";
import type { OfferingInstallationRecord } from "@/platform/offerings/types";
import type { AgencyManagedWebsiteDraftGrant } from "@/platform/offerings/agency-website-draft-contracts";
import {
  RELEASE_AXIS_FIELDS,
  agencyWebsiteDraftAsPossibility,
  assertShareableDefinition,
  offeringDefinitionAsSource,
  multiSiteAccountAsVersions,
  offeringInstallationAsVersion,
  patternInstallationAsVersion,
  revisionFromSemver,
  semverFromRevision,
  threeWayCompare,
} from "@/platform/system-versions";

/** Strelva's agency workspace, as read from platform_workspaces (fictional id). */
const STRELVA = { businessId: "9e000000-0000-4000-8000-000000000020" };

describe("three-way compare", () => {
  const base = { a: { x: 1, y: 2 }, list: [1, 2], keep: "same" };

  it("applies non-overlapping upstream changes and keeps local ones", () => {
    const result = threeWayCompare({ base, upstream: { ...base, a: { x: 9, y: 2 } }, local: { ...base, keep: "mine" } });
    expect(result.conflicts).toEqual([]);
    expect(result.merged).toEqual({ a: { x: 9, y: 2 }, list: [1, 2], keep: "mine" });
    expect(result.changes.map((change) => [change.path, change.action])).toEqual([["a.x", "apply_upstream"], ["keep", "keep_local"]]);
  });

  it("treats a list as one value and reports one conflict", () => {
    const result = threeWayCompare({ base, upstream: { ...base, list: [1, 2, 3] }, local: { ...base, list: [2] } });
    expect(result.conflicts).toEqual([expect.objectContaining({ path: "list", reason: "overlapping_edit" })]);
    expect(result.merged.list).toEqual([2]);
  });

  it("flags a removed parent as incompatible, at the shallowest path", () => {
    const result = threeWayCompare({ base, upstream: { ...base, a: { x: 1, y: 3 } }, local: { ...base, a: null } });
    expect(result.conflicts).toEqual([expect.objectContaining({ path: "a", reason: "incompatible_override", local: null, upstream: { x: 1, y: 3 } })]);
  });

  it("does not report convergent edits", () => {
    const changed = { ...base, a: { x: 5, y: 2 } };
    const result = threeWayCompare({ base, upstream: changed, local: changed });
    expect(result.conflicts).toEqual([]);
    expect(result.changes[0]!.action).toBe("already_matching");
  });
});

describe("existing objects as source Systems and Versions", () => {
  it("projects every offering definition as a shareable source revision", () => {
    for (const definition of listOfferingDefinitions()) {
      const source = offeringDefinitionAsSource(definition, STRELVA);
      expect(source.source.businessId).toBe(STRELVA.businessId);
      expect(semverFromRevision(source.source.number)).toBe(definition.version);
      expect(() => assertShareableDefinition(source.definition)).not.toThrow();
      expect(source.requires.bindingKinds.length).toBeGreaterThan(0);
    }
    expect(revisionFromSemver("1.2.3")).toBeLessThan(revisionFromSemver("1.10.0"));
  });

  it("projects an offering installation as a business-owned Version pinned to the definition", () => {
    const definition = getOfferingDefinition("private_staff_requests")!;
    const installation: OfferingInstallationRecord = {
      id: "inst_1",
      businessId: "biz_mooney",
      definitionId: definition.id,
      definitionVersion: definition.version,
      status: "active",
      revision: 4,
      configuration: { displayName: "Paralegal requests" },
      nativeResources: [{ kind: "application", id: "app_1" }],
      responsibility: { kind: "customer_operated", providerName: "The Mooney Firm" },
      acceptedScope: ["submit_requests", "review_requests"],
      surfaceIds: ["staff_app"],
      installedBy: "u1",
      installedAt: "2026-10-01T00:00:00.000Z",
      updatedBy: "u1",
      updatedAt: "2026-10-01T00:00:00.000Z",
    };
    const version = offeringInstallationAsVersion(installation, STRELVA);
    expect(version.version).toEqual({ businessId: "biz_mooney", systemId: "offering-installation:inst_1" });
    expect(version.source).toEqual(offeringDefinitionAsSource(definition, STRELVA).source);
    expect(version.overridePaths).toEqual(["configuration.displayName"]);
    expect(version.bindings).toEqual([{ kind: "application", connectionId: "app_1", ownerBusinessId: "biz_mooney" }]);
    expect(version).toMatchObject({ currentRelease: 1, rowRevision: 4, lifecycle: "released" });
  });

  it("projects an inquiry pattern installation as cross-business lineage", () => {
    const version = patternInstallationAsVersion({
      id: "pi_1",
      businessId: "biz_lakeside",
      capabilityId: "cap_target",
      sourceBusinessId: "biz_northside",
      sourceCapabilityId: "cap_source",
      sourceVersion: 3,
      targetVersion: 7,
      status: "conflicted",
    });
    expect(version.source).toEqual({ businessId: "biz_northside", systemId: "inquiry:cap_source", revisionId: "inquiry:cap_source@3", number: 3 });
    expect(version.version.businessId).toBe("biz_lakeside");
    expect(version.context?.kind).toBe("agency_client");
    expect(version.currentRelease).toBe(7);
    expect(version.improvement).toBe("blocked");
  });

  it("treats an agency website draft as a Possibility on the client's System, not a Version", () => {
    const grant: AgencyManagedWebsiteDraftGrant = {
      id: "00000000-0000-4000-8000-000000000001",
      managedWebsiteBindingId: "00000000-0000-4000-8000-000000000002",
      businessWorkspaceId: "00000000-0000-4000-8000-000000000003",
      tenantId: "mooney",
      deliveryId: "00000000-0000-4000-8000-000000000004",
      assignmentId: "00000000-0000-4000-8000-000000000005",
      agencyWorkspaceId: "00000000-0000-4000-8000-000000000006",
      operatorUserId: "00000000-0000-4000-8000-000000000007",
      grantedBy: "00000000-0000-4000-8000-000000000008",
      status: "active",
      expiresAt: "2026-10-05T00:00:00.000Z",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      revokedAt: null,
      revokedBy: null,
    };
    const possibility = agencyWebsiteDraftAsPossibility(grant, "2026-10-04T00:00:00.000Z");
    expect(possibility.kind).toBe("possibility");
    expect(possibility.system.businessId).toBe(grant.businessWorkspaceId);
    expect(possibility.preparedByBusinessId).toBe(grant.agencyWorkspaceId);
    expect(possibility.createsVersion).toBe(false);
    expect(possibility.grantActive).toBe(true);
    expect(agencyWebsiteDraftAsPossibility(grant, "2026-10-06T00:00:00.000Z").grantActive).toBe(false);
  });

  it("plans Twin Trees (one account, two location sites) as one website System with two location Versions", () => {
    const plan = multiSiteAccountAsVersions({
      businessId: "biz_twintrees",
      accountName: "Twin Trees",
      tenantIds: ["twintrees-camillus", "twintrees-fayetteville"],
      locationLabels: { "twintrees-camillus": "Twin Trees, Camillus", "twintrees-fayetteville": "Twin Trees, Fayetteville" },
    });
    expect(plan.source).toEqual({ businessId: "biz_twintrees", systemId: "website:twintrees" });
    expect(plan.versions.map((item) => [item.version.systemId, item.context.kind, item.context.label])).toEqual([
      ["website:twintrees-camillus", "location", "Twin Trees, Camillus"],
      ["website:twintrees-fayetteville", "location", "Twin Trees, Fayetteville"],
    ]);
    expect(plan.versions.every((item) => item.version.businessId === "biz_twintrees")).toBe(true);
    expect(plan.requiresOwnerConfirmation).toBe(true);
    expect(() => multiSiteAccountAsVersions({ businessId: "b", accountName: "One", tenantIds: ["only"] })).toThrow();
  });
});

describe("Q_CONTEXT_RELEASE_AXIS mapping", () => {
  it("classifies each existing version field on exactly one axis", () => {
    const keys = RELEASE_AXIS_FIELDS.map((field) => `${field.location}#${field.field}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never reads an existing version field as a contextual Version", () => {
    const axes = new Set(RELEASE_AXIS_FIELDS.map((field) => field.axis));
    expect([...axes].sort()).toEqual(["api_contract", "concurrency", "lineage_baseline", "platform_release", "version_release"]);
  });

  it("leaves release-manifest.json and the v1 contract unchanged", () => {
    const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "release-manifest.json"), "utf8")) as Record<string, unknown>;
    expect(manifest.contractVersion).toBe("v1");
    expect(Object.keys(manifest).sort()).toEqual(["app", "contractVersion", "customRepoWorkspace", "requiredEnv", "version"]);
    expect(RELEASE_AXIS_FIELDS.find((field) => field.field === "version" && field.location === "release-manifest.json")?.axis).toBe("platform_release");
    expect(RELEASE_AXIS_FIELDS.find((field) => field.field === "contractVersion")?.axis).toBe("api_contract");
  });
});
