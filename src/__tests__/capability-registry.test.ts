import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAPABILITY_KINDS, getCapability, listCapabilities, workspaceDiscoveryProducts, workspaceExecutables, capabilityStatusView, validateCapabilityStatusView, type CapabilityKind } from "@/capability-registry";
import { executableCapabilityRegistry, EXECUTABLE_CAPABILITY_QUALIFICATIONS, EXECUTABLE_CAPABILITY_DEFINITIONS } from "@/server/capabilities";
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
    expect(getCapability("toString:website")).toBeNull();
    expect(getCapability("__proto__:website")).toBeNull();
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

  it("binds owner contracts and local witnesses to exact declarations and resolvable references", () => {
    for (const entry of all) {
      expect(entry.owner).toEqual({ reference: entry.declaredIn, model: CAPABILITY_KINDS[entry.kind].model });
      expect(entry.contract.reference).toBe(entry.declaredIn);
      for (const evidence of entry.qualification.evidence) {
        expect(evidence.capabilityKey).toBe(entry.key);
        expect(() => readFileSync(evidence.reference.split("#")[0]!, "utf8"), evidence.reference).not.toThrow();
        if (evidence.mode === "local_test") {
          const witness = EXECUTABLE_CAPABILITY_QUALIFICATIONS.find(item => `operation:${item.qualification.capabilityId}@${item.qualification.capabilityVersion}` === entry.key);
          expect(witness?.qualification.evidence).toContainEqual(expect.objectContaining({ id: evidence.id, reference: evidence.reference, status: "passed", kind: "focused_test", environment: "local", checkedAt: evidence.checkedAt }));
        }
      }
      const receiptReference = entry.qualification.receiptReference;
      if (receiptReference) expect(() => readFileSync(receiptReference.split("#")[0]!, "utf8")).not.toThrow();
      expect(entry.qualification.provenModes).not.toContain("production");
      expect(Object.isFrozen(entry.qualification.evidence)).toBe(true);
    }
  });

  it("validates generated status without promoting descriptions, fixtures or labels", () => {
    const status = JSON.parse(JSON.stringify(capabilityStatusView()));
    expect(validateCapabilityStatusView(status)).toBe(true);
    for (const mode of ["local_native", "local_auth", "provider", "production"]) {
      const changed = structuredClone(status);
      changed.entries[0].qualification.provenModes.push(mode);
      changed.entries[0].qualification.evidence[1].mode = mode;
      expect(validateCapabilityStatusView(changed), mode).toBe(false);
    }
    const forged = structuredClone(status);
    forged.entries[0].qualification.evidence[1].capabilityKey = "operation:create_application@2";
    expect(validateCapabilityStatusView(forged)).toBe(false);
    const mislabeled = structuredClone(status);
    mislabeled.entries.find((entry: { kind: string }) => entry.kind === "product").productionReady = true;
    expect(validateCapabilityStatusView(mislabeled)).toBe(false);
    status.entries.pop();
    expect(validateCapabilityStatusView(status)).toBe(false);
  });

  it.each(["entries", "evidence", "provenModes"] as const)("rejects sparse or deleted %s array elements", (field) => {
    function candidate() {
      const status = JSON.parse(JSON.stringify(capabilityStatusView()));
      const holder = field === "entries" ? status : status.entries[0].qualification;
      return { status, holder, values: holder[field] };
    }
    const sparse = candidate();
    sparse.holder[field] = new Array(sparse.values.length);
    expect(validateCapabilityStatusView(sparse.status), "all slots absent").toBe(false);

    for (const index of new Set([0, Math.floor(sparse.values.length / 2), sparse.values.length - 1])) {
      const deleted = candidate();
      delete deleted.values[index];
      expect(validateCapabilityStatusView(deleted.status), `deleted slot ${index}`).toBe(false);
    }

    const inherited = candidate();
    const first = inherited.values[0];
    delete inherited.values[0];
    Object.setPrototypeOf(inherited.values, Object.assign(Object.create(Array.prototype), { 0: first }));
    expect(validateCapabilityStatusView(inherited.status), "inherited slot cannot replace an own element").toBe(false);
  });

  it("listing and status generation do not admit a descriptive or unqualified operation", () => {
    const before = executableCapabilityRegistry.listDescriptors();
    listCapabilities();
    capabilityStatusView();
    expect(executableCapabilityRegistry.listDescriptors()).toEqual(before);
    expect(() => executableCapabilityRegistry.requireExact("homefinder", 1)).toThrow(/unknown_capability/);
    expect(() => executableCapabilityRegistry.requireExact("create_application", 2)).toThrow(/version_unavailable/);
    expect(() => executableCapabilityRegistry.requireExact("create_application", 1, "runner")).toThrow(/entrance_unavailable/);
    expect(listCapabilities({ kind: "product" }).every(entry => entry.qualification.provenModes.join() === "source")).toBe(true);
  });

});
