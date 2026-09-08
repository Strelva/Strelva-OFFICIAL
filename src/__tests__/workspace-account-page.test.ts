import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  listWorkspaces: vi.fn(),
  workspaceReleaseEnabled: vi.fn(),
  redirect: vi.fn(),
  router: { replace: vi.fn(), refresh: vi.fn() },
}));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: mocks.listWorkspaces }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.workspaceReleaseEnabled }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: unknown; href: string }) => ({
    type: "a",
    props: { children, href },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  useRouter: () => mocks.router,
}));
vi.mock("@/experience/app-frame/StrelvaShell", () => ({
  StrelvaShell: ({ children }: { children: unknown }) => ({ type: "div", props: { children } }),
}));
vi.mock("@/experience/workspace/WorkspaceSignOutButton", () => ({
  WorkspaceSignOutButton: ({ className }: { className?: string }) => ({
    type: "button",
    props: { className, children: "Sign out" },
  }),
}));

function textFrom(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFrom).join(" ");
  if (typeof node === "object" && "props" in node) {
    const element = node as { type?: unknown; props?: { children?: unknown } };
    if (typeof element.type === "function") return textFrom(element.type(element.props || {}));
    return textFrom(element.props?.children);
  }
  return "";
}

describe("authenticated workspace account context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((target: string) => {
      throw new Error(`REDIRECT:${target}`);
    });
    mocks.workspaceReleaseEnabled.mockReturnValue(true);
    mocks.getSessionUser.mockResolvedValue({
      id: "user_123",
      email: "Owner@Example.com",
      email_confirmed_at: "2026-09-05T12:00:00.000Z",
      user_metadata: { full_name: "Owner Example" },
    });
    mocks.listWorkspaces.mockResolvedValue([
      { id: "personal", kind: "personal", name: "My work", access: "member" },
      { id: "customer", kind: "customer", name: "Harbor Dental", access: "delegated_read" },
    ]);
  });

  it("redirects signed-out visitors to workspace sign-in", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    const { default: WorkspaceAccountPage } = await import("@/app/workspace/account/page");

    await expect(WorkspaceAccountPage()).rejects.toThrow("REDIRECT:/sign-in?next=%2Fworkspace");
    expect(mocks.listWorkspaces).not.toHaveBeenCalled();
  });

  it("renders verified identity and read-only workspace access without changing permissions", async () => {
    const { default: WorkspaceAccountPage } = await import("@/app/workspace/account/page");

    const page = await WorkspaceAccountPage();
    const text = textFrom(page);

    expect(mocks.listWorkspaces).toHaveBeenCalledWith({ userId: "user_123", verifiedEmail: "owner@example.com" });
    expect(text).toContain("Account");
    expect(text).toContain("Owner Example");
    expect(text).toContain("owner@example.com");
    expect(text).toContain("Confirmed");
    expect(text).toContain("My work");
    expect(text).toContain("Personal workspace");
    expect(text).toContain("Member access");
    expect(text).toContain("Harbor Dental");
    expect(text).toContain("Customer workspace");
    expect(text).toContain("Read-only access");
    expect(text).toContain("Each site keeps its own people, settings, and agreed service");
  });

  it("keeps identity useful and bounds workspace-store failures", async () => {
    mocks.listWorkspaces.mockRejectedValue(new Error("database password secret"));
    const { default: WorkspaceAccountPage } = await import("@/app/workspace/account/page");

    const page = await WorkspaceAccountPage();
    const text = textFrom(page);

    expect(text).toContain("Workspace access is temporarily unavailable");
    expect(text).not.toContain("database password secret");
    expect(text).toContain("Owner Example");
  });

  it("does not enumerate workspace records for an unconfirmed email", async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: "user_123",
      email: "Owner@Example.com",
      email_confirmed_at: null,
    });
    const { default: WorkspaceAccountPage } = await import("@/app/workspace/account/page");

    const page = await WorkspaceAccountPage();
    const text = textFrom(page);

    expect(mocks.listWorkspaces).not.toHaveBeenCalled();
    expect(text).toContain("Confirmation needed");
    expect(text).toContain("Workspace access will appear after your email is confirmed");
    expect(text).not.toContain("Harbor Dental");
  });
});
