// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceExport } from "@/experience/workspace/WorkspaceExport";

let root: ReturnType<typeof createRoot>;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); document.body.innerHTML = '<div id="mount"></div>'; root = createRoot(document.getElementById("mount")!); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const buildId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });

describe("business export screen", () => {
  it("keeps the old endpoint and bounded copy while schema 3 is off", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: "denied" }, { status: 403 })); vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(createElement(WorkspaceExport, { workspaceId })));
    expect(document.body.textContent).toContain("Exports above 2 MB stop");
    await act(async () => (document.querySelector("button") as HTMLButtonElement).click());
    expect(fetch).toHaveBeenCalledWith("/api/workspace-export", expect.any(Object));
  });
  it("treats 202 as a job, then offers an authenticated ready download", async () => {
    const accepted = Response.json({ buildId, message: "Email delivery is paused." }, { status: 202 });
    const blob = vi.spyOn(accepted, "blob");
    const fetch = vi.fn().mockResolvedValueOnce(accepted).mockResolvedValueOnce(Response.json({ status: "ready" })); vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(createElement(WorkspaceExport, { workspaceId, schema3: true })));
    await act(async () => (document.querySelector("button") as HTMLButtonElement).click()); await settle();
    expect(fetch.mock.calls[0]![0]).toBe("/api/workspace-export/v3");
    expect(blob).not.toHaveBeenCalled();
    const link = document.querySelector('a[href*="owner-download"]');
    expect(link?.getAttribute("href")).toBe(`/api/workspace-export/v3/owner-download?build=${buildId}`);
    expect(document.body.textContent).toContain("Your business export is ready");
  });
  it("allows retry after a failed background build", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ buildId }, { status: 202 })).mockResolvedValueOnce(Response.json({ status: "failed" })));
    await act(async () => root.render(createElement(WorkspaceExport, { workspaceId, schema3: true })));
    await act(async () => (document.querySelector("button") as HTMLButtonElement).click()); await settle();
    expect((document.querySelector("button") as HTMLButtonElement).disabled).toBe(false);
    expect(document.body.textContent).toContain("Prepare a new export");
  });
});
