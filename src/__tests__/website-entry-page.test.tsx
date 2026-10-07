import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ session: vi.fn(), workspace: vi.fn(), systems: vi.fn(), connected: vi.fn(), rebuild: vi.fn(), sites: vi.fn(), records: vi.fn(), operator: vi.fn(), resolve: vi.fn(), editor: vi.fn(), config: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (location: string) => { throw new Error(`redirect:${location}`); }, usePathname: () => "/workspace/site" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }) }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: f.session }));
vi.mock("@/platform/infra/auth", () => ({ hasTenantAccess: async () => true, isSuperAdmin: f.operator }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/systems-release", () => ({ systemsReleaseEnabledForWorkspace: f.systems }));
vi.mock("@/platform/systems/from-existing", () => ({ readExistingSystemsSnapshot: vi.fn() }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: f.workspace }));
vi.mock("@/platform/ask/release", () => ({ askReleaseMayBeOn: () => false }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: f.config }));
vi.mock("@/lib/website-page-data", () => ({ loadSiteEditorData: f.editor, loadBrandKitSettings: vi.fn(), loadCollectionsData: vi.fn(), loadGoogleBusinessData: vi.fn(), siteFrameFor: () => ({ siteUrl: "https://synthetic.example.test", previewUrl: "", siteModel: "food-brand", liveSyncEnabled: false, autoPublish: false }) }));
vi.mock("@/products/websites/server", () => ({ resolveWorkspaceSite: f.resolve }));
vi.mock("@/products/websites/index", () => ({ listWebsiteRebuilds: f.records, websiteRebuildReleasedFor: f.rebuild }));
vi.mock("@/products/websites/rebuild-release", () => ({ websiteRebuildReleasedFor: f.rebuild }));
vi.mock("@/products/connected-sites/server", () => ({ connectedSitesReleasedFor: f.connected, readConnectedSites: f.sites }));
vi.mock("@/experience/app-frame/StrelvaShell", () => ({ StrelvaShell: ({ children }: { children: React.ReactNode }) => createElement("main", {}, children) }));
import WorkspaceSitePage from "@/app/workspace/site/page";

const WS = "11111111-1111-4111-8111-111111111111";
const SYSTEM = "aaaaaaaa-0000-4000-8000-000000000001";
const query = (more: Record<string, string> = {}) => ({ searchParams: Promise.resolve({ workspaceId: WS, ...more }) });
const render = async (more: Record<string, string> = {}) => renderToStaticMarkup(await WorkspaceSitePage(query(more)));
beforeEach(() => {
  for (const mock of Object.values(f)) mock.mockReset();
  f.session.mockResolvedValue({ id: "actor", email: "owner@example.test", email_confirmed_at: "2026-10-06" });
  f.workspace.mockResolvedValue([{ id: WS, kind: "customer", access: "member", role: "owner", name: "Synthetic business" }]);
  f.systems.mockResolvedValue(true); f.connected.mockResolvedValue(true); f.rebuild.mockResolvedValue(true); f.operator.mockResolvedValue(false); f.records.mockResolvedValue([]); f.sites.mockResolvedValue({ sites: [] }); f.config.mockResolvedValue(undefined);
  f.resolve.mockResolvedValue({ kind: "ready", editing: "native", operator: false, role: "owner", canChange: true, tenantAccess: true, workspaceName: "Synthetic business", site: { tenantId: "gldf", tenantStableId: "stable", siteName: "Synthetic website", tenantActive: true } });
});

describe("website entry page authorization and release boundaries", () => {
  it("shows a neutral choice, reads only the selected released provider, and keeps disabled routes closed", async () => {
    expect(await render()).toContain("Your website in Strelva"); expect(f.sites).not.toHaveBeenCalled(); expect(f.records).not.toHaveBeenCalled();
    expect(await render({ entry: "connect" })).toContain("Get my two lines"); expect(f.sites).toHaveBeenCalledTimes(1); expect(f.records).not.toHaveBeenCalled();
    f.connected.mockResolvedValue(false);
    expect(await render({ entry: "connect" })).not.toContain("<form"); expect(f.sites).toHaveBeenCalledTimes(1);
    expect(await render({ entry: "rebuild" })).toContain("Your current website"); expect(f.records).toHaveBeenCalledTimes(1);
    f.rebuild.mockResolvedValue(false);
    await expect(render()).rejects.toThrow(`redirect:/workspace?workspaceId=${WS}`);
  });
  it("requires Systems, active membership, and verified sign-in before reading either path", async () => {
    f.systems.mockResolvedValue(false); await expect(render({ entry: "rebuild" })).rejects.toThrow("redirect:/workspace?");
    f.systems.mockResolvedValue(true); f.workspace.mockResolvedValue([]); expect(await render({ entry: "connect" })).toContain("isn&#x27;t available to your account");
    f.session.mockResolvedValue(null); await expect(render({ entry: "rebuild", workId: SYSTEM })).rejects.toThrow(`redirect:/sign-in?next=${encodeURIComponent(`/workspace/site?workspaceId=${WS}&entry=rebuild&workId=${SYSTEM}`)}`);
    expect(f.sites).not.toHaveBeenCalled(); expect(f.records).not.toHaveBeenCalled();
  });
  it("shows a retryable read failure without offering creation from a failed list", async () => {
    f.records.mockRejectedValue(new Error("Database unavailable"));
    const html = await render({ entry: "rebuild" }); expect(html).toContain("couldn&#x27;t be loaded just now"); expect(html).not.toContain("Build a private preview");
  });
  it("maps native owner editor deep links to Requests before loading editable content", async () => {
    const html = await render({ system: SYSTEM, tab: "edit" });
    expect(html).toContain('data-tab="request"'); expect(html).not.toContain('data-tab="edit"'); expect(f.editor).not.toHaveBeenCalled();
  });
});
