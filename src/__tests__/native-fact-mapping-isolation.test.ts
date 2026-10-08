import { describe, expect, it, vi } from "vitest";
import { createNativeWebsiteFactService, createNativeWebsiteMappingService, type NativeWebsiteFactPorts } from "@/app/workspace/business-details/native-website-facts";
import { nativeChangedKeys, type NativeMappedFacts } from "@/products/websites/native-fact-mappings";
import { serviceOperationSchema } from "@/platform/business-record/contracts";

const actor = { userId: "7c000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const workspaceId = "7c000000-0000-4000-8000-000000000010";
const serviceA = "7c000000-0000-4000-8000-000000000020";
const serviceB = "7c000000-0000-4000-8000-000000000021";
const mapping = (serviceId = serviceA, name = "Confirmed A"): NativeMappedFacts => ({
  recordRevision: 8,
  mapping: { revision: 1, fields: ["phone"], services: [{ serviceId, nativeServiceId: "consult", fields: ["name"] }] },
  services: [{ id: serviceId, name, description: null, priceText: null, durationMinutes: null, active: true }],
});
const content = (tenantId: string) => ({ sectionLabel: "Services", headline: `${tenantId} approved heading`, description: "Unmapped section copy", services: [
  { id: "consult", name: "Approved consultation", description: `${tenantId} marketing`, duration: "30 minutes", price: "$60", featured: true, who_its_for: "Everyone", booking_link: `https://${tenantId}.example.test/book`, comingSoon: false, image_url: `/${tenantId}.jpg` },
  { id: "other", name: "Unmapped service", description: "Unmapped copy", duration: "1 hour", price: "$90", featured: false, who_its_for: "Everyone", booking_link: "", comingSoon: false, image_url: "/other.jpg" },
] });
function fixture() {
  const ports = {
    enabled: vi.fn(() => true), released: vi.fn(async () => true),
    record: vi.fn(async () => ({ workspaceId, access: "owner", revision: 8, services: [{ id: serviceA, name: "Pending A", active: true }, { id: serviceB, name: "Pending B", active: true }] })),
    confirmed: vi.fn(async () => ({ revision: 8, facts: { phone: "716-555-0123" }, services: [] })),
    sites: vi.fn(async () => ({ systems: ["gldf", "rohlax"].map(tenantId => ({ system: { kind: "website", lifecycle: "live" }, references: { tenantId } })) })),
    tenant: vi.fn(async (id: string) => ({ id, active: true, deliveryModel: "custom_repo" })),
    allowed: vi.fn(async () => true), template: vi.fn(async () => ({ contentSections: ["services"] })),
    manifest: vi.fn(async () => ({ sections: { services: { allowedActions: ["read", "draft", "publish"] } } })),
    current: vi.fn(async (tenantId: string, _section?: string) => content(tenantId)), draft: vi.fn(async () => null), queueAvailable: vi.fn(() => true),
    mapping: vi.fn(async (_actor: unknown, _workspaceId: string, tenantId: string) => tenantId === "gldf" ? mapping() : mapping(serviceB, "Confirmed B")),
    apply: vi.fn(async (_input: unknown) => ({ status: "queued", eventId: "evt_review" })),
    reviews: { claim: vi.fn(async () => true), record: vi.fn(async () => undefined) }, report: vi.fn(async () => undefined),
  };
  return { ports, typed: ports as unknown as NativeWebsiteFactPorts };
}

describe("native mapping independent authority review", () => {
  it("treats accepted uppercase UUIDs as the same mapped service identity", async () => {
    const { ports, typed } = fixture();
    ports.sites.mockResolvedValue({ systems: [{ system: { kind: "website", lifecycle: "live" }, references: { tenantId: "gldf" } }] });
    const operation = { op: "upsert" as const, id: serviceA.toUpperCase(), name: "Confirmed A" };
    expect(serviceOperationSchema.safeParse(operation).success).toBe(true);
    const result = await createNativeWebsiteFactService(typed)(actor, workspaceId, 8, nativeChangedKeys({ services: [operation] }));
    expect(result.ready).toEqual(["gldf"]);
    expect(ports.apply).toHaveBeenCalledOnce();
  });

  it("keeps the same native service ID isolated across two linked sites", async () => {
    const { ports, typed } = fixture();
    const result = await createNativeWebsiteFactService(typed)(actor, workspaceId, 8, [`service:${serviceA}`, `service:${serviceB}`]);
    expect(result).toEqual({ ready: ["gldf", "rohlax"], needsReview: [] });
    expect(ports.apply).toHaveBeenCalledTimes(2);
    for (const [tenantId, name] of [["gldf", "Confirmed A"], ["rohlax", "Confirmed B"]]) {
      const original = content(tenantId!);
      expect(ports.apply).toHaveBeenCalledWith(expect.objectContaining({ tenantId, forceReview: true, data: { ...original, services: [{ ...original.services[0], name }, original.services[1]] } }));
    }
  });

  it.each(["removed", "duplicated"])("holds a native service ID %s between the claim and dispatch", async state => {
    const { ports, typed } = fixture();
    ports.sites.mockResolvedValue({ systems: [{ system: { kind: "website", lifecycle: "live" }, references: { tenantId: "gldf" } }] });
    const original = content("gldf");
    const latest = { ...original, services: state === "removed" ? original.services.slice(1) : [...original.services, original.services[0]!] };
    ports.current.mockResolvedValueOnce(original).mockResolvedValueOnce(latest);
    const result = await createNativeWebsiteFactService(typed)(actor, workspaceId, 8, [`service:${serviceA}`]);
    expect(result).toEqual({ ready: [], needsReview: [{ tenantId: "gldf", reason: "changed_before_dispatch", reported: true }] });
    expect(ports.apply).not.toHaveBeenCalled();
    expect(ports.reviews.record).toHaveBeenCalledExactlyOnceWith(expect.any(String), "blocked", null);
  });

  it.each(["admin", "agency", "member"])("does not grant %s mapping-edit authority", async access => {
    const { ports, typed } = fixture(); ports.record.mockResolvedValue({ workspaceId, access, revision: 8, services: [] });
    const store = { read: vi.fn(), save: vi.fn() };
    await expect(createNativeWebsiteMappingService(typed, store).save(actor, workspaceId, "gldf", 0, { fields: [], services: [] })).rejects.toThrow();
    expect(store.save).not.toHaveBeenCalled(); expect(ports.current).not.toHaveBeenCalled();
  });

  it("rejects a native target from a different linked site's content", async () => {
    const { ports, typed } = fixture();
    ports.current.mockImplementation(async tenantId => ({ ...content(tenantId), services: content(tenantId).services.map(row => ({ ...row, id: `${tenantId}-${row.id}` })) }));
    const store = { read: vi.fn(), save: vi.fn() };
    await expect(createNativeWebsiteMappingService(typed, store).save(actor, workspaceId, "gldf", 0, { fields: [], services: [{ serviceId: serviceA, nativeServiceId: "rohlax-consult", fields: ["name"] }] })).rejects.toThrow();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("continues other native sites and retains their truthful results if one mapping read fails", async () => {
    const { ports, typed } = fixture();
    ports.mapping.mockImplementation(async (_actor, _workspace, tenantId) => {
      if (tenantId === "gldf") throw Error("This site's mapping could not be read");
      return mapping(serviceB, "Confirmed B");
    });
    const result = await createNativeWebsiteFactService(typed)(actor, workspaceId, 8, [`service:${serviceA}`, `service:${serviceB}`]);
    expect(result.ready).toEqual(["rohlax"]);
    expect(result.needsReview).toEqual([{ tenantId: "gldf", reason: "failed", reported: true }]);
    expect(ports.apply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tenantId: "rohlax" }));
  });

  it("keeps an already-queued site's success when the next site cannot read its mapping", async () => {
    const { ports, typed } = fixture();
    ports.mapping.mockImplementation(async (_actor, _workspace, tenantId) => {
      if (tenantId === "rohlax") throw Error("The second site's mapping could not be read");
      return mapping();
    });
    const result = await createNativeWebsiteFactService(typed)(actor, workspaceId, 8, [`service:${serviceA}`, `service:${serviceB}`]);
    expect(result).toEqual({ ready: ["gldf"], needsReview: [{ tenantId: "rohlax", reason: "failed", reported: true }] });
    expect(ports.apply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tenantId: "gldf" }));
  });

  it("continues the mapped service review when reading contact content fails", async () => {
    const { ports, typed } = fixture();
    ports.sites.mockResolvedValue({ systems: [{ system: { kind: "website", lifecycle: "live" }, references: { tenantId: "gldf" } }] });
    ports.template.mockResolvedValue({ contentSections: ["contact", "services"] });
    ports.manifest.mockResolvedValue({ sections: { contact: { allowedActions: ["draft"] }, services: { allowedActions: ["draft"] } } } as never);
    ports.current.mockImplementation(async (tenantId, section) => {
      if (section === "contact") throw Error("Contact storage unavailable");
      return content(tenantId);
    });
    const result = await createNativeWebsiteFactService(typed)(actor, workspaceId, 8, ["phone", `service:${serviceA}`]);
    expect(result).toEqual({ ready: [], needsReview: [{ tenantId: "gldf", reason: "failed", reported: true }] });
    expect(ports.apply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tenantId: "gldf", section: "services" }));
    expect(ports.reviews.claim).toHaveBeenCalledOnce();
  });
});
