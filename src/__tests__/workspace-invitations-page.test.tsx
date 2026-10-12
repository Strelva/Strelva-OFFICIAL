import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InvitationsPage from "@/app/workspace/invitations/page";

const mocks = vi.hoisted(() => ({ enabled: vi.fn(), actor: vi.fn(), workspaces: vi.fn(), systems: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); }, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.enabled }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: mocks.actor }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: mocks.workspaces }));
vi.mock("@/platform/systems-release", () => ({ systemsReleasedFor: mocks.systems }));

const workspaceId = "11111111-1111-4111-8111-111111111111";
const actor = { userId: "22222222-2222-4222-8222-222222222222", verifiedEmail: "owner@example.test" };
beforeEach(() => {
  vi.clearAllMocks(); mocks.enabled.mockReturnValue(true); mocks.actor.mockResolvedValue(actor);
  mocks.workspaces.mockResolvedValue([{ id: workspaceId, name: "Example Law Firm" }]); mocks.systems.mockResolvedValue(false);
});

describe("invitation page presentation boundary", () => {
  it("keeps release-off and malformed scope outside private workspace reads", async () => {
    mocks.enabled.mockReturnValue(false);
    await expect(InvitationsPage({ searchParams: Promise.resolve({ workspaceId }) })).rejects.toThrow("redirect:/workspace");
    mocks.enabled.mockReturnValue(true);
    await expect(InvitationsPage({ searchParams: Promise.resolve({ workspaceId: "wrong" }) })).rejects.toThrow("redirect:/workspace?view=access");
    expect(mocks.actor).not.toHaveBeenCalled(); expect(mocks.workspaces).not.toHaveBeenCalled();
  });

  it("an unsigned visitor goes to sign-in with the exact invitation-page destination", async () => {
    mocks.actor.mockResolvedValue(null);
    await expect(InvitationsPage({ searchParams: Promise.resolve({ workspaceId }) })).rejects.toThrow(`redirect:/sign-in?next=${encodeURIComponent(`/workspace/invitations?workspaceId=${workspaceId}`)}`);
    expect(mocks.workspaces).not.toHaveBeenCalled(); expect(mocks.systems).not.toHaveBeenCalled();
  });

  it("uses the authorized workspace name and current release result", async () => {
    mocks.systems.mockResolvedValue(true);
    const html = renderToStaticMarkup(await InvitationsPage({ searchParams: Promise.resolve({ workspaceId }) }));
    expect(mocks.workspaces).toHaveBeenCalledWith(actor); expect(mocks.systems).toHaveBeenCalledWith(actor, workspaceId);
    expect(html).toContain("Example Law Firm"); expect(html).toContain('data-workspace-theme="linen"');
    expect(html).toContain("Invite someone");
  });

  it("presentation reads failing keep a neutral themed page without substituting another business", async () => {
    mocks.workspaces.mockRejectedValue(new Error("Unavailable")); mocks.systems.mockRejectedValue(new Error("Unavailable"));
    const html = renderToStaticMarkup(await InvitationsPage({ searchParams: Promise.resolve({ workspaceId }) }));
    expect(html).toContain("Business workspace"); expect(html).toContain("Invite someone"); expect(html).not.toContain("Example Law Firm");
  });
});
