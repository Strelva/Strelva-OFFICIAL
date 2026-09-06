import { describe, expect, it } from "vitest";
import {
  PRODUCT_CATALOG,
  getProductDefinition,
  listReleaseOneProducts,
  listWorkspaceDiscoveryProducts,
  type ProductDefinition,
} from "@/platform/products";

function operationResourcesExist(product: ProductDefinition): boolean {
  const resources = new Set(product.resources.map((resource) => resource.kind));
  return product.operations.every((operation) => resources.has(operation.resourceKind));
}

describe("platform product catalog", () => {
  it("has stable unique product, operation, resource, and entry identifiers", () => {
    expect(new Set(PRODUCT_CATALOG.map((product) => product.id)).size).toBe(PRODUCT_CATALOG.length);

    for (const product of PRODUCT_CATALOG) {
      expect(new Set(product.resources.map((resource) => resource.kind)).size).toBe(product.resources.length);
      expect(new Set(product.operations.map((operation) => operation.id)).size).toBe(product.operations.length);
      expect(new Set(product.distribution.map((entry) => entry.id)).size).toBe(product.distribution.length);
      expect(operationResourcesExist(product)).toBe(true);
      expect(product.presentations.filter((presentation) => presentation.primary)).toHaveLength(1);
      expect(product.controls.enforcement).toBe("executing_use_case");
    }
  });

  it("truthfully limits release one to current public, client, and internal capability", () => {
    expect(listReleaseOneProducts().map((product) => product.id)).toEqual([
      "ai_visibility",
      "managed_presence",
      "domain_monitoring",
    ]);

    expect(getProductDefinition("ai_visibility")).toMatchObject({
      release: { availability: "public", releaseOne: true },
      distribution: expect.arrayContaining([
        expect.objectContaining({ id: "public_assessment", href: "/ai-visibility", status: "available" }),
      ]),
    });
    expect(getProductDefinition("ai_visibility")).toMatchObject({
      resources: expect.arrayContaining([
        expect.objectContaining({ kind: "private_ai_visibility_work", ownership: "customer_account" }),
      ]),
      operations: expect.arrayContaining([
        expect.objectContaining({ id: "save_private_assessment", support: "release_gated" }),
        expect.objectContaining({ id: "handoff_private_assessment", support: "release_gated" }),
      ]),
      release: {
        gates: expect.arrayContaining([
          expect.objectContaining({ id: "account_saved_work", state: "partial" }),
        ]),
      },
    });
    expect(getProductDefinition("managed_presence").release.availability).toBe("existing_clients");
    expect(getProductDefinition("domain_monitoring").release.availability).toBe("managed_internal");
  });

  it("does not present incomplete agency paths or Homefinder as enabled", () => {
    const agencyEntries = PRODUCT_CATALOG.flatMap((product) =>
      product.distribution.filter((entry) => entry.kind === "agency_handoff"),
    );
    expect(agencyEntries.length).toBeGreaterThan(0);
    expect(agencyEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "agency_handoff", status: "restricted", href: null }),
      expect.objectContaining({ id: "agency_handoff", status: "not_enabled", href: null }),
    ]));

    const homefinder = getProductDefinition("homefinder");
    expect(homefinder.release).toMatchObject({ availability: "not_enabled", releaseOne: false });
    expect(homefinder.operations.every((operation) => operation.support === "not_enabled")).toBe(true);
    expect(homefinder.distribution.every((entry) => entry.status === "not_enabled" && entry.href === null)).toBe(true);
    expect(homefinder.release.gates.every((gate) => gate.state === "external" || gate.state === "unmet")).toBe(true);
  });

  it("keeps operator tooling out of workspace discovery while retaining disabled product records", () => {
    expect(listWorkspaceDiscoveryProducts().map((product) => product.id)).toEqual([
      "ai_visibility",
      "managed_presence",
      "homefinder",
    ]);
    expect(listWorkspaceDiscoveryProducts().some((product) => product.id === "domain_monitoring")).toBe(false);
    expect(listWorkspaceDiscoveryProducts().find((product) => product.id === "homefinder")?.release.availability).toBe("not_enabled");
  });

  it("keeps monitoring scoped to managed operations instead of claiming a customer product", () => {
    const monitoring = getProductDefinition("domain_monitoring");
    expect(monitoring.operations.every((operation) => operation.support === "internal_only")).toBe(true);
    expect(monitoring.controls.access).toEqual(["operator"]);
    expect(monitoring.release.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "installation_scoping", state: "unmet" }),
    ]));
  });

  it("describes approval and access while leaving enforcement to each use case", () => {
    const managedPresence = getProductDefinition("managed_presence");
    expect(managedPresence.controls).toMatchObject({
      enforcement: "executing_use_case",
      approval: "operation_policy",
      access: ["tenant_membership", "scoped_delegation"],
    });
    expect(managedPresence.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "apply_governed_change", effect: "external_side_effect" }),
    ]));
  });
});
