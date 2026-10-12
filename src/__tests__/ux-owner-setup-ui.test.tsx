// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessSetupPanel } from "@/experience/workspace/BusinessSetupPanel";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { requestDraftKey, readRequestDraft } from "@/experience/workspace/request-draft";
import { WebsiteAskContinuation } from "@/app/workspace/business/new/website/WebsiteAskContinuation";
const actorId = "ab200000-0000-4000-8000-000000000001";
const workspaceId = "ab200000-0000-4000-8000-000000000002";
const conversationId = "ab200000-0000-4000-8000-000000000003";
const checkWorkId = "ab200000-0000-4000-8000-000000000004";
const actorEmail = "owner@example.test";
let root: ReturnType<typeof createRoot>;
let node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); sessionStorage.clear(); node=document.createElement("div"); document.body.append(node); root=createRoot(node); });
afterEach(async () => { await act(async()=>root.unmount()); node.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(element: ReturnType<typeof createElement>) { await act(async()=>root.render(element)); }
async function submit() { await act(async()=>node.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))); }
function setupResponse() { return { workspaceId, requestId:null, askConversationId:conversationId, agencyRequired:true, alreadyCreated:false }; }
function transport(reply: (input: string, init?: RequestInit)=>Promise<Response>) { return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => init?.method !== "POST" ? Response.json({actorId,actorEmail,businesses:[]}) : reply(String(input),init)); }
describe("owner setup keeps the complete ask and check",()=>{
 it("saves the ask and report before opening Home with the fix prefilled",async()=>{
  const navigate=vi.fn(); const request=transport(async input=>Response.json(input==="/api/workspace/businesses"?setupResponse():{work:{id:checkWorkId,workspaceId}}));
  await render(createElement(WorkspaceRequestContext.Provider,{value:request},createElement(BusinessSetupPanel,{initialName:"Juniper",initialRequest:"Fix our hours",sourceCheckId:"scan_example",navigate})));
  await submit();
  expect(request.mock.calls.filter(call=>call[1]?.method==="POST").map(call=>JSON.parse(String(call[1]?.body)))).toMatchObject([{initialRequest:"Fix our hours",sourceCheckId:"scan_example",destination:{kind:"new",name:"Juniper"}},{action:"save_business_check",workspaceId,resultId:"scan_example"}]);
  expect(navigate).toHaveBeenCalledWith(`/workspace?workspaceId=${workspaceId}&view=home`);
  expect(readRequestDraft(sessionStorage,requestDraftKey({actorEmail,workspaceId}))).toBe("Fix our hours");
  expect(sessionStorage.getItem(`strelva:business-entry:${actorId}`)).toBeNull();
 });
 it("retains exact setup and check when the report save response is lost, then safely recovers",async()=>{
  const navigate=vi.fn();let failed=true;
  const request=transport(async input=>{if(input==="/api/workspace/businesses")return Response.json(setupResponse());if(failed){failed=false;throw new Error("Response lost");}return Response.json({work:{id:checkWorkId,workspaceId}});});
  await render(createElement(WorkspaceRequestContext.Provider,{value:request},createElement(BusinessSetupPanel,{initialName:"Juniper",initialRequest:"Fix our hours",sourceCheckId:"scan_example",navigate})));
  await submit();const pending=sessionStorage.getItem(`strelva:business-entry:${actorId}`);expect(pending).toBeTruthy();expect(navigate).not.toHaveBeenCalled();
  await submit();expect(navigate).toHaveBeenCalledOnce();
  const posts=request.mock.calls.filter(call=>String(call[0])==="/api/workspace/businesses"&&call[1]?.method==="POST");expect(posts.map(call=>call[1]?.body)).toEqual([pending,pending]);
 });
 it("never clears the brief if an older backend creates the business without saving its ask",async()=>{
  const navigate=vi.fn();const request=transport(async()=>Response.json({...setupResponse(),askConversationId:null}));
  await render(createElement(WorkspaceRequestContext.Provider,{value:request},createElement(BusinessSetupPanel,{initialName:"Juniper",initialRequest:"My exact words",navigate})));
  await submit();expect(navigate).not.toHaveBeenCalled();expect(node.textContent).toContain("saving your ask is not confirmed");expect(JSON.parse(sessionStorage.getItem(`strelva:business-entry:${actorId}`)!).initialRequest).toBe("My exact words");
 });
 it("does not accept a report returned from a different workspace",async()=>{
  const navigate=vi.fn();const request=transport(async input=>Response.json(input==="/api/workspace/businesses"?setupResponse():{work:{id:checkWorkId,workspaceId:actorId}}));
  await render(createElement(WorkspaceRequestContext.Provider,{value:request},createElement(BusinessSetupPanel,{initialName:"Juniper",initialRequest:"Fix this",sourceCheckId:"scan_example",navigate})));
  await submit();expect(navigate).not.toHaveBeenCalled();expect(sessionStorage.getItem(`strelva:business-entry:${actorId}`)).toBeTruthy();
 });
 it("carries a saved website ask into the real rebuild entry without putting the words in its URL",async()=>{
  const navigate=vi.fn();await render(createElement(WebsiteAskContinuation,{workspaceId,actorEmail,words:"Build my site with a booking page",navigate}));
  await act(async()=>node.querySelector("button")!.click());expect(navigate).toHaveBeenCalledWith(`/workspace/site?workspaceId=${workspaceId}&entry=rebuild`);
  expect(readRequestDraft(sessionStorage,requestDraftKey({workspaceId,actorEmail}))).toBe("Build my site with a booking page");
 });
 it("keeps the saved ask visible when browser storage is unavailable",async()=>{
  const navigate=vi.fn();vi.stubGlobal("sessionStorage", { setItem: () => { throw new Error("blocked"); } });
  await render(createElement(WebsiteAskContinuation,{workspaceId,actorEmail,words:"Build my exact website ask",navigate}));await act(async()=>node.querySelector("button")!.click());
  expect(navigate).not.toHaveBeenCalled();expect(node.textContent).toContain("Build my exact website ask");expect(node.textContent).toContain("Allow session storage");
 });
});
