import { describe, expect, it, vi } from "vitest";
import { defaultNativeFactMapping, nativeFactMappingInputSchema, nativeMappedSection, nativeMappingSections, type NativeMappedFacts } from "@/products/websites/native-fact-mappings";
import { createNativeFactMappingStore } from "@/products/websites/native-fact-mappings-store";
const serviceId = "7e000000-0000-4000-8000-000000000040";
const mapped = (): NativeMappedFacts => ({ recordRevision: 3, mapping: { revision: 1, fields: ["display_name", "address", "hours"], services: [{ serviceId, nativeServiceId: "consult", fields: ["name", "priceText"] }] },
  services: [{ id: serviceId, name: "Updated consultation", description: "Confirmed description", priceText: "$90", durationMinutes: 45, active: true }] });
const native = { headline: "Approved marketing", description: "Site introduction", services: [
  { id: "other", name: "Other service", description: "Other marketing", price: "$50", duration: "1 hour", booking_link: "https://example.test/other", image_url: "/other.jpg" },
  { id: "consult", name: "Consultation", description: "Approved service marketing", price: "$70", duration: "Half an hour", booking_link: "https://example.test/book", image_url: "/consult.jpg", featured: true, comingSoon: false },
] };
const confirmed = { revision: 3, facts: { display_name: "The Mooney Firm" }, services: [] };
describe("explicit native website mappings", () => {
  it("keeps existing contact defaults; name/services are opt-in", () => {
    expect(nativeMappingSections(defaultNativeFactMapping(), ["display_name", "services"])).toEqual([]);
    expect(nativeMappingSections(mapped().mapping, ["display_name", "phone", "hours", `service:${serviceId}`])).toEqual(["contact", "settings", "services"]);
  });
  it("patches only selected fields by stable UUID and exact native ID, preserving order and native-owned values", () => {
    const result = nativeMappedSection("services", confirmed, mapped(), native);
    expect(result.held).toBe(false);
    expect(result.data).toEqual({ ...native, services: [native.services[0], { ...native.services[1], name: "Updated consultation", price: "$90" }] });
    expect(native.services[1]?.name).toBe("Consultation");
  });
  it("never falls back to an unscoped externalRef, matching name or array position", () => {
    const data = mapped();data.mapping.services[0]!.serviceId = "7e000000-0000-4000-8000-000000000041";
    expect(nativeMappedSection("services", confirmed, data, native)).toEqual({ data: native, held: true });
    data.mapping.services[0]!.serviceId = serviceId;data.mapping.services[0]!.nativeServiceId = "absent";
    expect(nativeMappedSection("services", confirmed, data, native)).toEqual({ data: native, held: true });
  });
  it.each(["missing", "inactive", "duplicate", "null"])("holds %s service data without erasing existing content", reason => {
    const data = mapped();let current = native;
    if (reason === "missing") data.services = [];
    if (reason === "inactive") data.services[0]!.active = false;
    if (reason === "null") data.services[0]!.priceText = null;
    if (reason === "duplicate") current = { ...native, services: [...native.services, native.services[1]!] };
    expect(nativeMappedSection("services", confirmed, data, current)).toEqual({ data: current, held: true });
  });
  it("changes the business name without replacing any marketing, booking, image or branding settings", () => {
    const current = { siteName: "Old firm", siteTagline: "Approved tagline", logoUrl: "/logo.svg", bookingUrl: "https://example.test/book", brandVoice: "Warm", siteDescription: "Established practice" };
    expect(nativeMappedSection("settings", confirmed, mapped(), current)).toEqual({ data: { ...current, siteName: "The Mooney Firm" }, held: false });
    expect(nativeMappedSection("settings", { ...confirmed, facts: {} }, mapped(), current)).toEqual({ data: current, held: true });
  });
  it("rejects duplicate targets/sources, arbitrary property mappings and malformed IDs", () => {
    for (const bad of [
      { ...mapped().mapping, revision: undefined, fields: ["owner_recipient"] },
      { fields: [], services: [mapped().mapping.services[0], mapped().mapping.services[0]] },
      { fields: [], services: [{ serviceId, nativeServiceId: "consult", fields: ["booking_link"] }] },
      { fields: [], services: [{ serviceId: "consult", nativeServiceId: "consult", fields: ["name"] }] },
    ]) expect(nativeFactMappingInputSchema.safeParse(bad).success).toBe(false);
  });
  it("passes exact workspace, actor and tenant scope to server-only storage", async () => {
    const rpc = vi.fn(async () => ({ data: mapped(), error: null }));
    const store = createNativeFactMappingStore(() => ({ rpc }));
    const actor = { userId: "7e000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
    await store.read(actor, "7e000000-0000-4000-8000-000000000010", "tenant-a");
    expect(rpc).toHaveBeenCalledWith("read_native_website_fact_mapping", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_workspace_id: "7e000000-0000-4000-8000-000000000010", p_tenant_id: "tenant-a" });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "native_website_mapping_revision_conflict" } } as never);
    await expect(store.save(actor, "7e000000-0000-4000-8000-000000000010", "tenant-a", 1, { fields: [], services: [] })).rejects.toThrow("Reload");
  });
});

it("does not schedule other mapped services for an unrelated service mutation", () => {
  const mapping = mapped().mapping;
  expect(nativeMappingSections(mapping, ["service:7e000000-0000-4000-8000-000000000041"])).toEqual([]);
  expect(nativeMappingSections(mapping, ["services"])).toEqual([]);
  expect(nativeMappingSections(mapping, [`service:${serviceId}`])).toEqual(["services"]);
});
