import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

const mocks = vi.hoisted(() => ({ user: vi.fn(), business: vi.fn(), work: vi.fn(), google: vi.fn(), connect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); }, notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.user }));
vi.mock("@/platform/workspaces/repository", () => ({ getWork: mocks.work }));
vi.mock("@/products/getting-started/server", () => ({ gettingStarted: { read: mocks.business } }));
vi.mock("@/products/connected-sites/server", () => ({ connectedSitesReleasedFor: mocks.connect }));
vi.mock("@/products/publishing/server", () => ({ publishingEnabledForWorkspace: mocks.google }));
vi.mock("@/experience/app-frame/StrelvaShell", () => ({ StrelvaShell: ({ children }: { children: ReactNode }) => createElement("main", null, children) }));

import GettingStartedPage from "@/app/workspace/getting-started/page";
import BusinessSetupPage from "@/app/workspace/business/new/page";

const workspaceId = "cd200000-0000-4000-8000-000000000001";
const check = "cd200000-0000-4000-8000-000000000002";
const userId = "cd200000-0000-4000-8000-000000000003";
const page = () => GettingStartedPage({ searchParams: Promise.resolve({ workspaceId, check }) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", "1");
  mocks.user.mockResolvedValue({ id: userId, email: "owner@example.test", email_confirmed_at: "2026-10-14" });
  mocks.business.mockResolvedValue({ workspaceId, name: "Juniper", website: "https://juniper.example/", canConfirm: true, revision: 1, waiting: [] });
  mocks.work.mockResolvedValue({ id: check, workspaceId, productId: "website_audit" });
  mocks.google.mockResolvedValue(false);
  mocks.connect.mockResolvedValue(false);
});

describe("owner check first-run page", () => {
  it("reopens old check links through the actual check-to-business dialog", async () => {
    await expect(BusinessSetupPage({ searchParams: Promise.resolve({ check: "scan_example" }) })).rejects.toThrow("redirect:/workspace?save=scan_example");
  });
  it("rejects a malformed old check hint before routing it", async () => {
    await expect(BusinessSetupPage({ searchParams: Promise.resolve({ check: "../invalid" }) })).rejects.toThrow("notFound");
  });
  it("opens the saved check only when it belongs to this authorized business", async () => {
    const html = renderToStaticMarkup(await page());
    expect(html).toContain(`href="/workspace?workspaceId=${workspaceId}&amp;view=work&amp;work=${check}"`);
    expect(html).toContain("Open saved check");
    expect(html).toContain("https://juniper.example/");
    expect(mocks.work).toHaveBeenCalledWith({ userId, verifiedEmail: "owner@example.test" }, check);
  });
  it.each(["other_business", "not_a_check", "access_refused", "missing"])("withholds the saved-check link for %s", async condition => {
    if (condition === "other_business") mocks.work.mockResolvedValue({ id: check, workspaceId: userId, productId: "website_audit" });
    if (condition === "not_a_check") mocks.work.mockResolvedValue({ id: check, workspaceId, productId: "document" });
    if (condition === "access_refused") mocks.work.mockRejectedValue(new WorkspaceAccessError());
    if (condition === "missing") mocks.work.mockResolvedValue(null);
    expect(renderToStaticMarkup(await page())).not.toContain("Open saved check");
  });
  it("preserves the exact saved-check return when sign-in is needed", async () => {
    mocks.user.mockResolvedValue(null);
    await expect(page()).rejects.toThrow(`redirect:/sign-in?next=${encodeURIComponent(`/workspace/getting-started?workspaceId=${workspaceId}&check=${check}`)}`);
    expect(mocks.work).not.toHaveBeenCalled();
  });
});
