// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useAgencyClientHome } from "@/experience/workspace/useAgencyClientHome";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
const one="b9200000-0000-4000-8000-000000000001", two="b9200000-0000-4000-8000-000000000002";
function Probe({id}:{id?:string}) {const {state,refresh}=useAgencyClientHome(id);return createElement("div",null,createElement("output",null,JSON.stringify(state)),createElement("button",{onClick:refresh},"Refresh"));}
let container:HTMLDivElement, root:Root, calls:Array<{resolve:(r:Response)=>void,init?:RequestInit}>;
const transport:typeof fetch=(_input,init)=>new Promise(resolve=>calls.push({resolve,init}));
async function render(id?:string){await act(async()=>root.render(createElement(WorkspaceRequestContext.Provider,{value:transport},createElement(Probe,{id}))));}
async function resolve(index:number,body:unknown,status=200){await act(async()=>calls[index]!.resolve(new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}})));}
function state(){return JSON.parse(container.querySelector("output")!.textContent!);}
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);container=document.createElement("div");document.body.appendChild(container);root=createRoot(container);calls=[];});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
describe("agency shared Home scope changes",()=>{
  it("does not read without an eligible client",async()=>{await render();expect(state().status).toBe("disabled");expect(calls).toHaveLength(0);});
  it("keeps failures distinct from empty shared reads",async()=>{await render(one);await resolve(0,{error:"Unavailable"},503);expect(state().status).toBe("error");expect(state().data).toBeUndefined();});
  it("rejects another client's response",async()=>{await render(two);await resolve(0,{workspaceId:one,decisions:[],changes:[],deliveries:[],deliveryChecks:[]});expect(state().status).toBe("error");});
  it("aborts prior client reads and ignores their late responses",async()=>{await render(one);await render(two);expect(calls[0]!.init?.signal?.aborted).toBe(true);await resolve(1,{workspaceId:two,decisions:[],changes:[],deliveries:[],deliveryChecks:[]});await resolve(0,{workspaceId:one,decisions:[],changes:[],deliveries:[],deliveryChecks:[]});expect(state()).toMatchObject({status:"ready",data:{workspaceId:two}});});
  it("clears shared rows before retry and permission refusal",async()=>{await render(one);await resolve(0,{workspaceId:one,decisions:[],changes:[],deliveries:[],deliveryChecks:[]});expect(state().status).toBe("ready");await act(async()=>container.querySelector("button")!.click());expect(state().status).toBe("loading");await resolve(1,{},403);expect(state().status).toBe("error");expect(state().data).toBeUndefined();});
});
