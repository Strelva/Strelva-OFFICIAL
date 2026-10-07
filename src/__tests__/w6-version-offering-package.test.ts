import { describe, expect, it, vi } from "vitest";
import { offeringPackageDefinition, readOfferingPackageForWork } from "@/platform/system-versions/offering-runtime";
const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "owner@example.test" };
const workspace = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const work = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
describe("reusable offering configuration", () => {
  it("localizes labels, operator notes, people, accounts and all resource/assignment authority", () => {
    const input = { definitionId: "private_staff_requests", definitionVersion: "1.0.0", configuration: { displayName: "Jane owner@example.test", instructions: "Account abc; assigned to owner@example.test" }, nativeResources: [{ id: work }], responsibility: { providerName: "Jane" }, records: [{ secret: "private" }] };
    expect(offeringPackageDefinition(input)).toEqual({ kind: "offering", definitionId: "private_staff_requests", definitionVersion: "1.0.0", configuration: {} });
  });
  it.each([{ recipients: ["owner@example.test"] }, { accountId: workspace }, { displayName: { nested: "authority" } }])("rejects unsupported configuration before packaging", config => {
    expect(() => offeringPackageDefinition({ definitionId: "private_staff_requests", definitionVersion: "1.0.0", configuration: config })).toThrow("could not be verified");
  });
  it("rejects unsupported definitions and non-configurable inquiry/website fields", () => {
    expect(() => offeringPackageDefinition({ definitionId: "unknown", definitionVersion: "1.0.0", configuration: {} })).toThrow();
    expect(() => offeringPackageDefinition({ definitionId: "customer_inquiry_intake", definitionVersion: "1.0.0", configuration: { displayName: "Private" } })).toThrow();
  });
  it("derives a concurrency fingerprint only from the independently read installation", async () => {
    const rpc = vi.fn(async () => ({ data: { installationId: id, revision: 7, definitionId: "private_staff_requests", definitionVersion: "1.0.0", configuration: { instructions: "Local only" } }, error: null }));
    expect(await readOfferingPackageForWork(actor, workspace, work, { rpc })).toMatchObject({ fingerprint: `offering:${id}:7`, definition: { configuration: {} } });
    expect(rpc).toHaveBeenCalledWith("read_offering_package_for_work", { p_workspace_id: workspace, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_work_id: work });
  });
  it("does not invent a package when no offering owns the scoped work", async () => {
    expect(await readOfferingPackageForWork(actor, workspace, work, { rpc: async () => ({ data: null, error: null }) })).toBeNull();
  });
});
