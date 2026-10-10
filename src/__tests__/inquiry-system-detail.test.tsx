import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import { projectInquirySystemDetail, projectInquiryRunning, readInquirySystemDetails } from "@/products/inquiries/system-detail";
import { InquirySystemDetailView } from "@/experience/places/InquirySystemDetails";
const mocks = vi.hoisted(() => ({ linked: vi.fn(), config: vi.fn(), resolve: vi.fn(), snapshot: vi.fn(), context: vi.fn(), rpc: vi.fn(), systems: vi.fn(), connected: vi.fn() }));
vi.mock("@/products/inquiries/linked-leads", () => ({ readConnectedSiteInquiries: mocks.connected }));
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
  mocks.systems.mockResolvedValue({ systems: [] }); mocks.connected.mockResolvedValue(null);
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
  it("names authorized connected and native sources without claiming their forms or history are known", async () => {
    mocks.connected.mockResolvedValue([{ siteHost: "outside.example.test", siteId: "outside", inquiries: [] }]);
    mocks.systems.mockResolvedValue({ systems: [{ system: { kind: "website", name: "Native website" }, references: { savedWorkId: "native", tenantStableId: null } }] });
    const details = await readInquirySystemDetails(actor, workspace);
    expect(mocks.connected).toHaveBeenCalledWith(actor, workspace);
    const html = renderToStaticMarkup(<InquirySystemDetailView details={details} />);
    expect(html).toContain("outside.example.test"); expect(html).toContain("Native website");
    expect(html).toContain("managed on your site"); expect(html).toContain("change history is unavailable");
    expect(details.filter(item => item.formSource).every(item => item.forms.length === 0 && item.history.length === 0)).toBe(true);
    mocks.connected.mockRejectedValue(new Error("revoked"));
    expect((await readInquirySystemDetails(actor, workspace)).some(item => item.site === "outside.example.test")).toBe(false);
  });
  it("Running reflects only the current accepted policy, its hours, trust, block and pause without a day promise", () => {
    const engine = new InquiryEngine({ businessId: workspace });
    const work = engine.start({ actorId: actor.userId, intent: "quote inquiry" });
    engine.acceptShape(work.id, { actorId: actor.userId });
    engine.createResponsibility({ actorId: actor.userId, capabilityId: work.capabilityId!, title: "Reply", scope: "Ordinary inquiries", allowedActions: ["reply"],
      escalation: { primary: "private@example.test", secondary: null }, budget: { dailyMessages: 12, timezone: "America/New_York" },
      hours: { timezone: "America/New_York", days: [1, 3], start: "09:00", end: "17:00" } });
    const current = engine.snapshot();
    expect(projectInquiryRunning("Fixture", current, workspace)).toEqual([]);
    current.capabilities[0]!.live = current.requests[0]!.draft; current.capabilities[0]!.status = "live";
    const rows = projectInquiryRunning("Fixture", current, workspace);
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ status: "active", sentence: expect.stringContaining("Strelva reviews ordinary replies") });
    expect(rows[0]!.sentence).toContain("Mon, Wed, 09:00–17:00 America/New_York; up to 12");
    expect(JSON.stringify(rows)).not.toMatch(/private@example|sponsorId|answered within a day/);
    current.responsibilities[0]!.trust = "trusted"; current.responsibilities[0]!.preAuthorizedActions = ["reply"];
    expect(projectInquiryRunning("Fixture", current, workspace)[0]!.sentence).toContain("may send ordinary replies");
    current.responsibilities[0]!.never = [{ action: "reply", sentence: "Do not reply" }];
    expect(projectInquiryRunning("Fixture", current, workspace)[0]!.sentence).toContain("Replies are blocked");
    current.capabilities[0]!.status = "paused";
    expect(projectInquiryRunning("Fixture", current, workspace)[0]).toMatchObject({ status: "paused", sentence: expect.stringContaining("Incoming inquiries stay kept") });
    current.capabilities[0]!.status = "live"; current.responsibilities[0]!.status = "paused";
    expect(projectInquiryRunning("Fixture", current, workspace)[0]!.status).toBe("paused");
    current.responsibilities.push({ ...current.responsibilities[0]!, id: "older", createdAt: "2020-01-01T00:00:00Z" });
    expect(projectInquiryRunning("Fixture", current, workspace)).toHaveLength(1);
    expect(projectInquiryRunning("Fixture", null, workspace)).toEqual([]);
    expect(projectInquiryRunning("Fixture", current, "foreign-business")).toEqual([]);
  });
  it("refuses a delegated or revoked actor before reading a Running policy", async () => {
    mocks.linked.mockRejectedValue(new Error("direct membership required"));
    await expect(readInquirySystemDetails({ ...actor, userId: "delegated" }, workspace)).rejects.toThrow("direct membership");
    expect(mocks.snapshot).not.toHaveBeenCalled(); expect(mocks.systems).not.toHaveBeenCalled();
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
