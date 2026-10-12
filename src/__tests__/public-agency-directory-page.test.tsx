import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ user: vi.fn(), directory: vi.fn(), workspaces: vi.fn(), release: true, signup: false }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mock.user }));
vi.mock("@/platform/agency-directory", () => ({ readAgencyDirectory: mock.directory }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: mock.workspaces }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => mock.release }));
vi.mock("@/platform/agency-signup-release", () => ({ agencySignupReleaseEnabled: () => mock.signup }));
import AgenciesPage from "@/app/(marketing)/agencies/page";

beforeEach(() => {
  vi.clearAllMocks(); mock.release = true; mock.signup = false;
  mock.user.mockResolvedValue({ id: "owner", email: "owner@example.test", email_confirmed_at: "2026-10-12" });
  mock.directory.mockResolvedValue([{ agencyWorkspaceId: "north", name: "North Studio", summary: "Websites and booking systems." }]);
  mock.workspaces.mockResolvedValue([
    { id: "business", kind: "customer", access: "member", role: "owner", name: "Juniper" },
    { id: "read-only", kind: "customer", access: "provider_seat", role: "owner", name: "Unrelated" },
    { id: "member", kind: "customer", access: "member", role: "member", name: "Shared" },
  ]);
});
const render = async () => renderToStaticMarkup(await AgenciesPage());
describe("neutral public agency destination", () => {
  it("reads listed agencies with verified identity and opens only owned businesses in Help", async () => {
    const html = await render();
    expect(mock.directory).toHaveBeenCalledWith({ userId: "owner", verifiedEmail: "owner@example.test" });
    expect(html).toContain("North Studio");
    expect(html).toContain('href="/workspace?workspaceId=business&amp;view=help"');
    expect(html).not.toContain("Unrelated"); expect(html).not.toContain("Shared");
    expect(html).not.toContain("Ask Strelva Agency");
  });
  it("requires sign-in without inventing agency availability or reading private records", async () => {
    mock.user.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain("Sign in to see agencies for your business");
    expect(mock.directory).not.toHaveBeenCalled(); expect(mock.workspaces).not.toHaveBeenCalled();
  });
  it("keeps off and unverified states closed", async () => {
    mock.release = false;
    expect(await render()).toContain("New business accounts open soon");
    expect(mock.user).not.toHaveBeenCalled(); expect(mock.directory).not.toHaveBeenCalled();
    mock.release = true; mock.user.mockResolvedValue({ id: "owner", email: "owner@example.test", email_confirmed_at: null });
    expect(await render()).toContain("Sign in to see agencies"); expect(mock.directory).not.toHaveBeenCalled();
  });
  it("distinguishes failed directory and membership reads from empty records", async () => {
    mock.directory.mockRejectedValue(new Error("private provider detail")); mock.workspaces.mockRejectedValue(new Error("private provider detail"));
    const html = await render();
    expect(html).toContain("The agency list is unavailable"); expect(html).toContain("Your businesses couldn’t be read");
    expect(html).not.toContain("private provider detail"); expect(html).not.toContain("No agencies are listed yet");
  });
});
