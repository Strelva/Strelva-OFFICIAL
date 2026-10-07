import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createNativeWebsiteFactService, nativeContactFacts, nativeWebsiteFactsPatch, createNativeFactReviewStore, type NativeWebsiteFactPorts } from "@/app/workspace/business-details/native-website-facts";
import type { BusinessRecord } from "@/platform/business-record/contracts";
import type { WorkspaceActor } from "@/platform/workspaces/types";

const actor = { userId: "7e000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const ws = "7e000000-0000-4000-8000-000000000010";
const at = "2026-10-07T12:00:00Z";
const current = { headline: "Get in touch", description: "Approved copy", email: "old@example.test", phone: "716-555-0100", address: "Old address", hours: "Old hours", locationTitle: "Visit us", locationDescription: "Approved directions", instagramUrl: "https://instagram.com/fixture", facebookUrl: "https://facebook.com/fixture", googleMapsUrl: "https://maps.example.test/fixture" };
const record = (): BusinessRecord => ({ workspaceId: ws, access: "owner", revision: 3, lastSequence: 3, updatedAt: at, facts: {
  phone: { value: "716-555-0123", source: "owner", verified: false, updatedAt: at, updatedBy: actor.userId },
  email: { value: "public@example.test", source: "owner", verified: true, updatedAt: at, updatedBy: actor.userId },
  address: { value: { line1: "123 Fictional St", city: "Buffalo", region: "NY", postalCode: "14201" }, source: "owner", verified: true, updatedAt: at, updatedBy: actor.userId },
  hours: { value: { timezone: "America/New_York", weekly: [{ day: 1, opens: "09:00", closes: "17:00" }], overrides: [{ date: "2026-12-25", closed: true, label: "Holiday" }] }, source: "owner", verified: true, updatedAt: at, updatedBy: actor.userId },
  owner_recipient: { value: { email: "private-owner@example.test" }, source: "owner", verified: true, updatedAt: at, updatedBy: actor.userId },
}, services: [], people: [], contactCount: 0 });
const makePorts = () => {
  const claimed = new Set<string>();
  const ports = {
    enabled: vi.fn(() => true), released: vi.fn(async () => true), record: vi.fn(async () => record()),
    sites: vi.fn(async () => ({ systems: [{ system: { id: ws, kind: "website", lifecycle: "live" }, references: { tenantId: "gldf" } }] })),
    tenant: vi.fn(async () => ({ id: "gldf", active: true, deliveryModel: "custom_repo" })),
    allowed: vi.fn(async () => true), template: vi.fn(async () => ({ contentSections: ["contact"] })),
    manifest: vi.fn(async () => ({ sections: { contact: { allowedActions: ["read", "draft", "publish"] } } })),
    current: vi.fn(async () => current), draft: vi.fn(async () => null), queueAvailable: vi.fn(() => true),
    apply: vi.fn(async () => ({ status: "queued", eventId: "evt_fact_fixture" })),
    reviews: { claim: vi.fn(async (_actor: WorkspaceActor, workspace: string, tenant: string, revision: number) => { const key = `${workspace}:${tenant}:${revision}`; if (claimed.has(key)) return false; claimed.add(key); return true; }), record: vi.fn(async () => undefined) },
    report: vi.fn(async () => undefined),
  };
  return { ports, service: createNativeWebsiteFactService(ports as unknown as NativeWebsiteFactPorts) };
};
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => vi.stubEnv("STRELVA_WEBSITE_NATIVE_FACTS_ENABLED", "1"));

describe("native website facts review", () => {
  it("retains the approved contact shape, excluding private and unconfirmed record values", () => {
    const r = record();r.facts.phone!.source = "website_rebuild";
    const next = nativeContactFacts(r, ["phone", "email", "address", "hours", "owner_recipient"], current);
    expect(next.phone).toBe(current.phone);
    expect(next.email).toBe("public@example.test");expect(next.address).toBe("123 Fictional St, Buffalo, NY, 14201");
    expect(next.hours).toContain("Monday: 09:00–17:00");expect(next.hours).toContain("2026-12-25 (Holiday): Closed");expect(next.hours).toContain("Timezone: America/New_York");
    expect(next).toMatchObject({ headline: current.headline, description: current.description, instagramUrl: current.instagramUrl, locationDescription: current.locationDescription });
    expect(JSON.stringify(next)).not.toContain("private-owner");
    expect(nativeContactFacts(record(), ["phone"], current)).toMatchObject({ phone: "716-555-0123", email: current.email });
  });
  it("off means zero added reads, claims, drafts, queue or operator events", async () => {
    const { ports, service } = makePorts();ports.enabled.mockReturnValue(false);
    await service(actor, ws, 3, ["phone"]);
    for (const [name, mock] of Object.entries(ports)) if (name !== "enabled" && name !== "reviews") expect(mock).not.toHaveBeenCalled();
    expect(ports.reviews.claim).not.toHaveBeenCalled();
  });
  it("queues one exact revision under the shared forced-review path, including simultaneous repeats", async () => {
    const { ports, service } = makePorts();
    await Promise.all([service(actor, ws, 3, ["phone"]), service(actor, ws, 3, ["phone"])]);
    expect(ports.apply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tenantId: "gldf", section: "contact", data: { ...current, phone: "716-555-0123" }, forceReview: true, siteManifest: expect.anything(), requestId: `business-facts:${ws}:3` }));
    expect(ports.reviews.claim.mock.invocationCallOrder[0]).toBeLessThan(ports.apply.mock.invocationCallOrder[0]!);
    expect(ports.reviews.record).toHaveBeenCalledWith(expect.any(String), "queued", "evt_fact_fixture");
  });
  it("holds an existing draft instead of overwriting it", async () => {
    const { ports, service } = makePorts();ports.draft.mockResolvedValue(current as never);
    await service(actor, ws, 3, ["phone"]);
    expect(ports.apply).not.toHaveBeenCalled();expect(ports.reviews.record).toHaveBeenCalledWith(expect.any(String), "blocked", null);expect(ports.report).toHaveBeenCalledOnce();
  });
  it("never replays an uncertain queue result, even if storing its receipt fails", async () => {
    const { ports, service } = makePorts();ports.apply.mockRejectedValue(Error("queue accepted, response lost"));ports.reviews.record.mockRejectedValue(Error("receipt unavailable"));
    await service(actor, ws, 3, ["phone"]);await service(actor, ws, 3, ["phone"]);
    expect(ports.apply).toHaveBeenCalledOnce();expect(ports.report).toHaveBeenCalledOnce();expect(ports.reviews.record).toHaveBeenCalledWith(expect.any(String), "unconfirmed", null);
  });
  it.each(["permission", "subscription", "inactive", "repo", "template", "manifest", "release", "stale", "queue", "private", "unchanged"])("does not dispatch an unsupported %s path", async reason => {
    const { ports, service } = makePorts();
    if (reason === "permission" || reason === "subscription") ports.allowed.mockResolvedValue(false);
    if (reason === "inactive") ports.tenant.mockResolvedValue({ id: "gldf", active: false, deliveryModel: "custom_repo" });
    if (reason === "repo") ports.tenant.mockResolvedValue({ id: "mclears", active: true, deliveryModel: "custom_repo" });
    if (reason === "template") ports.template.mockResolvedValue({ contentSections: ["hero"] });
    if (reason === "manifest") ports.manifest.mockResolvedValue({ sections: { contact: { allowedActions: ["read"] } } });
    if (reason === "release") ports.released.mockResolvedValue(false);
    if (reason === "stale") ports.record.mockResolvedValue({ ...record(), revision: 4 });
    if (reason === "queue") ports.queueAvailable.mockReturnValue(false);
    if (reason === "unchanged") ports.current.mockResolvedValue({ ...current, phone: "716-555-0123" });
    await service(actor, ws, 3, [reason === "private" ? "owner_recipient" : "phone"]);
    expect(ports.apply).not.toHaveBeenCalled();expect(ports.reviews.claim).not.toHaveBeenCalled();
  });
  it("rechecks tenant permission at queue dispatch after claim", async () => {
    const { ports, service } = makePorts();ports.allowed.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await service(actor, ws, 3, ["phone"]);expect(ports.apply).not.toHaveBeenCalled();expect(ports.reviews.record).toHaveBeenCalledWith(expect.any(String), "blocked", null);
  });
  it.each(["manifest", "template", "native", "revision", "pause"])("rechecks %s after the durable claim before queue dispatch", async reason => {
    const { ports, service } = makePorts();
    if (reason === "manifest") ports.manifest.mockResolvedValueOnce({ sections: { contact: { allowedActions: ["draft"] } } }).mockResolvedValueOnce({ sections: { contact: { allowedActions: ["read"] } } });
    if (reason === "template") ports.template.mockResolvedValueOnce({ contentSections: ["contact"] }).mockResolvedValueOnce({ contentSections: [] });
    if (reason === "native") ports.tenant.mockResolvedValueOnce({ id: "gldf", active: true, deliveryModel: "custom_repo" }).mockResolvedValueOnce({ id: "mclears", active: true, deliveryModel: "custom_repo" });
    if (reason === "revision") ports.record.mockResolvedValueOnce(record()).mockResolvedValueOnce({ ...record(), revision: 4 });
    if (reason === "pause") ports.sites.mockResolvedValueOnce({ systems: [{ system: { id: ws, kind: "website", lifecycle: "live" }, references: { tenantId: "gldf" } }] }).mockResolvedValueOnce({ systems: [{ system: { id: ws, kind: "website", lifecycle: "paused" }, references: { tenantId: "gldf" } }] });
    await service(actor, ws, 3, ["phone"]);
    expect(ports.apply).not.toHaveBeenCalled();expect(ports.reviews.record).toHaveBeenCalledWith(expect.any(String), "blocked", null);
  });
  it("preserves fresh approved copy that changed while claiming the contact review", async () => {
    const { ports, service } = makePorts();ports.current.mockResolvedValueOnce(current).mockResolvedValueOnce({ ...current, headline: "New approved heading" });
    await service(actor, ws, 3, ["phone"]);
    expect(ports.apply).toHaveBeenCalledWith(expect.objectContaining({ data: { ...current, phone: "716-555-0123", headline: "New approved heading" } }));
  });
});

describe("accepted business patch app edge", () => {
  it("returns the exact committed patch even if native review preparation fails", async () => {
    const accepted = { workspaceId: ws, revision: 3, sequence: 3, changeCount: 1, undoOf: null, contacts: { created: 0, merged: 0, unchanged: 0 }, replayed: false };
    const patch = vi.fn(async () => accepted);const prepare = vi.fn(async () => { throw Error("native review unavailable"); });
    expect(await nativeWebsiteFactsPatch(patch, prepare)(actor, ws, 2, { facts: { phone: { value: "716-555-0123" } } }, { source: "owner" })).toBe(accepted);
    expect(prepare).toHaveBeenCalledWith(actor, ws, 3, ["phone"]);expect(patch).toHaveBeenCalledOnce();
    vi.stubEnv("STRELVA_WEBSITE_NATIVE_FACTS_ENABLED", "0");prepare.mockClear();
    expect(await nativeWebsiteFactsPatch(patch, prepare)(actor, ws, 2, {}, { source: "owner" })).toBe(accepted);expect(prepare).not.toHaveBeenCalled();
  });
  it("performs no preparation when the business patch itself fails", async () => {
    const patch = vi.fn(async () => { throw Error("business record conflict"); });const prepare = vi.fn();
    await expect(nativeWebsiteFactsPatch(patch, prepare)(actor, ws, 2, {}, { source: "owner" })).rejects.toThrow("conflict");expect(prepare).not.toHaveBeenCalled();
  });
  it("uses only server RPC authority and fails closed on invalid claim results", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    expect(await createNativeFactReviewStore({ rpc }).claim(actor, ws, "gldf", 3, ws)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("claim_native_website_fact_review", expect.objectContaining({ p_user_id: actor.userId, p_tenant_id: "gldf", p_record_revision: 3 }));
    rpc.mockResolvedValueOnce({ data: "true" as never, error: null });await expect(createNativeFactReviewStore({ rpc }).claim(actor, ws, "gldf", 3, ws)).rejects.toThrow();
  });
});
