import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  ensurePersonalWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  workspaceReleaseEnabled: vi.fn(),
  redirect: vi.fn(),
  router: { replace: vi.fn(), refresh: vi.fn() },
  continuationCookie: "",
  readPublicContinuationImport: vi.fn(),
}));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/platform/workspaces", () => ({
  ensurePersonalWorkspace: mocks.ensurePersonalWorkspace,
  listWorkspaces: mocks.listWorkspaces,
}));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.workspaceReleaseEnabled }));
vi.mock("@/platform/public-continuations/repository", () => ({ readPublicContinuationImport: mocks.readPublicContinuationImport }));
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
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => mocks.continuationCookie ? { value: mocks.continuationCookie } : undefined }) }));
vi.mock("@/experience/app-frame/StrelvaShell", () => ({
  StrelvaShell: ({ children }: { children: unknown }) => ({ type: "div", props: { children } }),
}));
vi.mock("@/experience/workspace/WorkspaceSignOutButton", () => ({
  WorkspaceSignOutButton: ({ className }: { className?: string }) => ({
    type: "button",
    props: { className, children: "Sign out" },
  }),
}));
vi.mock("@/experience/workspace/PublicContinuationCard", () => ({
  PublicContinuationCard: ({ brief, destinations, actorEmail }: { brief: { resultTitle: string; request: string }; destinations: Array<{ name: string; kind: string }>; actorEmail: string }) => ({
    type: "section",
    props: { children: [brief.resultTitle, brief.request, actorEmail, ...destinations.map((destination) => `${destination.name} · ${destination.kind}`)] },
  }),
}));
vi.mock("@/experience/workspace/AccountPayerInbox", () => ({
  AccountPayerInbox: () => ({ type: "div", props: { children: "Payer requests for this verified account" } }),
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

function linksFrom(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(linksFrom);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as { type?: unknown; props?: { href?: string; children?: unknown } };
  if (typeof element.type === "function") return linksFrom(element.type(element.props || {}));
  return [...(element.props?.href ? [element.props.href] : []), ...linksFrom(element.props?.children)];
}

describe("authenticated workspace account context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((target: string) => {
      throw new Error(`REDIRECT:${target}`);
    });
    mocks.workspaceReleaseEnabled.mockReturnValue(true);
    mocks.continuationCookie = "";
    mocks.readPublicContinuationImport.mockResolvedValue(null);
    mocks.ensurePersonalWorkspace.mockResolvedValue({
      id: "personal",
      kind: "personal",
      name: "My work",
      access: "member",
      role: "owner",
    });
    vi.stubEnv("PUBLIC_CONTINUATION_SECRET", "account-page-test-secret");
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
    expect(mocks.ensurePersonalWorkspace).toHaveBeenCalledWith({ userId: "user_123", verifiedEmail: "owner@example.com" });
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
    expect(linksFrom(page)).toContain("/workspace?workspaceId=personal");
    expect(linksFrom(page)).toContain("/workspace?workspaceId=customer");
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

  it("preserves the local entrance and escapes workspace identifiers", async () => {
    const { WorkspaceAccountView } = await import("@/experience/workspace/WorkspaceAccountView");
    const props = {
      appBase: "/preview/strelva",
      name: "Owner Example",
      email: "owner@example.com",
      emailConfirmed: true,
      releaseOpen: true,
      workspaces: [{ id: "client&view=access", kind: "customer" as const, name: "Client", access: "member" as const }],
    };
    expect(linksFrom(WorkspaceAccountView(props))).toContain("/preview/strelva/workspace?workspaceId=client%26view%3Daccess");
    for (const unavailable of [{ releaseOpen: false }, { emailConfirmed: false }, { workspacesUnavailable: true }]) {
      expect(linksFrom(WorkspaceAccountView({ ...props, ...unavailable }))).not.toContain("/preview/strelva/workspace?workspaceId=client%26view%3Daccess");
    }
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
    expect(mocks.ensurePersonalWorkspace).not.toHaveBeenCalled();
    expect(text).toContain("Confirmation needed");
    expect(text).toContain("Workspace access will appear after your email is confirmed");
    expect(text).not.toContain("Harbor Dental");
  });

  it("shows the retained request and offers only directly writable destinations", async () => {
    const { sealPublicContinuation } = await import("@/lib/public-continuation");
    mocks.continuationCookie = sealPublicContinuation({
      version: 1,
      id: "11111111-1111-4111-8111-111111111111",
      businessName: "Harbor Dental",
      request: "Follow up with every inquiry.",
      result: "Every inquiry has a next step.",
      resultTitle: "Inquiry follow-up brief",
      scope: "One source and one follow-up.",
      review: true,
      fileNames: [],
    }) || "";
    const { default: WorkspaceAccountPage } = await import("@/app/workspace/account/page");
    const page = await WorkspaceAccountPage({ searchParams: Promise.resolve({ continue: "public" }) });
    const text = textFrom(page);
    expect(text).toContain("Inquiry follow-up brief");
    expect(text).toContain("Follow up with every inquiry.");
    expect(text).toContain("My work · personal");
    expect(text).not.toContain("Harbor Dental · customer");
  });

  it("establishes the new account's personal destination before offering continuation", async () => {
    mocks.listWorkspaces.mockResolvedValueOnce([
      { id: "new-personal", kind: "personal", name: "new-owner's workspace", access: "member" },
    ]);
    const { sealPublicContinuation } = await import("@/lib/public-continuation");
    mocks.continuationCookie = sealPublicContinuation({
      version: 1,
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      businessName: "Public context only",
      request: "Prepare a private working brief.",
      result: "A saved brief.",
      resultTitle: "New account brief",
      scope: "Prepared text only.",
      review: true,
      fileNames: [],
    }) || "";
    const { default: WorkspaceAccountPage } = await import("@/app/workspace/account/page");
    const page = await WorkspaceAccountPage({ searchParams: Promise.resolve({ continue: "public" }) });
    const text = textFrom(page);

    expect(mocks.ensurePersonalWorkspace).toHaveBeenCalledBefore(mocks.listWorkspaces);
    expect(text).toContain("new-owner's workspace · personal");
    expect(text).toContain("owner@example.com");
  });

  it("keeps retained brief contents hidden from an unconfirmed account", async () => {
    const { sealPublicContinuation } = await import("@/lib/public-continuation");
    mocks.continuationCookie = sealPublicContinuation({
      version: 1,
      id: "11111111-1111-4111-8111-111111111111",
      businessName: "Private Business",
      request: "Private request text",
      result: "Private result",
      resultTitle: "Private title",
      scope: "Private scope",
      review: true,
      fileNames: [],
    }) || "";
    mocks.getSessionUser.mockResolvedValue({ id: "user_123", email: "owner@example.com", email_confirmed_at: null });
    const { default: WorkspaceAccountPage } = await import("@/app/workspace/account/page");
    const page = await WorkspaceAccountPage({ searchParams: Promise.resolve({ continue: "public" }) });
    const text = textFrom(page);
    expect(text).toContain("Confirm your email to continue");
    expect(text).not.toContain("Private request text");
    expect(mocks.listWorkspaces).not.toHaveBeenCalled();
  });

  it("does not reveal an already claimed brief to a different confirmed account", async () => {
    const { sealPublicContinuation } = await import("@/lib/public-continuation");
    mocks.continuationCookie = sealPublicContinuation({
      version: 1,
      id: "11111111-1111-4111-8111-111111111111",
      businessName: "Private Business",
      request: "Other account private request",
      result: "Private result",
      resultTitle: "Other account private title",
      scope: "Private scope",
      review: true,
      fileNames: [],
    }) || "";
    mocks.readPublicContinuationImport.mockRejectedValue(new Error("continuation unavailable"));
    const { default: WorkspaceAccountPage } = await import("@/app/workspace/account/page");
    const page = await WorkspaceAccountPage({ searchParams: Promise.resolve({ continue: "public" }) });
    const text = textFrom(page);
    expect(text).toContain("Public session unavailable");
    expect(text).not.toContain("Other account private request");
    expect(text).not.toContain("Other account private title");
  });

  it("recovers a lost import response with the exact saved document", async () => {
    const { sealPublicContinuation } = await import("@/lib/public-continuation");
    mocks.continuationCookie = sealPublicContinuation({
      version: 1,
      id: "11111111-1111-4111-8111-111111111111",
      businessName: "Harbor Dental",
      request: "Follow up with every inquiry.",
      result: "Every inquiry has a next step.",
      resultTitle: "Inquiry follow-up brief",
      scope: "One source and one follow-up.",
      review: true,
      fileNames: [],
    }) || "";
    mocks.readPublicContinuationImport.mockResolvedValue({
      workspaceId: "22222222-2222-4222-8222-222222222222",
      workId: "33333333-3333-4333-8333-333333333333",
    });
    const { default: WorkspaceAccountPage } = await import("@/app/workspace/account/page");
    const page = await WorkspaceAccountPage({ searchParams: Promise.resolve({ continue: "public" }) });
    const text = textFrom(page);
    expect(text).toContain("Public session saved");
    expect(linksFrom(page)).toContain("/workspace?workspaceId=22222222-2222-4222-8222-222222222222&work=33333333-3333-4333-8333-333333333333&view=document");
  });
});
