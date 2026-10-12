// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceExport } from "@/experience/workspace/WorkspaceExport";

let root: ReturnType<typeof createRoot>;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); document.body.innerHTML = '<div id="mount"></div>'; root = createRoot(document.getElementById("mount")!); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const buildId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const archive = (status = "ready", id = buildId, workspace = workspaceId) => ({ buildId: id, workspaceId: workspace, status, createdAt: "2026-10-12T12:00:00Z", expiresAt: status === "ready" ? "2026-10-19T12:00:00Z" : null });
const history = (rows: unknown[] = []) => Response.json({ exports: rows });
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
    let prepared = false;
    const fetch = vi.fn().mockImplementation(async (_url, options) => {
      if (options?.method === "POST") { prepared = true; return accepted; }
      return history(prepared ? [archive()] : []);
    }); vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(createElement(WorkspaceExport, { workspaceId, schema3: true })));
    await act(async () => (document.querySelector("button") as HTMLButtonElement).click()); await settle();
    expect(fetch).toHaveBeenCalledWith("/api/workspace-export/v3", expect.objectContaining({ method: "POST" }));
    expect(blob).not.toHaveBeenCalled();
    const link = document.querySelector('a[href*="owner-download"]');
    expect(link?.getAttribute("href")).toBe(`/api/workspace-export/v3/owner-download?build=${buildId}`);
    expect(document.body.textContent).toContain("Your business export is ready");
  });
  it("allows retry after a failed background build", async () => {
    let prepared = false;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, options) => {
      if (options?.method === "POST") { prepared = true; return Response.json({ buildId }, { status: 202 }); }
      return history(prepared ? [archive("failed")] : []);
    }));
    await act(async () => root.render(createElement(WorkspaceExport, { workspaceId, schema3: true })));
    await act(async () => (document.querySelector("button") as HTMLButtonElement).click()); await settle();
    expect((document.querySelector("button") as HTMLButtonElement).disabled).toBe(false);
    expect(document.body.textContent).toContain("Prepare a new export");
  });
  it("names the omissions and avoids inventing record counts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => history()));
    await act(async () => root.render(createElement(WorkspaceExport, { workspaceId, schema3: true })));
    expect(document.body.textContent).toContain("Card details");
    expect(document.body.textContent).toContain("Held by Stripe");
    expect(document.body.textContent).toContain("Counts are not available on this page");
    expect(document.querySelector('[aria-label="Export scope"]')).not.toBeNull();
  });
  it("shows owner permission failure as an alert and keeps retry available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, options) => options?.method === "POST" ? Response.json({ error: "Only the confirmed owner can export." }, { status: 403 }) : history()));
    await act(async () => root.render(createElement(WorkspaceExport, { workspaceId, schema3: true })));
    await act(async () => (document.querySelector("button") as HTMLButtonElement).click());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Only the confirmed owner");
    expect((document.querySelector("button") as HTMLButtonElement).disabled).toBe(false);
    expect(document.querySelector('a[href*="owner-download"]')).toBeNull();
  });
  it("recovers completed exports after leaving and returning, with distinct download links", async () => {
    const second = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const fetch = vi.fn().mockImplementation(async () => history([archive(), archive("ready", second)]));
    await act(async () => root.render(createElement(WorkspaceExport, { workspaceId, schema3: true, request: fetch })));
    expect(document.querySelectorAll('a[href*="owner-download"]')).toHaveLength(2);
    await act(async () => root.render(null));
    await act(async () => root.render(createElement(WorkspaceExport, { workspaceId, schema3: true, request: fetch })));
    expect(fetch).toHaveBeenCalledWith(`/api/workspace-export/v3/history?workspaceId=${workspaceId}`, expect.any(Object));
    expect(document.body.textContent).toContain("Download until");
    expect(document.querySelector(`a[href$="${second}"]`)).not.toBeNull();
  });
  it("resumes an existing build and prevents a duplicate preparation", async () => {
    const fetch = vi.fn().mockImplementation(async () => history([archive("building")]));
    await act(async () => root.render(createElement(WorkspaceExport, { workspaceId, schema3: true, request: fetch })));
    expect(document.body.textContent).toContain("Being prepared");
    expect((document.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('a[href*="owner-download"]')).toBeNull();
  });
  it("shows expired and failed exports with recovery rather than downloads", async () => {
    const fetch = vi.fn().mockImplementation(async () => history([archive("expired"), archive("stalled", "cccccccc-cccc-4ccc-8ccc-cccccccccccc")]));
    await act(async () => root.render(createElement(WorkspaceExport, { workspaceId, schema3: true, request: fetch })));
    expect(document.body.textContent).toContain("Expired. Prepare a new export.");
    expect(document.body.textContent).toContain("Preparation stopped");
    expect(document.querySelector('a[href*="owner-download"]')).toBeNull();
    expect((document.querySelector("button") as HTMLButtonElement).disabled).toBe(false);
  });
  it("offers history recovery on failed reads without claiming there are no exports", async () => {
    let fails = true;
    const fetch = vi.fn().mockImplementation(async () => fails ? Response.json({ error: "Only the current owner can read exports." }, { status: 403 }) : history([archive()]));
    await act(async () => root.render(createElement(WorkspaceExport, { workspaceId, schema3: true, request: fetch })));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Only the current owner");
    expect(document.body.textContent).not.toContain("No recent exports");
    expect(document.querySelector('a[href*="owner-download"]')).toBeNull();
    fails = false;
    await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === "Reload exports")!.click());
    expect(document.querySelector('a[href*="owner-download"]')).not.toBeNull();
  });
  it("rejects rows from another workspace and clears references on workspace switches", async () => {
    const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const fetch = vi.fn().mockImplementation(async () => history([archive()]));
    await act(async () => root.render(createElement(WorkspaceExport, { workspaceId, schema3: true, request: fetch })));
    expect(document.querySelector('a[href*="owner-download"]')).not.toBeNull();
    await act(async () => root.render(createElement(WorkspaceExport, { workspaceId: other, schema3: true, request: fetch })));
    expect(document.querySelector('a[href*="owner-download"]')).toBeNull();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("could not be confirmed");
  });
  it("polls recovered jobs until ready and hides downloads after owner access is lost", async () => {
    vi.useFakeTimers();
    let response = () => history([archive("building")]);
    const fetch = vi.fn().mockImplementation(async () => response());
    await act(async () => root.render(createElement(WorkspaceExport, { workspaceId, schema3: true, request: fetch })));
    response = () => history([archive()]);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(document.querySelector('a[href*="owner-download"]')).not.toBeNull();
    response = () => Response.json({ error: "Owner access has ended." }, { status: 403 });
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(document.querySelector('a[href*="owner-download"]')).toBeNull();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Owner access has ended");
    expect([...document.querySelectorAll("button")].find(button => button.textContent === "Prepare business export")!.disabled).toBe(true);
  });
  it("recovers a build accepted despite a lost preparation response", async () => {
    let started = false;
    const fetch = vi.fn().mockImplementation(async (_url, options) => {
      if (options?.method === "POST") { started = true; throw new Error("Outcome not confirmed"); }
      return history(started ? [archive("building")] : []);
    });
    await act(async () => root.render(createElement(WorkspaceExport, { workspaceId, schema3: true, request: fetch })));
    await act(async () => (document.querySelector("button") as HTMLButtonElement).click());
    expect(document.body.textContent).toContain("Being prepared");
    expect((document.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
    expect(fetch.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
  });

});
