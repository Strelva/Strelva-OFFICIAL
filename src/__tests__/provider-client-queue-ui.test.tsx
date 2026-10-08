// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderClientQueue } from "@/experience/workspace/agency/ProviderClientQueue";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
let root: Root; let node: HTMLDivElement;
const AGENCY="25700000-0000-4000-8000-000000000020", CLIENT="25700000-0000-4000-8000-000000000010";
const item={ key:"listing:25700000-0000-4000-8000-000000000031",workspaceId:CLIENT,workspaceName:"Queue client",systemId:null,kind:"readback",title:"Website change",status:"failed",openedAt:"2026-10-08T12:00:00Z" };
const page=(items: unknown[]=[],nextCursor: unknown=null)=>({agencyWorkspaceId:AGENCY,items,nextCursor});
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);node=document.createElement("div");document.body.appendChild(node);root=createRoot(node);});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();vi.unstubAllGlobals();});
const click=async(label:string)=>act(async()=>{[...node.querySelectorAll("button")].find(b=>b.textContent===label)!.click();});
async function render(request:typeof fetch,onWorkspace=vi.fn(),workspaceId=AGENCY){await act(async()=>{root.render(createElement(WorkspaceRequestContext.Provider,{value:request},createElement(ProviderClientQueue,{workspaceId,onWorkspace})));});return onWorkspace;}
describe("provider client delivery queue",()=>{
 it("shows both lists, opens the authorized client, and paginates without duplicate rows",async()=>{
  const cursor={at:item.openedAt,key:item.key};const request=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(page([item,{...item,key:"decision:25700000-0000-4000-8000-000000000032",kind:"owner_not_told",status:"bounced",title:"Review hours"}],cursor))).mockResolvedValueOnce(Response.json(page([item])));
  const open=await render(request);expect(node.textContent).toContain("Read-back queue");expect(node.textContent).toContain("Owner not told");expect(node.textContent).toContain("Delivery bounced");await click("Open client");expect(open).toHaveBeenCalledWith(CLIENT);
  await click("Show more delivery checks");expect(request.mock.calls[1]![0]).toContain("cursor=");expect(node.querySelectorAll("li")).toHaveLength(2);
 });
 it("preserves loaded rows when a later page fails, and can retry",async()=>{
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(page([item],{at:item.openedAt,key:item.key}))).mockResolvedValueOnce(Response.json({}, {status:503})).mockResolvedValueOnce(Response.json(page([])));
  await render(request);await click("Show more delivery checks");expect(node.textContent).toContain("queue is incomplete");expect(node.querySelectorAll("li")).toHaveLength(1);await click("Show more delivery checks");expect(node.textContent).not.toContain("queue is incomplete");
 });
 it("removes loaded rows when a paginated read reports revoked permission",async()=>{
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(page([item],{at:item.openedAt,key:item.key}))).mockResolvedValueOnce(Response.json({}, {status:403}));
  await render(request);await click("Show more delivery checks");expect(node.textContent).toContain("access may have changed");expect(node.querySelectorAll("li")).toHaveLength(0);
 });
 it("exposes initial error/retry and honest empty states",async()=>{
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({}, {status:503})).mockResolvedValueOnce(Response.json(page()));await render(request);expect(node.querySelector('[role="alert"]')).toBeTruthy();await click("Retry delivery checks");expect(node.textContent).toContain("No failed or unchecked");expect(node.textContent).toContain("No undelivered owner decisions");
 });
 it("shows loading and discards a late response after changing agency",async()=>{
  let resolve!: (value:Response)=>void;const request=vi.fn<typeof fetch>().mockImplementationOnce(()=>new Promise(r=>resolve=r)).mockResolvedValueOnce(Response.json({agencyWorkspaceId:"25700000-0000-4000-8000-000000000030",items:[],nextCursor:null}));await render(request);expect(node.querySelector('[role="status"]')?.textContent).toContain("Checking");await render(request,vi.fn(),"25700000-0000-4000-8000-000000000030");await act(async()=>resolve(Response.json(page([item]))));expect(node.textContent).not.toContain("Queue client");
 });
});
