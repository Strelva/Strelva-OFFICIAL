import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAPABILITY_KINDS, getCapability, listCapabilities, workspaceDiscoveryProducts, workspaceExecutables, type CapabilityKind } from "@/capability-registry";
import { EXECUTABLE_CAPABILITY_DEFINITIONS } from "@/server/capabilities";
import { PRODUCT_CATALOG, listWorkspaceDiscoveryProducts, listWorkspaceExecutableProducts } from "@/platform/products";
import { listOfferingDefinitions } from "@/platform/offerings/definitions";
import { getAllCapabilities } from "@/lib/capabilities";
import { FEATURE_REGISTRY } from "@/lib/features/registry";

// One capability registry (Strelva Reborn section 7) over the six declaration
// files, through adapters. These pin that it lists each source exactly once.

describe("capability registry", () => {
  const all = listCapabilities();

  it("lists every declaration from all six sources, once, with unique keys", () => {
    const counts = Object.fromEntries((Object.keys(CAPABILITY_KINDS) as CapabilityKind[]).map((kind) => [kind, listCapabilities({ kind }).length]));
    expect(counts).toEqual({
      operation: EXECUTABLE_CAPABILITY_DEFINITIONS.length,
      workspace_executable: listWorkspaceExecutableProducts().length,
      product: PRODUCT_CATALOG.length,
      offering: listOfferingDefinitions().length,
      agent_capability: getAllCapabilities().length,
      dashboard_feature: FEATURE_REGISTRY.length,
    });
    expect(all).toHaveLength(Object.values(counts).reduce((a, b) => a + b, 0));
    expect(new Set(all.map((entry) => entry.key)).size).toBe(all.length);
    for (const entry of all) {
      expect(entry.name.trim(), entry.key).not.toBe("");
      expect(entry.declaredIn).toBe(CAPABILITY_KINDS[entry.kind].declaredIn);
    }
  });

  it("finds one capability by key, and nothing for an unknown kind or id", () => {
    expect(getCapability("operation:schedule.command@1")).toMatchObject({ kind: "operation", id: "schedule.command@1" });
    expect(getCapability("agent_capability:website")).toMatchObject({ name: "Website Management" });
    expect(getCapability("workspace_executable:nope")).toBeNull();
    expect(getCapability("billing:website")).toBeNull();
  });

  it("each declaration file exists and is named in the capabilities README", () => {
    const readme = readFileSync("docs/capabilities/README.md", "utf8");
    for (const info of Object.values(CAPABILITY_KINDS)) {
      expect(() => readFileSync(info.declaredIn, "utf8"), info.declaredIn).not.toThrow();
      expect(readme, info.declaredIn).toContain(`\`${info.declaredIn}\``);
    }
    expect(readme).toContain("`src/capability-registry.ts`");
  });

  it("reader views return exactly what their declarations return", () => {
    expect(workspaceExecutables()).toBe(listWorkspaceExecutableProducts());
    expect(workspaceDiscoveryProducts()).toEqual(listWorkspaceDiscoveryProducts());
  });
});
