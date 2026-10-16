import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ session: vi.fn(), list: vi.fn() }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/agency-prospecting/server", async importOriginal => ({ ...await importOriginal<object>(), listAgencyProspects: mocks.list }));
const chrome = vi.hoisted(() => ({ clients: vi.fn() }));
vi.mock("@/experience/places/place-chrome-server", () => ({ readAgencyClients: chrome.clients }));
import ProspectsPage from "@/app/workspace/prospects/page";
import { AgencyProspectingError } from "@/platform/agency-prospecting/server";
const workspace = "b2770000-0000-4000-8000-000000000010";
beforeEach(() => {
  vi.clearAllMocks(); mocks.session.mockResolvedValue({ id: "member", email: "north@agency.test", email_confirmed_at: "2026-10-07" }); mocks.list.mockResolvedValue([]); chrome.clients.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());
const render = async (prospect?: string) => renderToStaticMarkup(await ProspectsPage({ searchParams: Promise.resolve({ workspace, ...(prospect ? { prospect } : {}) }) }));
const row = (patch: Record<string, unknown> = {}) => ({ id: "5e000000-0000-4000-8000-0000000001a1", business: "Fixture <script>", name: "Owner", email: "owner@fixture.test", url: "https://fixture.example", source: "monitor", result_id: "r", grade: "F", score: 40, created_at: "2026-10-07T12:00:00Z", ...patch });

describe("agency prospect member UI states", () => {
  it("asks signed-out users to sign in without reading leads", async () => {
    mocks.session.mockResolvedValue(null);
    expect(await render()).toContain("Sign in with a verified account"); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("shows an empty state for an agency with no check results", async () => {
    expect(await render()).toContain("No one has run your check yet."); expect(mocks.list).toHaveBeenCalledWith(workspace, "member", "north@agency.test");
  });
  it("shows membership denial without a lead table", async () => {
    mocks.list.mockRejectedValue(new AgencyProspectingError("Agency membership is required.", 403));
    const html = await render(); expect(html).toContain('role="alert"'); expect(html).toContain("Agency membership is required."); expect(html).not.toContain("<table");
  });
  it("shows a readable outage state without an empty-list success claim", async () => {
    mocks.list.mockRejectedValue(new Error("Database down"));
    const html = await render(); expect(html).toContain("temporarily unavailable"); expect(html).not.toContain("No one has run your check yet.");
  });
  it("lists check results beside the opened one, escapes content and states the grade without a score readout", async () => {
    mocks.list.mockResolvedValue([row()]);
    const html = await render();
    expect(html).toContain("Fixture &lt;script&gt;"); expect(html).toContain("owner@fixture.test");
    expect(html).toContain("Answer check: F"); expect(html).not.toContain("40/100"); expect(html).not.toContain("latest 200");
    expect(html).not.toContain(">Prospects<");
    // One ink pill, in the opened business only; rows open the business instead of carrying a pill each.
    expect(html.match(/data-xa-primary="true"/g)).toHaveLength(1);
    expect(html).toContain("?workspace=" + workspace + "&amp;prospect=5e000000-0000-4000-8000-0000000001a1");
  });
  it("marks a business the agency already runs instead of offering to add it again", async () => {
    mocks.list.mockResolvedValue([row({ business: "Harbor Dental" })]);
    chrome.clients.mockResolvedValue([{ id: "c1", name: "Harbor Dental", href: "/workspace?workspaceId=c1", color: "#2f5236" }]);
    const html = await render("5e000000-0000-4000-8000-0000000001a1");
    expect(html).toContain("Already a client"); expect(html).toContain("Open Harbor Dental"); expect(html).not.toContain(">Add as client<");
  });
});
