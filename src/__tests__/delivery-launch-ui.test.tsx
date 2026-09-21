// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryCommitmentPanel } from "@/experience/operations/DeliveryCommitmentPanel";
import { ServiceDeliveryQueue } from "@/experience/operations/ServiceDeliveryQueue";
import { BusinessSetupPanel } from "@/experience/workspace/BusinessSetupPanel";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
const actorId="b9100000-0000-4000-8000-000000000001", requestId="b9100000-0000-4000-8000-000000000002", businessId="b9100000-0000-4000-8000-000000000003";
const saved = {id:requestId,businessId,status:"requested",request:"Have Strelva build our website.",outcome:"Juniper website",context:{},scope:["website_delivery"],provider:{kind:"strelva"},providerAcceptance:{status:"accepted",actorId,acceptedAt:"2026-09-21T12:00:00Z",note:null},installationId:null,deliveryId:null,revision:3,createdBy:actorId,createdAt:"2026-09-21T12:00:00Z",updatedAt:"2026-09-21T12:00:00Z",deliveryCommitment:{version:1,status:"proposed",operatorId:actorId,termsReference:"Quote 42",deliveryDefinition:"Tested review website",scope:["website_delivery"],proposedAt:"2026-09-21T12:00:00Z",startedAt:null,dueAt:null,customerAcceptedBy:null,customerAcceptedAt:null,blocker:null,result:null,decision:null}};
function inspection(manage=true,operate=false) {return {actorId,request:saved,permissions:{canManage:manage,canOperate:operate,stopped:false,websiteBindings:[]}};}
type Pending={url:string,init?:RequestInit,resolve:(response:Response)=>void};
let root:Root, container:HTMLDivElement, calls:Pending[];
function response(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});}
const transport:typeof fetch=(input,init)=>new Promise(resolve=>calls.push({url:String(input),init,resolve}));
async function render(node:ReactNode){await act(async()=>root.render(createElement(WorkspaceRequestContext.Provider,{value:transport},node)));}
async function resolve(index:number,body:unknown,status=200){await act(async()=>calls[index]!.resolve(response(body,status)));}
function button(text:string){return [...container.querySelectorAll<HTMLButtonElement>("button")].find(item=>item.textContent===text)!;}
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);sessionStorage.clear();calls=[];container=document.createElement("div");document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();sessionStorage.clear();vi.unstubAllGlobals();});
describe("agency and native entry interfaces",()=>{
 it("retains and replays exactly one unconfirmed delivery decision across remounts",async()=>{
  await render(createElement(DeliveryCommitmentPanel,{requestId}));await resolve(0,inspection());
  expect(container.textContent).toContain("Quote 42");expect(button("Propose 24-hour delivery")).toBeUndefined();
  await act(async()=>button("Accept scope and start 24-hour delivery").click());
  const command=JSON.parse(String(calls[1]!.init?.body));expect(command).toMatchObject({requestId,expectedRevision:3,change:{kind:"agree"}});
  await resolve(1,{error:{message:"Response lost"}},503);
  expect(container.textContent).toContain("previous command is not confirmed");
  await render(null);await render(createElement(DeliveryCommitmentPanel,{requestId}));await resolve(2,inspection());
  await act(async()=>button("Retry retained command").click());expect(JSON.parse(String(calls[3]!.init?.body))).toEqual(command);
  await resolve(3,{error:{message:"Revision changed"}},409);
  expect(container.textContent).toContain("Revision changed");expect(button("Retry retained command")).toBeUndefined();
 });
 it("does not reveal old delivery content after access is revoked",async()=>{
  await render(createElement(DeliveryCommitmentPanel,{requestId}));await resolve(0,inspection());
  await act(async()=>button("Refresh saved state").click());expect(container.textContent).not.toContain("Juniper website");
  await resolve(1,{error:{message:"No longer authorized"}},403);expect(container.textContent).not.toContain("Quote 42");expect(button("Accept scope and start 24-hour delivery")).toBeUndefined();
 });
 it("does not render another request's late response",async()=>{
  await render(createElement(DeliveryCommitmentPanel,{requestId}));
  await render(createElement(DeliveryCommitmentPanel,{requestId:businessId}));
  await resolve(0,inspection());expect(container.textContent).not.toContain("Juniper website");
  await resolve(1,{error:{message:"Not found"}},404);expect(container.textContent).toContain("Not found");
 });
 it("does not offer mutations to a read-only customer member",async()=>{
  await render(createElement(DeliveryCommitmentPanel,{requestId}));await resolve(0,inspection(false,false));
  expect(button("Accept scope and start 24-hour delivery")).toBeUndefined();expect(button("Cancel this delivery")).toBeUndefined();expect(button("Propose 24-hour delivery")).toBeUndefined();
 });
 it("keeps queue scope changes isolated and source failure distinct from empty",async()=>{
  await render(createElement(ServiceDeliveryQueue,{scope:{businessId}}));await resolve(0,{requests:[saved]});expect(container.textContent).toContain("Juniper website");
  await render(createElement(ServiceDeliveryQueue,{scope:{businessId:requestId}}));expect(container.textContent).not.toContain("Juniper website");
  await resolve(1,{error:"Unavailable"},503);expect(container.textContent).toContain("could not be loaded");expect(container.textContent).not.toContain("No delivery work");
 });
 it("preserves a fixed sign-in return from the queue",async()=>{
  await render(createElement(ServiceDeliveryQueue,{scope:{businessId}}));await resolve(0,{error:"Sign in"},401);
  expect(container.querySelector('a[href^="/sign-in"]')?.getAttribute("href")).toBe(`/sign-in?next=${encodeURIComponent(`/workspace/delivery?businessId=${businessId}`)}`);
 });
 it("requires an explicit business name before any setup mutation",async()=>{
  await render(createElement(BusinessSetupPanel,{initialRequest:saved.request}));await resolve(0,{actorId,businesses:[]});
  expect(button("Save business and request").disabled).toBe(true);expect(calls).toHaveLength(1);
  expect(container.textContent).toContain("No website purchase is required");
 });
 it("recovers a pending atomic business request without making a second one",async()=>{
  const command={destination:{kind:"new",name:"Juniper"},initialRequest:saved.request,idempotencyKey:businessId};
  sessionStorage.setItem(`strelva:business-entry:${actorId}`,JSON.stringify(command));
  await render(createElement(BusinessSetupPanel,{startProduct:"applications"}));await resolve(0,{actorId,businesses:[]});
  expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("Juniper");
  await act(async()=>container.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(JSON.parse(String(calls[1]!.init?.body))).toEqual(command);await resolve(1,{error:"Uncertain"},503);
  expect(sessionStorage.getItem(`strelva:business-entry:${actorId}`)).toBe(JSON.stringify(command));expect(button("Retry retained setup")).toBeTruthy();
 });
 it("does not load another actor's retained business setup",async()=>{
  sessionStorage.setItem(`strelva:business-entry:${businessId}`,JSON.stringify({destination:{kind:"new",name:"Other business"},initialRequest:saved.request,idempotencyKey:businessId}));
  await render(createElement(BusinessSetupPanel));await resolve(0,{actorId,businesses:[]});expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("");expect(button("Retry retained setup")).toBeUndefined();
 });
});
