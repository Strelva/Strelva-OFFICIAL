// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingExperience } from "@/products/onboarding/OnboardingExperience";

const workspaceId="b9300000-0000-4000-8000-000000000001",workId="b9300000-0000-4000-8000-000000000002";
const record={workId,workspaceId,createdAt:"2026-09-21T12:00:00Z",updatedAt:"2026-09-21T12:00:00Z",case:{version:1,revision:0,title:"Supplier documents",subjectType:"supplier",subjectLabel:"Juniper",status:"in_progress",assignee:null,requirements:[{id:"b9300000-0000-4000-8000-000000000003",key:"tax",label:"Tax ID",fields:[],status:"missing",document:null,proposedData:{},reviewedData:null,acceptedRevision:null,acceptedAt:null,stale:false}],history:[],createdBy:workspaceId,createdAt:"2026-09-21T12:00:00Z"}};
let container:HTMLDivElement,root:Root,calls:Array<{url:string,init?:RequestInit,resolve:(value:Response)=>void}>;
const onSaved=vi.fn();
async function render(initialCaseId?:string){await act(async()=>root.render(createElement(OnboardingExperience,{workspaceId,initialCaseId,onSaved})));}
async function resolve(index:number,value:unknown){await act(async()=>calls[index]!.resolve(new Response(JSON.stringify(value),{status:200,headers:{"Content-Type":"application/json"}})));}
async function fill(label:string,value:string){const el=[...container.querySelectorAll("label")].find(item=>item.textContent===label)!;const control=document.getElementById(el.htmlFor) as HTMLInputElement|HTMLTextAreaElement;await act(async()=>{const prototype=control.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,"value")!.set!.call(control,value);control.dispatchEvent(new Event("input",{bubbles:true}));});}
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);calls=[];onSaved.mockReset();vi.stubGlobal("fetch",(url:string,init?:RequestInit)=>new Promise(resolve=>calls.push({url,init,resolve})));container=document.createElement("div");document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
describe("onboarding saved-case handoff",()=>{
 it("does not start an upload in the editor the shell is replacing",async()=>{
  await render();await resolve(0,{cases:[],documents:[]});
  await fill("Case title","Supplier documents");await fill("Customer name","Juniper");await fill("Requirements","Tax ID");
  await act(async()=>container.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(calls).toHaveLength(2);await resolve(1,record);
  expect(onSaved).toHaveBeenCalledWith(workId);
  expect(container.querySelector<HTMLInputElement>('input[type="file"]')!.disabled).toBe(true);
  expect(container.textContent).toContain("Your case is saved");
  expect(container.querySelector('a[href*="view=onboarding"]')?.getAttribute("href")).toContain(`work=${workId}`);
  // Even a synthetic event cannot bypass the disabled handoff state.
  const input=container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input,"files",{value:[new File(["test"],"proof.txt")],configurable:true});
  await act(async()=>input.dispatchEvent(new Event("change",{bubbles:true})));
  expect(calls).toHaveLength(2);
  await render(workId);expect(calls).toHaveLength(3);await resolve(2,{...record,documents:[]});
  expect(container.querySelector<HTMLInputElement>('input[type="file"]')!.disabled).toBe(false);
  expect(container.textContent).not.toContain("Your case is saved");
 });
 it("does not submit duplicate case creation before React updates the controls",async()=>{
  await render();await resolve(0,{cases:[],documents:[]});await fill("Case title","Supplier documents");await fill("Customer name","Juniper");await fill("Requirements","Tax ID");
  await act(async()=>{const form=container.querySelector("form")!;form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
  expect(calls.filter(call=>call.init?.method==="POST")).toHaveLength(1);
  await resolve(1,record);
 });
});
