// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrivateSourceAuthoring, { type PrivateSourceGraph } from "@/app/workspace/version-sources/PrivateSourceAuthoring";
import { privateApplicationDefinition } from "@/experience/workspace/agency/private-definition-contracts";
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
const workspaceId = "11111111-1111-4111-8111-111111111111", systemId = "22222222-2222-4222-8222-222222222222";
const graph: PrivateSourceGraph = { workspaceId, canAuthor: true, sources: [], shared: null };
const roots: ReturnType<typeof createRoot>[] = [];
async function mount(value = graph) { const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root); await act(async () => root.render(createElement(PrivateSourceAuthoring, { graph: value, targets: [] }))); return { node, root }; }
async function fill(node: HTMLElement) { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; for (const [index, value] of ["Repair requests", "What needs fixing?"].entries())
    await act(async () => { const input = node.querySelectorAll("input")[index]!; setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function submit(node: HTMLElement) { await act(async () => { node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe("ordinary source UI admission and command identity", () => {
    beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
    afterEach(async () => { for (const root of roots.splice(0))
        await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
    it("retains source history without authoring controls when current authority is absent", async () => { const { node } = await mount({ ...graph, canAuthor: false, sources: [{ systemId, name: "Requests", revision: null, qualified: false }] }); expect(node.textContent).toContain("Requests"); expect(node.querySelector("form")).toBeNull(); expect(node.querySelector("select")).toBeNull(); });
    it("publishes the actual shareable form and requires qualification rather than inventing live approval", async () => {
        const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => { const command = JSON.parse(String(init?.body)); return command.action === "create" ? response({ source: { businessId: workspaceId, systemId }, hidden: true }, 201) : response({ source: { businessId: workspaceId, systemId, revisionId: command.commandId, number: 1 } }, 201); });
        vi.stubGlobal("fetch", transport);
        const { node } = await mount();
        await fill(node);
        await submit(node);
        const published = JSON.parse(String(transport.mock.calls[1]![1]!.body));
        expect(privateApplicationDefinition(published.definition)).toEqual(published.definition);
        expect(published).toMatchObject({ expectedRevision: 0, workspaceId, systemId });
        expect(node.textContent).toContain("human qualification");
        expect(mocks.refresh).toHaveBeenCalledTimes(1);
    });
    it("keeps both native IDs and definition unchanged after publish response loss", async () => {
        let failed = false;
        const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => { const command = JSON.parse(String(init?.body)); if (command.action === "create")
            return response({ source: { businessId: workspaceId, systemId }, hidden: true }, 201); if (!failed) {
            failed = true;
            throw Error("Response lost");
        } return response({ source: { businessId: workspaceId, systemId, revisionId: command.commandId, number: 1 } }, 201); });
        vi.stubGlobal("fetch", transport);
        const { node } = await mount();
        await fill(node);
        await submit(node);
        expect([...node.querySelectorAll("input")].every(input => input.disabled)).toBe(true);
        expect(mocks.refresh).not.toHaveBeenCalled();
        await act(async () => { [...node.querySelectorAll("button")].find(button => button.textContent === "Retry the same source command")!.click(); });
        expect(transport.mock.calls[2]![1]!.body).toBe(transport.mock.calls[0]![1]!.body);
        expect(transport.mock.calls[3]![1]!.body).toBe(transport.mock.calls[1]![1]!.body);
        expect(mocks.refresh).toHaveBeenCalledTimes(1);
    });
    it("does not publish or refresh another workspace after an unmounted create response", async () => {
        let resolve!: (value: Response) => void;
        const transport = vi.fn<typeof fetch>().mockReturnValue(new Promise(done => { resolve = done; }));
        vi.stubGlobal("fetch", transport);
        const { node, root } = await mount();
        await fill(node);
        await submit(node);
        const signal = transport.mock.calls[0]![1]!.signal!;
        await act(async () => root.unmount());
        roots.pop();
        expect(signal.aborted).toBe(true);
        await act(async () => resolve(response({ source: { businessId: workspaceId, systemId }, hidden: true }, 201)));
        expect(transport).toHaveBeenCalledTimes(1);
        expect(mocks.refresh).not.toHaveBeenCalled();
    });
    it("accepts the actual native System UUID and opens its System view without claiming live release", async () => {
        const incoming = {...graph, shared: {name:"Shared requests", source:{businessId:systemId,systemId,revisionId:workspaceId,number:1},qualified:true}};
        const nativeSystemId="44444444-4444-4444-8444-444444444444";
        const transport=vi.fn<typeof fetch>().mockResolvedValue(response({workspaceId,systemId:nativeSystemId,versionId:systemId,rowRevision:1,outcome:"created"},201));vi.stubGlobal("fetch",transport);
        const {node}=await mount(incoming);await act(async()=>{[...node.querySelectorAll("button")].find(button=>button.textContent==="Create separate draft Version")!.click();});
        expect(node.textContent).toContain("Owner approval is still required");expect(node.querySelector("a")?.getAttribute("href")).toBe(`/workspace?workspaceId=${workspaceId}&view=system&system=${nativeSystemId}`);expect(mocks.refresh).toHaveBeenCalledTimes(1);
    });
    it("holds a foreign installation receipt without refreshing or claiming success", async () => {
        const incoming={...graph,shared:{name:"Shared requests",source:{businessId:systemId,systemId,revisionId:workspaceId,number:1},qualified:true}};
        const transport=vi.fn<typeof fetch>().mockResolvedValue(response({workspaceId:systemId,systemId,versionId:workspaceId,rowRevision:1,outcome:"created"},201));vi.stubGlobal("fetch",transport);
        const {node}=await mount(incoming);await act(async()=>{[...node.querySelectorAll("button")].find(button=>button.textContent==="Create separate draft Version")!.click();});
        expect(node.querySelector("[role=alert]")).not.toBeNull();expect(node.querySelector("a")).toBeNull();expect(mocks.refresh).not.toHaveBeenCalled();
    });
    it("never admits installation of an unqualified incoming revision", async () => { const { node } = await mount({ ...graph, shared: { name: "Shared requests", source: { businessId: systemId, systemId, revisionId: workspaceId, number: 1 }, qualified: false } }); expect([...node.querySelectorAll("button")].find(button => button.textContent === "Create separate draft Version")!.disabled).toBe(true); });
});
