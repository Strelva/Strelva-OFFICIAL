// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SourcePackageControls } from "@/experience/workspace/agency/SourcePackageControls";
const workspaceId = "11111111-1111-4111-8111-111111111111", systemId = "22222222-2222-4222-8222-222222222222", revisionId = "33333333-3333-4333-8333-333333333333";
const roots: ReturnType<typeof createRoot>[] = [];
function view(state = "private", workspace = workspaceId, system = systemId) { return { workspaceId: workspace, systemId: system, source: { listingState: state }, revision: { source: { revisionId, number: 1 }, qualification: null }, canReview: false }; }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
async function mount(request: typeof fetch) {
  const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(SourcePackageControls, { request, workspaceId, systemId })));
  await open(node); return { node, root };
}
async function open(node: HTMLElement) { await act(async () => { const details = node.querySelector("details")!; details.open = true; details.dispatchEvent(new Event("toggle")); }); }
async function listing(node: HTMLElement, value: string) { await act(async () => { const select = node.querySelector("select")!; select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); }); }
async function refresh(node: HTMLElement) { await act(async () => { const button = Array.from(node.querySelectorAll("button")).find(row => row.textContent?.includes("Read current package"))!; button.click(); }); }
describe("source package immutable uncertain command recovery", () => {
  beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
  afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
  it("holds a lost listing response; current read confirms the state without resending", async () => {
    let state = "private";
    const request = vi.fn<typeof fetch>(async (_url, init) => { if (init?.method === "POST") { state = "listed"; throw new Error("response lost"); } return response(view(state)); });
    const { node } = await mount(request); await listing(node, "listed");
    expect(node.querySelector("select")!.disabled).toBe(true);
    expect(node.textContent).toContain("Previous request held");
    await refresh(node);
    expect(node.querySelector("select")!.disabled).toBe(false); expect(node.querySelector("select")!.value).toBe("listed");
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("gives an empty server error a meaningful failure and reachable current-read recovery", async () => {
    const request = vi.fn<typeof fetch>(async () => response({ error: " " }, 503));
    const { node } = await mount(request);
    expect(node.querySelector('[role="alert"]')!.textContent).toContain("could not be confirmed");
    expect(Array.from(node.querySelectorAll("button")).some(button => button.textContent?.includes("Read current package"))).toBe(true);
    expect(node.textContent).not.toContain("Reading this source’s exact revision");
  });
  it("keeps a contradictory or foreign current read held instead of overwriting it with another listing command", async () => {
    let wrongScope = false;
    const request = vi.fn<typeof fetch>(async (_url, init) => { if (init?.method === "POST") throw new Error("response lost"); return response(view("private", wrongScope ? systemId : workspaceId)); });
    const { node } = await mount(request); await listing(node, "listed"); await refresh(node);
    expect(node.querySelector("select")!.disabled).toBe(true);
    wrongScope = true; await refresh(node);
    expect(node.textContent).toContain("another source or revision"); expect(node.querySelector("select")!.disabled).toBe(true);
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("does not accept malformed success as command confirmation", async () => {
    const request = vi.fn<typeof fetch>(async (_url, init) => init?.method === "POST" ? response({}) : response(view()));
    const { node } = await mount(request); await listing(node, "listed"); await refresh(node);
    expect(node.querySelector("select")!.disabled).toBe(true);
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("allows a new exact command after a structured refusal and successful current read", async () => {
    const request = vi.fn<typeof fetch>(async (_url, init) => init?.method === "POST" ? response({ error: "system_revision_not_qualified" }, 409) : response(view()));
    const { node } = await mount(request); await listing(node, "listed");
    expect(node.querySelector("select")!.disabled).toBe(false); expect(node.textContent).toContain("system_revision_not_qualified");
  });
  it("synchronously keeps the first listing input when two changes arrive before React paints", async () => {
    let resolve!: (value: Response) => void, state = "private";
    const request = vi.fn<typeof fetch>(async (_url, init) => { if (init?.method === "POST") { state = "listed"; return new Promise<Response>(done => { resolve = done; }); } return response(view(state)); });
    const { node } = await mount(request);
    await act(async () => { const select = node.querySelector("select")!; for (const value of ["listed", "clients"]) { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); } });
    const posts = request.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1); expect(JSON.parse(String(posts[0]![1]!.body))).toMatchObject({ workspaceId, systemId, state: "listed" });
    await act(async () => resolve(response({ source: { businessId: workspaceId, systemId }, listingState: "listed" })));
    expect(node.querySelector("select")!.value).toBe("listed");
  });
  it("drops the old scope view and ignores an old POST response after switching workspace/System", async () => {
    let resolve!: (value: Response) => void;
    const request = vi.fn<typeof fetch>(async (url, init) => init?.method === "POST" ? new Promise<Response>(done => { resolve = done; }) : response(new URL(String(url), "http://localhost").searchParams.get("sourceSystemId") === systemId ? view() : view("private", systemId, revisionId)));
    const { node, root } = await mount(request); await listing(node, "listed");
    await act(async () => root.render(createElement(SourcePackageControls, { request, workspaceId: systemId, systemId: revisionId })));
    expect(node.querySelector("select")).toBeNull();
    await open(node);
    await act(async () => resolve(response({ source: { businessId: workspaceId, systemId }, listingState: "listed" })));
    expect(node.querySelector("select")!.value).toBe("private");
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
});
