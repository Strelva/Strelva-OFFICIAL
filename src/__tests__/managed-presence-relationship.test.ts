import { describe, expect, it } from "vitest";
import { resolveLegacyManagedPresence } from "@/products/managed-presence";

describe("managed-presence legacy relationship adapter", () => {
  it("carries forward every resolved legacy managed tenant", () => {
    expect(resolveLegacyManagedPresence({ id: "gldf" })).toEqual({
      tenantId: "gldf",
      serviceRelationship: "managed_client",
      source: "legacy_tenant",
    });
    expect(resolveLegacyManagedPresence({ id: "rohlax" }).serviceRelationship).toBe("managed_client");
    expect(resolveLegacyManagedPresence({ id: "orange-crate" }).serviceRelationship).toBe("managed_client");
  });

  it("excludes the public demo from service status", () => {
    expect(resolveLegacyManagedPresence({ id: "demo" })).toEqual({
      tenantId: "demo",
      serviceRelationship: "none",
      source: "demo",
    });
  });

  it("leaves missing tenant config unresolved", () => {
    expect(resolveLegacyManagedPresence(null)).toEqual({
      tenantId: null,
      serviceRelationship: "none",
      source: "unresolved",
    });
  });

  it("normalizes legacy ids without changing the demo exclusion", () => {
    expect(resolveLegacyManagedPresence({ id: " GLDF " }).serviceRelationship).toBe("managed_client");
    expect(resolveLegacyManagedPresence({ id: "gldf-copy" }).serviceRelationship).toBe("managed_client");
  });
});
