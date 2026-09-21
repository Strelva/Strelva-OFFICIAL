// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useBusinessDeliveries } from "@/experience/workspace/useBusinessDeliveries";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
const one="b9200000-0000-4000-8000-000000000001", two="b9200000-0000-4000-8000-000000000002";
function Probe({id}:{id?:string}) {const {state,refresh}=useBusinessDeliveries(id);return createElement("div",null,createElement("output",null,JSON.stringify(state)),createElement("button",{onClick:refresh},"Refresh"));}
let container:HTMLDivElement, root:Root, calls:Array<{resolve:(r:Response)=>void,init?:RequestInit}>;
const transport:typeof fetch=(_input,init)=>new Promise(resolve=>calls.push({resolve,init}));
const row={id:two,businessId:one,status:"requested",request:"Our website",outcome:"A website",context:{},scope:["help_request"],provider:{kind:"strelva"},providerAcceptance:{status:"pending",actorId:null,acceptedAt:null,note:null},installationId:null,deliveryId:null,revision:1,createdBy:one,createdAt:"2026-09-21T12:00:00Z",updatedAt:"2026-09-21T12:00:00Z",deliveryCommitment:null};
async function render(id?:string){await act(async()=>root.render(createElement(WorkspaceRequestContext.Provider,{value:transport},createElement(Probe,{id}))));}
async function resolve(index:number,body:unknown,status=200){await act(async()=>calls[index]!.resolve(new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}})));}
function state(){return JSON.parse(container.querySelector("output")!.textContent!);}
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);container=document.createElement("div");document.body.appendChild(container);root=createRoot(container);calls=[];});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
describe("business delivery summary stays in the authorized scope",()=>{
  it("does not read delivery requests without an eligible business",async()=>{await render();expect(state().status).toBe("disabled");expect(calls).toHaveLength(0);});
  it("does not conflate a failed source with an empty inbox",async()=>{await render(one);await resolve(0,{error:"Unavailable"},503);expect(state().status).toBe("error");expect(state().items).toBeUndefined();});
  it("accepts an explicitly confirmed empty list",async()=>{await render(one);await resolve(0,{requests:[]});expect(state()).toMatchObject({status:"ready",items:[]});});
  it("rejects a malformed or wrong-business list",async()=>{await render(two);await resolve(0,{requests:[row]});expect(state().status).toBe("error");expect(container.textContent).not.toContain("A website");});
  it("does not let an old business response overwrite a newer scope",async()=>{await render(one);await render(two);expect(calls[0]!.init?.signal?.aborted).toBe(true);await resolve(1,{requests:[]});await resolve(0,{requests:[row]});expect(state()).toMatchObject({status:"ready",businessId:two,items:[]});});
  it("clears known rows before explicit refresh and denial",async()=>{await render(one);await resolve(0,{requests:[row]});expect(state().items).toHaveLength(1);await act(async()=>container.querySelector("button")!.click());expect(state().status).toBe("loading");await resolve(1,{error:"Revoked"},403);expect(state().status).toBe("error");expect(container.textContent).not.toContain("A website");});
});
