import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import { projectInquirySystemDetail, readInquirySystemDetails } from "@/products/inquiries/system-detail";
import { InquirySystemDetailView } from "@/experience/places/InquirySystemDetails";
const mocks = vi.hoisted(() => ({ linked: vi.fn(), config: vi.fn(), resolve: vi.fn(), snapshot: vi.fn(), context: vi.fn(), rpc: vi.fn(), systems: vi.fn() }));
vi.mock("@/platform/owner-entry/linked-sites", () => ({ readLinkedSites: mocks.linked }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.config }));
vi.mock("@/products/inquiries/workspace-exit", () => ({ resolveInquiryWorkspace: mocks.resolve }));
vi.mock("@/products/inquiries/repository", () => ({ getInquiryRepository: () => ({ getSnapshot: mocks.snapshot }) }));
vi.mock("@/products/inquiries/business-context", async original => ({ ...await original<object>(), readInquiryBusinessContext: mocks.context }));
vi.mock("@/platform/infra/inquiry-records", () => ({ inquiryRecordsRpc: mocks.rpc }));
vi.mock("@/platform/systems", () => ({ createSupabaseSystemStore: () => ({}), listBusinessSystems: mocks.systems }));
const actor = { userId: "d7100000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const workspace = "d7100000-0000-4000-8000-000000000002";
function state() {
  const engine = new InquiryEngine({ businessId: workspace, now: () => "2026-10-10T12:00:00Z" });
  const work = engine.start({ actorId: actor.userId, intent: "quote inquiry" });
  engine.acceptShape(work.id, { actorId: actor.userId });
  const result = engine.snapshot();
  result.capabilities[0]!.live = result.requests[0]!.draft;
  result.capabilities[0]!.status = "live_unverified";
  return result;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.linked.mockResolvedValue({ sites: [{ tenantId: "fixture", siteName: "Fixture", tenantStableId: workspace }], denied: [{ tenantId: "denied", siteName: "Private" }] });
  mocks.config.mockResolvedValue({ stableId: workspace }); mocks.resolve.mockResolvedValue({ businessId: workspace });
  mocks.snapshot.mockResolvedValue({ state: state() }); mocks.context.mockResolvedValue(null); mocks.rpc.mockResolvedValue([]);
  mocks.systems.mockResolvedValue({ systems: [] });
});
afterEach(() => vi.unstubAllEnvs());
describe("the Inquiries System's current form", () => {
  it("shows a viewing copy, lifecycle and honest health without private routing or customer builder words", () => {
    const detail = projectInquirySystemDetail("Fixture", state());
    const html = renderToStaticMarkup(<InquirySystemDetailView details={[detail]} />);
    expect(html).toContain("viewing copy"); expect(html).toContain("<fieldset disabled"); expect(html).toContain("Live");
    expect(html).toContain("publication has not been confirmed"); expect(html).toContain("Connections"); expect(html).toContain("History");
    expect(html).not.toMatch(/Capability|Responsibility|Rehearsal|Shape|Agent|routing\.destination/);
    expect(detail.forms[0]).not.toHaveProperty("routing");
    const ordered = renderToStaticMarkup(<InquirySystemDetailView details={[detail]} records={<p>Fixture inquiry records</p>} />);
    expect(ordered.indexOf("viewing copy")).toBeLessThan(ordered.indexOf("Fixture inquiry records"));
    expect(ordered.indexOf("Fixture inquiry records")).toBeLessThan(ordered.indexOf("Connections and History"));
    const paused = projectInquirySystemDetail("Fixture", { ...state(), capabilities: state().capabilities.map(cap => ({ ...cap, status: "paused" })) });
    expect(paused).toMatchObject({ lifecycle: "paused", forms: [] });
    expect(renderToStaticMarkup(<InquirySystemDetailView details={[paused]} />)).toContain("New inquiries are kept");
  });
  it("checks linked-site authority before reading forms and never reads a denied site's engine", async () => {
    const details = await readInquirySystemDetails(actor, workspace);
    expect(mocks.linked).toHaveBeenCalledWith(actor, workspace);
    expect(mocks.snapshot).toHaveBeenCalledExactlyOnceWith("fixture", workspace);
    expect(JSON.stringify(details)).not.toContain("Private");
    mocks.linked.mockRejectedValue(new Error("revoked"));
    await expect(readInquirySystemDetails(actor, workspace)).rejects.toThrow("revoked");
  });
  it("keeps lifecycle live while reporting a bounced owner address, and storage failure cannot become an empty success", async () => {
    mocks.rpc.mockResolvedValue([{ status: "bounced" }]);
    expect((await readInquirySystemDetails(actor, workspace))[0]).toMatchObject({ lifecycle: "live", health: expect.stringContaining("owner email bounced") });
    mocks.snapshot.mockRejectedValue(new Error("DB down"));
    expect((await readInquirySystemDetails(actor, workspace))[0]).toMatchObject({ unavailable: true, health: expect.stringContaining("couldn't be read") });
  });
  it("shows shares-with only for a real booking System visible in this business", async () => {
    mocks.systems.mockResolvedValue({ systems: [{ system: { kind: "booking", name: "Party requests" } }, { system: { kind: "website", name: "Website" } }] });
    const detail = (await readInquirySystemDetails(actor, workspace))[0]!;
    expect(mocks.systems).toHaveBeenCalledWith(actor, workspace, { store: {} });
    expect(detail.connections.filter(item => item.kind === "shares with")).toEqual([{ kind: "shares with", target: "Party requests", sentence: expect.stringContaining("same business contact") }]);
    mocks.systems.mockRejectedValue(new Error("not available"));
    expect((await readInquirySystemDetails(actor, workspace))[0]!.connections.some(item => item.kind === "shares with")).toBe(false);
  });
});
