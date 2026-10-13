import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { capabilityAvailability, capabilityAvailabilityView, type CapabilityAvailabilityReaders } from "@/capability-availability";
import { getCapability } from "@/capability-registry";
import { executableCapabilityRegistry } from "@/server/capabilities";
import type { WorkspaceReleaseFlags } from "@/platform/release-flags/store";
import type { CapabilityEvidenceMode } from "@/platform/capabilities/inventory-contracts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const otherWorkspace = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const operation = "operation:tracker.command@1";
const inquiry = "offering:customer_inquiry_intake@1.0.0";
const environment = { STRELVA_WORKSPACE_RELEASE: "1", STRELVA_INQUIRIES_RELEASE: "1" };
const ownerReads: CapabilityAvailabilityReaders = {
  environment,
  readReleaseFlags: async id => ({ workspaceId: id, flags: {}, testers: [], testerEmails: [] }),
  readPrerequisites: async (entry, scope) => ({ workspaceId: scope.workspaceId, capabilityKey: entry.key, checks: entry.availability.prerequisites.map(id => ({ id, state: "satisfied" })) }),
};
async function project(key = operation, evidenceMode: CapabilityEvidenceMode = "local_test", readers = ownerReads) {
  return (await capabilityAvailability([key], { workspaceId, evidenceMode }, readers))[0];
}

describe("owner-bound capability availability", () => {
  it("requires exact owner proof and never turns source/test fixtures into operational readiness", async () => {
    expect(await project()).toMatchObject({ state: "available", reason: "qualified", evidenceMode: "local_test", grantsAuthority: false });
    for (const mode of ["source", "local_native", "local_auth", "provider", "production"] as const) {
      expect(await project(operation, mode), mode).toMatchObject({ state: "unknown", reason: "qualification_unknown" });
    }
    expect((await capabilityAvailability([operation], { workspaceId }, ownerReads))[0]).toMatchObject({ evidenceMode: "production", state: "unknown" });
    expect(await project("workspace_executable:applications")).toMatchObject({ state: "unknown", reason: "qualification_unknown" });
    expect(await project("operation:tracker.command@2")).toMatchObject({ state: "unknown", reason: "unknown_capability" });
  });

  it("keeps commercial description, installability, and execution authority separate", async () => {
    const before = executableCapabilityRegistry.listDescriptors();
    expect(await project("product:homefinder")).toMatchObject({ state: "unavailable", reason: "descriptive_only", grantsAuthority: false });
    expect(await project(inquiry)).toMatchObject({ state: "unknown", reason: "qualification_unknown", grantsAuthority: false });
    expect(executableCapabilityRegistry.listDescriptors()).toEqual(before);
    expect(() => executableCapabilityRegistry.requireExact("homefinder", 1)).toThrow(/unknown_capability/);
    expect(() => executableCapabilityRegistry.requireExact("tracker.command", 1, "planner")).toThrow(/entrance_unavailable/);
  });

  it("fails closed on workspace/env kill switches without reading prerequisites or storage", async () => {
    const readPrerequisites = vi.fn(ownerReads.readPrerequisites);
    const readReleaseFlags = vi.fn(ownerReads.readReleaseFlags);
    for (const env of [ {}, { STRELVA_WORKSPACE_RELEASE: "1" }, { ...environment, STRELVA_INQUIRIES_RELEASE: "true" } ]) {
      expect(await project(inquiry, "production", { environment: env, readPrerequisites, readReleaseFlags })).toMatchObject({ state: "unavailable", reason: "release_off" });
    }
    expect(readPrerequisites).not.toHaveBeenCalled();
    expect(readReleaseFlags).not.toHaveBeenCalled();
  });

  it("uses existing scoped release layering for workspace, operator and named tester rows", async () => {
    for (const env of ["1", "workspace"]) {
      for (const row of [undefined, "off", "operators", "on"] as const) {
        for (const operator of [false, true]) {
          const released = row === "on" || (row === "operators" && operator) || (row === undefined && env === "1");
          const readers: CapabilityAvailabilityReaders = {
            ...ownerReads,
            environment: { ...environment, STRELVA_INQUIRIES_RELEASE: env },
            readReleaseFlags: async (id): Promise<WorkspaceReleaseFlags> => ({ workspaceId: id, flags: row ? { inquiries: { state: row, revision: 1, changedAt: "2026-10-09T00:00:00Z" } } : {}, testers: [], testerEmails: [] }),
          };
          expect((await capabilityAvailability([inquiry], { workspaceId, viewer: { operator, tester: false } }, readers))[0]).toMatchObject({ reason: released ? "qualification_unknown" : "release_off" });
        }
      }
    }
    const readers: CapabilityAvailabilityReaders = {
      ...ownerReads,
      environment: { ...environment, STRELVA_INQUIRIES_RELEASE: "workspace" },
      readReleaseFlags: async id => ({ workspaceId: id, flags: { inquiries: { state: "operators", revision: 1, changedAt: "2026-10-09T00:00:00Z" } }, testers: [userId], testerEmails: [] }),
    };
    expect((await capabilityAvailability([inquiry], { workspaceId, viewer: { operator: false, tester: false, userId } }, readers))[0]).toMatchObject({ reason: "qualification_unknown" });
  });

  it("preserves scoped read failures and foreign rows as unknown rather than falling back to env", async () => {
    expect(await project(inquiry, "production", { ...ownerReads, readReleaseFlags: async () => { throw new Error("unavailable"); } })).toMatchObject({ state: "unknown", reason: "release_scope_unknown" });
    expect(await project(inquiry, "production", { ...ownerReads, readReleaseFlags: async () => ({ workspaceId: otherWorkspace, flags: {}, testers: [], testerEmails: [] }) })).toMatchObject({ state: "unknown", reason: "release_scope_unknown" });
    expect((await capabilityAvailability([operation], { workspaceId: "invalid" }, ownerReads))[0]).toMatchObject({ state: "unknown", reason: "release_scope_unknown" });
  });

  it("requires the owning prerequisite observations for this exact capability and business", async () => {
    expect(await project(operation, "local_test", { environment })).toMatchObject({ state: "unknown", reason: "prerequisite_unknown" });
    expect(await project(operation, "local_test", { ...ownerReads, readPrerequisites: async () => { throw new Error("unavailable"); } })).toMatchObject({ state: "unknown", reason: "prerequisite_unknown" });
    const checks = getCapability(operation)!.availability.prerequisites.map(id => ({ id, state: "satisfied" as const }));
    for (const observation of [
      { workspaceId: otherWorkspace, capabilityKey: operation, checks },
      { workspaceId, capabilityKey: "operation:create_tracker@1", checks },
      { workspaceId, capabilityKey: operation, checks: [] },
      { workspaceId, capabilityKey: operation, checks: [...checks, ...checks] },
    ]) {
      expect(await project(operation, "local_test", { ...ownerReads, readPrerequisites: async () => observation })).toMatchObject({ state: "unknown", reason: "prerequisite_unknown" });
    }
    expect(await project(operation, "local_test", { ...ownerReads, readPrerequisites: async () => ({ workspaceId, capabilityKey: operation, checks: checks.map(check => ({ ...check, state: "missing" })) }) })).toMatchObject({ state: "unavailable", reason: "prerequisite_missing" });
  });

  it("generates one serializable contract that consumer adapters can share", async () => {
    const view = await capabilityAvailabilityView({ workspaceId }, ownerReads);
    const serialized = JSON.parse(JSON.stringify(view));
    expect(serialized).toEqual(view);
    expect(serialized.every((entry: { grantsAuthority: boolean }) => entry.grantsAuthority === false)).toBe(true);
    expect(JSON.stringify(serialized)).not.toContain("inputSchema");
    const subset = await capabilityAvailability([operation, inquiry, "product:homefinder"], { workspaceId }, ownerReads);
    for (const selected of subset) expect(selected).toEqual(view.find(entry => entry.key === selected.key));
    expect((await capabilityAvailability([operation, operation], { workspaceId }, ownerReads))).toHaveLength(1);
    // Surface adoption is reserved: this qualifies the common values, not an
    // unexecuted browser/Ask/MCP journey or four fictional wrapper functions.
  });

  it("keeps server composition guarded and new flag logic at the existing resolver", () => {
    for (const path of ["src/capability-registry.ts", "src/capability-availability.ts"]) expect(readFileSync(path, "utf8")).toContain('import "server-only"');
    const source = readFileSync("src/capability-availability.ts", "utf8");
    expect(source).not.toMatch(/STRELVA_[A-Z_]+/);
    expect(source).toContain("resolveReleaseFlag(");
    expect(source).not.toMatch(/requireExact|\.execute\(|\.rpc\(/);
    expect(readFileSync("src/platform/capabilities/inventory-contracts.ts", "utf8")).not.toContain("@/capability-registry");
  });
});
