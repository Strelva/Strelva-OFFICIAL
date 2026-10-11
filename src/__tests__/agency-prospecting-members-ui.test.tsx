import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ session: vi.fn(), list: vi.fn() }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/agency-prospecting/server", async importOriginal => ({ ...await importOriginal<object>(), listAgencyProspects: mocks.list }));
import ProspectsPage from "@/app/workspace/prospects/page";
import { AgencyProspectingError } from "@/platform/agency-prospecting/server";
const workspace = "b2770000-0000-4000-8000-000000000010";
beforeEach(() => {
  vi.clearAllMocks(); mocks.session.mockResolvedValue({ id: "member", email: "north@agency.test", email_confirmed_at: "2026-10-07" }); mocks.list.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());
const render = async () => renderToStaticMarkup(await ProspectsPage({ searchParams: Promise.resolve({ workspace }) }));

describe("agency prospect member UI states", () => {
  it("asks signed-out users to sign in without reading leads", async () => {
    mocks.session.mockResolvedValue(null);
    expect(await render()).toContain("Sign in with a verified account"); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("shows an empty state for an agency with no prospects", async () => {
    expect(await render()).toContain("No prospects yet."); expect(mocks.list).toHaveBeenCalledWith(workspace, "member", "north@agency.test");
  });
  it("shows membership denial without a lead table", async () => {
    mocks.list.mockRejectedValue(new AgencyProspectingError("Agency membership is required.", 403));
    const html = await render(); expect(html).toContain('role="alert"'); expect(html).toContain("Agency membership is required."); expect(html).not.toContain("<table");
  });
  it("shows a readable outage state without an empty-list success claim", async () => {
    mocks.list.mockRejectedValue(new Error("Database down"));
    const html = await render(); expect(html).toContain("temporarily unavailable"); expect(html).not.toContain("No prospects yet.");
  });
  it("renders returned member prospects in a semantic table and escapes content", async () => {
    mocks.list.mockResolvedValue([{ id: "prospect", business: "Fixture <script>", name: "Owner", email: "owner@fixture.test", url: "https://fixture.example", source: "monitor", grade: "F", score: 40, created_at: "2026-10-07T12:00:00Z" }]);
    const html = await render(); expect(html).toContain("<table"); expect(html).toContain('scope="col"'); expect(html).toContain("Fixture &lt;script&gt;"); expect(html).toContain("owner@fixture.test");
  });
});
