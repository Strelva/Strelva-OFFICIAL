// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreatorMaintenance from "@/app/workspace/creator-maintenance/CreatorMaintenance";
const mocks=vi.hoisted(()=>({refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:mocks.refresh})}));
const workspaceId="11111111-1111-4111-8111-111111111111",listingId="22222222-2222-4222-8222-222222222222",sourceRevisionId="33333333-3333-4333-8333-333333333333";
const graph={workspaceId,canMaintain:true,listings:[{id:listingId,definitionId:"Fictional qualified listing",sourceRevisionId,agreementVersion:null,rateReference:null,maintainerState:"creator" as const,history:[]}],agreements:[]};
const roots:ReturnType<typeof createRoot>[]=[];
async function mount(value=graph){const node=document.createElement("div");document.body.append(node);const root=createRoot(node);roots.push(root);await act(async()=>root.render(createElement(CreatorMaintenance,{graph:value})));return {node,root};}
async function select(node:HTMLElement,index:number,value:string){const field=node.querySelectorAll("select")[index]!;await act(async()=>{field.value=value;field.dispatchEvent(new Event("change",{bubbles:true}));});}
async function prepare(node:HTMLElement){await select(node,0,listingId);await select(node,1,"takeover");const field=node.querySelector("input")!;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!;await act(async()=>{setter.call(field,"2099-01-01T10:00");field.dispatchEvent(new Event("input",{bubbles:true}));});}
async function submit(node:HTMLElement){await act(async()=>{node.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});}
describe("creator maintenance controls",()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);});
 afterEach(async()=>{for(const root of roots.splice(0))await act(async()=>root.unmount());document.body.innerHTML="";vi.unstubAllGlobals();});
 it("shows genuine empty prerequisites without invented rates",async()=>{const {node}=await mount({...graph,listings:[]});expect(node.textContent).toContain("No creator royalty listing is recorded");expect(node.querySelector("button")).toBeNull();});
 it("retains history while removing future controls after exit",async()=>{const {node}=await mount({...graph,canMaintain:false});expect(node.textContent).toContain("Initial maintenance");expect(node.textContent).toContain("Recorded history remains available");expect(node.querySelector("button")).toBeNull();});
 it("offers no creator or tapered terms without recorded agreements",async()=>{const {node}=await mount();expect(node.textContent).toContain("No creator agreement is configured");expect([...node.querySelectorAll("option")].some(option=>["creator","tapered"].includes(option.value))).toBe(false);});
 it("sends exact listing/source and keeps draft/time for identical failure retry",async()=>{const transport=vi.fn<typeof fetch>().mockImplementation(async()=>new Response(JSON.stringify({error:"Current authority changed."}),{status:403}));vi.stubGlobal("fetch",transport);const {node}=await mount();await prepare(node);await submit(node);expect(node.querySelector("[role=alert]")?.textContent).toBe("Current authority changed.");const first=JSON.parse(String(transport.mock.calls[0]![1]!.body));expect(first).toMatchObject({workspaceId,listingId,sourceRevisionId,state:"takeover"});expect(first).not.toHaveProperty("agreementVersion");await submit(node);expect(transport).toHaveBeenCalledTimes(2);expect(transport.mock.calls[1]![1]!.body).toBe(transport.mock.calls[0]![1]!.body);expect(mocks.refresh).not.toHaveBeenCalled();});
 it("aborts unmounted observation and never refreshes a new workspace for the old receipt",async()=>{let resolve!:(response:Response)=>void;const wait=new Promise<Response>(done=>{resolve=done;});const transport=vi.fn<typeof fetch>().mockReturnValue(wait);vi.stubGlobal("fetch",transport);const {node,root}=await mount();await prepare(node);await submit(node);const signal=transport.mock.calls[0]![1]!.signal!;await act(async()=>root.unmount());roots.pop();expect(signal.aborted).toBe(true);await act(async()=>resolve(new Response(JSON.stringify({id:"fictional-receipt",listing_id:listingId,maintainer_state:"takeover",effective_from:"2099-01-01T10:00:00Z"}))));expect(mocks.refresh).not.toHaveBeenCalled();});
});
