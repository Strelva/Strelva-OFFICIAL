import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_READING_REPOS, siteEditingFor } from "@/products/websites/site-editing";
import { resolveWorkspaceSite, type WorkspaceSiteDeps } from "@/products/websites/workspace-site";
import { SITE_CHANGE_STAGE_LABEL, siteChangeRequestCommand, siteChangeStage, recordSiteChangeSchema, type SiteChangeRequest } from "@/products/websites/site-change-model";
import { sitePlaceForDashboardPath, workspaceDashboardHref, workspaceSiteHref, workspaceSiteTarget } from "@/platform/workspaces/site-places";
import { workspaceReturnTarget } from "@/platform/workspaces/location";
import { systemOriginId } from "@/platform/systems/invariants";
import type { ExistingSystemsSnapshot } from "@/platform/systems/from-existing";

const WS = "11111111-1111-4111-8111-111111111111";
const OTHER_WS = "22222222-2222-4222-8222-222222222222";
const GLDF = "aaaaaaaa-0000-4000-8000-000000000001";
const MCLEARS = "aaaaaaaa-0000-4000-8000-000000000002";
const gldfSystem = systemOriginId(WS, { kind: "tenant", ref: GLDF });
const mclearsSystem = systemOriginId(WS, { kind: "tenant", ref: MCLEARS });
const actor = { userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "ruth@gldf.example" };

describe("how a managed website changes", () => {
  it("edits natively exactly the repos whose manifest reads Strelva content, and hosted templates", () => {
    const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "release-manifest.json"), "utf8")) as { customRepoWorkspace: { repos: Array<{ tenant: string; v1Endpoints: string[] }> } };
    const readers = manifest.customRepoWorkspace.repos.filter((repo) => repo.v1Endpoints.includes("content")).map((repo) => repo.tenant).sort();
    expect([...CONTENT_READING_REPOS].sort()).toEqual(readers);
    expect(siteEditingFor({ id: "gldf", deliveryModel: "custom_repo" })).toBe("native");
    expect(siteEditingFor({ id: "rohlax" })).toBe("native");
    expect(siteEditingFor({ id: "rhm-innovations", deliveryModel: "custom_repo" })).toBe("native");
    expect(siteEditingFor({ id: "mclears", deliveryModel: "custom_repo" })).toBe("request");
    expect(siteEditingFor({ id: "vermont-unlimited" })).toBe("request");
    expect(siteEditingFor({ id: "tenant-zero", deliveryModel: "platform_template" })).toBe("native");
  });
});

describe("workspace website places", () => {
  it("builds and validates /workspace/site targets, and they survive sign-in", () => {
    const edit = workspaceSiteHref({ workspaceId: WS, systemId: gldfSystem });
    expect(edit).toBe(`/workspace/site?workspaceId=${WS}&system=${gldfSystem}`);
    const source = workspaceSiteHref({ workspaceId: WS, systemId: gldfSystem, tab: "source", source: "google-business" });
    for (const target of [edit, source, workspaceSiteHref({ workspaceId: WS, systemId: gldfSystem, tab: "history", request: "evt_9" })]) {
      expect(workspaceSiteTarget(target)).toBe(target);
      expect(workspaceReturnTarget(target)).toBe(target);
    }
    expect(workspaceReturnTarget(`/workspace/site?workspaceId=${WS}`)).toBe(`/workspace/site?workspaceId=${WS}`);
    expect(workspaceReturnTarget(`/workspace/site?workspaceId=${WS}&system=${gldfSystem}&tab=admin`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace/site?workspaceId=${WS}&system=${gldfSystem}&tab=source`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace/site?workspaceId=${WS}&system=${gldfSystem}&source=x`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace/site?workspaceId=${WS}&system=${gldfSystem}&next=https://evil.example`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace/site?workspaceId=${WS}&system=${gldfSystem}#x`)).toBeNull();
  });

  it("maps every moved /dashboard page to its tab", () => {
    expect(sitePlaceForDashboardPath("/dashboard/site")).toEqual({ tab: "edit" });
    expect(sitePlaceForDashboardPath("/dashboard/content")).toEqual({ tab: "edit" });
    expect(sitePlaceForDashboardPath("/dashboard/assets")).toEqual({ tab: "photos" });
    expect(sitePlaceForDashboardPath("/dashboard/brand-kit")).toEqual({ tab: "look" });
    expect(sitePlaceForDashboardPath("/dashboard/collections")).toEqual({ tab: "collections" });
    expect(sitePlaceForDashboardPath("/dashboard/history?request=evt_1")).toEqual({ tab: "history", request: "evt_1" });
    expect(sitePlaceForDashboardPath("/dashboard/integrations")).toEqual({ tab: "connections" });
    expect(sitePlaceForDashboardPath("/dashboard/sources/google-business")).toEqual({ tab: "source", source: "google-business" });
    expect(sitePlaceForDashboardPath("/dashboard/google")).toEqual({ tab: "google" });
    expect(sitePlaceForDashboardPath("/dashboard/review")).toBeNull();
  });

  it("keeps the reused panels' links in the workspace and their API calls on the tenant", () => {
    const href = workspaceDashboardHref({ workspaceId: WS, systemId: gldfSystem, tenantRoot: "/client/gldf" });
    expect(href("/api/content/hero?draft=true")).toBe("/client/gldf/api/content/hero?draft=true");
    expect(href("/dashboard/assets")).toBe(`/workspace/site?workspaceId=${WS}&system=${gldfSystem}&tab=photos`);
    expect(href("/dashboard/sources/google")).toBe(`/workspace/site?workspaceId=${WS}&system=${gldfSystem}&tab=source&source=google`);
    expect(href("/dashboard/review")).toBe("/client/gldf/dashboard/review");
    expect(href("/dashboard/chat")).toBe("/client/gldf/dashboard/chat");
    expect(href("/dashboard/settings#branding")).toBe("/client/gldf/dashboard/settings#branding");
    const withAsk = workspaceDashboardHref({ workspaceId: WS, systemId: gldfSystem, tenantRoot: "", askReleased: true });
    expect(withAsk("/dashboard/chat")).toBe(`/workspace?workspaceId=${WS}&system=${gldfSystem}&view=ask`);
    expect(withAsk("/api/publish")).toBe("/api/publish");
  });
});

function snapshot(): ExistingSystemsSnapshot {
  return { businessId: WS, scope: "business", savedWork: [], inquiryWorkspaces: [], bookingGrants: [], calendarConnections: [], managedWebsites: [
    { link: "tenant_link", tenantStableId: GLDF, tenantId: "gldf", siteName: "Great Lakes Dried Fruit", tenantActive: true, linkedAt: "2026-10-01T00:00:00Z" },
    { link: "tenant_link", tenantStableId: MCLEARS, tenantId: "mclears", siteName: "McClear's", tenantActive: true, linkedAt: "2026-10-01T00:00:00Z" },
  ] };
}

function deps(patch: Partial<WorkspaceSiteDeps> = {}, role: "owner" | "admin" | "member" = "owner"): WorkspaceSiteDeps {
  return {
    systemsReleased: async () => true,
    listWorkspaces: async () => [{ id: WS, kind: "customer", name: "Great Lakes Dried Fruit", access: "member", role }, { id: OTHER_WS, kind: "personal", name: "Personal", access: "member", role: "owner" }],
    readSystems: async () => snapshot(),
    tenantConfig: async (id) => ({ id, deliveryModel: "custom_repo" }),
    hasTenantAccess: async () => true,
    isOperator: async () => false,
    ...patch,
  };
}

describe("resolving /workspace/site", () => {
  it("opens the editor for a content-reading site and Ask for a change for a repo-only one", async () => {
    expect(await resolveWorkspaceSite(deps(), actor, WS, gldfSystem)).toMatchObject({ kind: "ready", editing: "native", role: "owner", canChange: true, tenantAccess: true, site: { tenantId: "gldf" } });
    expect(await resolveWorkspaceSite(deps(), actor, WS, mclearsSystem)).toMatchObject({ kind: "ready", editing: "request" });
  });

  it("lets a member see but not change", async () => {
    expect(await resolveWorkspaceSite(deps({}, "member"), actor, WS, gldfSystem)).toMatchObject({ kind: "ready", canChange: false });
  });

  it("is off where Systems are off for the workspace", async () => {
    expect(await resolveWorkspaceSite(deps({ systemsReleased: async () => false }), actor, WS, gldfSystem)).toEqual({ kind: "off" });
  });

  it("refuses non-members, personal workspaces and delegated read", async () => {
    expect(await resolveWorkspaceSite(deps({ listWorkspaces: async () => [] }), actor, WS, gldfSystem)).toEqual({ kind: "permission" });
    expect(await resolveWorkspaceSite(deps(), actor, OTHER_WS, gldfSystem)).toEqual({ kind: "permission" });
    expect(await resolveWorkspaceSite(deps({ listWorkspaces: async () => [{ id: WS, kind: "customer", name: "x", access: "delegated_read", role: null }] }), actor, WS, gldfSystem)).toEqual({ kind: "permission" });
  });

  it("finds a site only through this business's link: another business's System id opens nothing", async () => {
    const foreign = systemOriginId(OTHER_WS, { kind: "tenant", ref: GLDF });
    expect(await resolveWorkspaceSite(deps(), actor, WS, foreign)).toEqual({ kind: "not_found" });
  });

  it("says when the person lacks the tenant's own permission, and fails closed on a read error", async () => {
    expect(await resolveWorkspaceSite(deps({ hasTenantAccess: async () => false }), actor, WS, gldfSystem)).toMatchObject({ kind: "ready", tenantAccess: false });
    expect(await resolveWorkspaceSite(deps({ readSystems: async () => { throw new Error("db down"); } }), actor, WS, gldfSystem)).toEqual({ kind: "error" });
  });
});

describe("website change Requests", () => {
  const base: SiteChangeRequest = { id: "c7a1e0b2-0000-4000-8000-000000000001", request: "Add a page", status: "requested", accepted: "pending", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", receipts: [] };
  const receipt = (kind: "preview" | "approved" | "declined" | "deployed", readBack: "confirmed" | "not_confirmed" | null = null) => ({ id: crypto.randomUUID(), kind, previewUrl: null, commitSha: kind === "deployed" ? "abc1234" : null, deploymentUrl: null, readBack, note: null, recordedAt: "2026-10-02T00:00:00Z" });

  it("reads its stage from the newest receipt and never calls a failed read-back done", () => {
    expect(siteChangeStage(base)).toBe("asked");
    expect(siteChangeStage({ ...base, accepted: "accepted" })).toBe("in_progress");
    expect(siteChangeStage({ ...base, receipts: [receipt("preview")] })).toBe("ready_for_review");
    expect(siteChangeStage({ ...base, receipts: [receipt("preview"), receipt("approved")] })).toBe("approved");
    expect(siteChangeStage({ ...base, receipts: [receipt("preview"), receipt("declined")] })).toBe("declined");
    expect(siteChangeStage({ ...base, receipts: [receipt("preview"), receipt("approved"), receipt("deployed", "confirmed")] })).toBe("done");
    expect(siteChangeStage({ ...base, receipts: [receipt("preview"), receipt("approved"), receipt("deployed", "not_confirmed")] })).toBe("done_unconfirmed");
    expect(siteChangeStage({ ...base, status: "withdrawn" })).toBe("withdrawn");
    expect(SITE_CHANGE_STAGE_LABEL.asked).not.toMatch(/accepted/i);
  });

  it("files a Request to Strelva with the System and the person's words", () => {
    const command = siteChangeRequestCommand({ workspaceId: WS, systemId: mclearsSystem, tenantStableId: MCLEARS, editing: "request", words: "  Add a private events page ", page: "Home", idempotencyKey: "k1" });
    expect(command).toEqual({
      action: "save", businessId: WS, status: "requested", request: "Add a private events page", outcome: "Add a private events page",
      context: { source: "website_change", systemId: mclearsSystem, tenantStableId: MCLEARS, implementation: "custom_repo", page: "Home" },
      scope: ["website.repo_change"], provider: { kind: "strelva" }, idempotencyKey: "k1",
    });
  });

  it("only accepts https previews and complete deploy receipts", () => {
    expect(recordSiteChangeSchema.safeParse({ kind: "preview", previewUrl: "http://x.test" }).success).toBe(false);
    expect(recordSiteChangeSchema.safeParse({ kind: "preview", previewUrl: "https://x.vercel.app" }).success).toBe(true);
    expect(recordSiteChangeSchema.safeParse({ kind: "deployed", commitSha: "abc1234", deploymentUrl: "https://x.vercel.app" }).success).toBe(false);
    expect(recordSiteChangeSchema.safeParse({ kind: "deployed", commitSha: "abc1234", deploymentUrl: "https://x.vercel.app", readBack: "confirmed" }).success).toBe(true);
    expect(recordSiteChangeSchema.safeParse({ kind: "approved", approve: true }).success).toBe(false);
  });
});
