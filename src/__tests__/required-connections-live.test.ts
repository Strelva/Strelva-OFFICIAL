import { describe, expect, it, vi } from "vitest";
import { assertRequiredConnections, type RequiredConnectionsPort } from "@/platform/system-versions/required-connections";
import type { ProviderEligibility, RequiredConnection, WorkspaceConnection } from "@/platform/connections/contracts";
import { createSystemVersions } from "@/platform/system-versions/service";
import { createInMemoryVersionStore } from "@/platform/system-versions/store";

const workspaceId = "bb000000-0000-4000-8000-000000000001";
const agencyId = "bb000000-0000-4000-8000-000000000002";
const actor = { userId: "bb000000-0000-4000-8000-000000000003", verifiedEmail: "owner@example.test" };
const required: RequiredConnection = { provider: "google_business_profile", access: "act", optional: false, purpose: "Update the listing" };
const row: WorkspaceConnection = { ref: "google_business_profile:own", provider: required.provider, workspaceId, accountLabel: "Harbor Dental", accountHolder: { kind: "business", workspaceId }, accessThrough: { kind: "platform" }, state: "connected", unavailableReason: null, connectedAt: null, systemIds: [] };
function port(rows: WorkspaceConnection[] = [row], eligibility: ProviderEligibility = { eligible: true, through: { kind: "platform" } }): RequiredConnectionsPort {
  return { listWorkspaceConnections: vi.fn(async () => ({ connections: rows, sourceErrors: [] })), connectionEligibilityFor: vi.fn(async () => eligibility) };
}
const input = { actor, workspaceId, requiredConnections: [required] };

describe("required Connections before a System goes live", () => {
  it("allows connected eligible business accounts", async () => {
    const ports = port();
    await expect(assertRequiredConnections(input, ports)).resolves.toBeUndefined();
    expect(ports.connectionEligibilityFor).toHaveBeenCalledWith(actor, { provider: required.provider, businessWorkspaceId: workspaceId });
  });
  it.each(["stale", "disconnected", "unavailable"] as const)("blocks %s accounts", async state => {
    await expect(assertRequiredConnections(input, port([{ ...row, state }]))).rejects.toMatchObject({ name: "RequiredConnectionsError", provider: required.provider });
  });
  it("blocks absent accounts and unknown legacy holders", async () => {
    for (const rows of [[], [{ ...row, accountHolder: { kind: "unknown" as const } }], [{ ...row, accessThrough: { kind: "unknown" as const } }]]) {
      await expect(assertRequiredConnections(input, port(rows))).rejects.toThrow("connect or reconnect");
    }
  });
  it("never uses another business's account or a different selected account", async () => {
    await expect(assertRequiredConnections(input, port([{ ...row, workspaceId: agencyId }]))).rejects.toThrow();
    await expect(assertRequiredConnections(input, port([{ ...row, accountHolder: { kind: "business", workspaceId: agencyId } }]))).rejects.toThrow();
    await expect(assertRequiredConnections({ ...input, connectionRefs: ["google_business_profile:missing"] }, port())).rejects.toThrow();
  });
  it("preserves provider's plain next step and rejects connected but ineligible accounts", async () => {
    await expect(assertRequiredConnections(input, port([row], { eligible: false, reason: "area_not_granted", message: "Give your agency the Google area." }))).rejects.toThrow("Give your agency the Google area.");
  });
  it("says plainly when Strelva has not set the provider up", async () => {
    await expect(assertRequiredConnections(input, port([row], { eligible: false, reason: "not_set_up", message: "Google Business Profile isn't set up on Strelva yet." })))
      .rejects.toThrow("Google Business Profile isn't set up on Strelva yet.");
  });
  it("requires agency access to match the eligible agency, without a preferred-agency path", async () => {
    const agencyRow: WorkspaceConnection = { ...row, accountHolder: { kind: "agency", workspaceId: agencyId }, accessThrough: { kind: "agency", workspaceId: agencyId } };
    await expect(assertRequiredConnections(input, port([agencyRow], { eligible: true, through: { kind: "agency", workspaceId: agencyId } }))).resolves.toBeUndefined();
    await expect(assertRequiredConnections(input, port([agencyRow]))).rejects.toThrow();
    await expect(assertRequiredConnections(input, port([agencyRow], { eligible: true, through: { kind: "agency", workspaceId } }))).rejects.toThrow();
  });
  it("accepts a core-qualified agency account through platform access but refuses unavailable holder authority", async () => {
    const agencyRow: WorkspaceConnection = { ...row, accountHolder: { kind: "agency", workspaceId: agencyId } };
    await expect(assertRequiredConnections(input, port([agencyRow]))).resolves.toBeUndefined();
    await expect(assertRequiredConnections(input, port([{ ...agencyRow, unavailableReason: "area_not_granted", state: "unavailable" }]))).rejects.toThrow();
  });
  it("fails closed on source or eligibility read failure", async () => {
    const failed = port();
    failed.listWorkspaceConnections = async () => { throw new Error("database"); };
    await expect(assertRequiredConnections(input, failed)).rejects.toThrow("retry checking");
    const source = port();
    source.listWorkspaceConnections = async () => ({ connections: [row], sourceErrors: [required.provider] });
    await expect(assertRequiredConnections(input, source)).rejects.toThrow("retry checking");
    const eligibility = port();
    eligibility.connectionEligibilityFor = async () => { throw new Error("authority"); };
    await expect(assertRequiredConnections(input, eligibility)).rejects.toThrow("retry checking");
  });
  it("does not let an unrelated source failure block a required account", async () => {
    const source = port();
    source.listWorkspaceConnections = async () => ({ connections: [row], sourceErrors: ["instagram"] });
    await expect(assertRequiredConnections(input, source)).resolves.toBeUndefined();
  });
  it("skips optional needs and Systems with no outside-account requirements", async () => {
    const ports = port();
    await assertRequiredConnections({ ...input, requiredConnections: [{ ...required, optional: true }] }, ports);
    await assertRequiredConnections({ ...input, requiredConnections: [] }, ports);
    expect(ports.listWorkspaceConnections).not.toHaveBeenCalled();
    expect(ports.connectionEligibilityFor).not.toHaveBeenCalled();
  });
});

describe("installed Version live boundary", () => {
  async function installed() {
    const store = createInMemoryVersionStore();
    const source = { businessId: workspaceId, systemId: "bb000000-0000-4000-8000-000000000004" };
    const versionActor = { ...actor, memberships: [{ businessId: workspaceId, role: "owner" as const }] };
    // An immutable legacy revision has no requiredConnections declaration.
    const revision = { ...source, revisionId: "bb000000-0000-4000-8000-000000000005", number: 1 };
    await store.putSource(versionActor, { source, sharedWith: [], createdAt: "2026-10-14T00:00:00Z" });
    await store.insertRevision(versionActor, { source: revision, definition: { kind: "internal_app", title: "Client requests", fields: [], components: [] },
      requires: { bindingKinds: [] }, summary: "Legacy native app", publishedBy: actor.userId, publishedAt: "2026-10-14T00:00:00Z" });
    const ports = port([]);
    const versions = createSystemVersions({ store, connections: { ownerOf: async () => workspaceId }, requiredConnections: ports });
    const lineage = await versions.createVersion(versionActor, { source: revision, version: { businessId: workspaceId, systemId: "bb000000-0000-4000-8000-000000000006" }, context: { kind: "agency_client", label: "Harbor Dental" } });
    return { versions, ports, store, lineage, versionActor };
  }
  it("installs a Draft without accounts and refuses live release before mutating lineage", async () => {
    const { versions, ports, store, lineage, versionActor } = await installed();
    expect(ports.listWorkspaceConnections).not.toHaveBeenCalled();
    expect(lineage.currentRelease).toBeNull();
    await expect(versions.release(versionActor, lineage.id, { expectedRowRevision: 1 })).rejects.toMatchObject({ name: "RequiredConnectionsError", provider: "resend" });
    expect((await store.getLineage(versionActor, lineage.id))?.currentRelease).toBeNull();
    expect((await store.getLineage(versionActor, lineage.id))?.rowRevision).toBe(1);
  });
  it("releases only when the derived needs are connected; a repeat release checks no accounts", async () => {
    const { versions, ports, lineage, versionActor } = await installed();
    ports.listWorkspaceConnections = vi.fn<RequiredConnectionsPort["listWorkspaceConnections"]>(async () => ({ connections: [{ ...row, provider: "resend", ref: "resend:platform", accountHolder: { kind: "platform" } }], sourceErrors: [] }));
    const released = await versions.release(versionActor, lineage.id, { expectedRowRevision: 1 });
    expect(released.currentRelease).toBe(1);
    vi.mocked(ports.listWorkspaceConnections).mockClear();
    await expect(versions.release(versionActor, lineage.id, { expectedRowRevision: released.rowRevision })).rejects.toThrow("Nothing changed");
    expect(ports.listWorkspaceConnections).not.toHaveBeenCalled();
  });
});
