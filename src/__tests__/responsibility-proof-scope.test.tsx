// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResponsibilityProof, type ResponsibilityProofData } from "@/experience/operations/ResponsibilityProof";
let root:Root | undefined;
beforeEach(()=>vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true));
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;document.body.innerHTML="";vi.unstubAllGlobals();});
const a="99100000-0000-4000-8000-000000000011",b="99100000-0000-4000-8000-000000000022";
const data=(id:string):ResponsibilityProofData=>({proof:{cards:[],verdict:`Proof for ${id}`},state:{businessId:id,providerWorkspaceId:a,canSetCadence:true,cadence:"weekly",mandates:[{serviceRequestId:a,providerWorkspaceId:a,investigations:{},everySeconds:604800,nextAt:"2026-10-09T00:00:00.000Z",idempotencyKey:"mandate:1"}]}});
const response=(id:string)=>new Response(JSON.stringify(data(id)),{status:200});
function deferred(){let resolve!:(value:Response)=>void;const promise=new Promise<Response>(r=>{resolve=r;});return {promise,resolve};}
async function render(id:string){if(!root){const node=document.createElement("div");document.body.append(node);root=createRoot(node);}await act(async()=>root!.render(createElement(ResponsibilityProof,{workspaceId:id,readOnly:false})));}
it("hides the prior workspace immediately and ignores a late manual reload",async()=>{
 const old=deferred(),current=deferred();const signals: AbortSignal[]=[];
 vi.stubGlobal("fetch",vi.fn((_url:string,options?:RequestInit)=>{if(options?.signal)signals.push(options.signal);return signals.length===1?Promise.resolve(response(a)):signals.length===2?old.promise:current.promise;}));
 await render(a);expect(document.body.textContent).toContain(`Proof for ${a}`);
 await act(async()=>{[...document.querySelectorAll("button")].find(x=>x.textContent==="Reload proof")!.click();});
 await render(b);expect(document.body.textContent).not.toContain(`Proof for ${a}`);expect(document.body.textContent).not.toContain("Turn on Keep me found");expect(signals[1]!.aborted).toBe(true);
 await act(async()=>old.resolve(response(a)));expect(document.body.textContent).not.toContain(`Proof for ${a}`);
 await act(async()=>current.resolve(response(b)));expect(document.body.textContent).toContain(`Proof for ${b}`);
});
it("does not carry a delayed mutation result or error into another business",async()=>{
 const mutation=deferred(),current=deferred();let postSignal:AbortSignal|undefined;
 vi.stubGlobal("fetch",vi.fn((url:string,options?:RequestInit)=>{if(options?.method==="POST"){postSignal=options.signal??undefined;return mutation.promise;}return url.includes(a)?Promise.resolve(response(a)):current.promise;}));
 await render(a);await act(async()=>{[...document.querySelectorAll("button")].find(x=>x.textContent==="Turn on Keep me found")!.click();});
 await render(b);expect(postSignal?.aborted).toBe(true);
 await act(async()=>mutation.resolve(new Response(JSON.stringify({error:"Old business refusal"}),{status:409})));
 expect(document.body.textContent).not.toContain("Old business refusal");expect(document.body.textContent).not.toContain(`Proof for ${a}`);
 await act(async()=>current.resolve(response(b)));expect(document.body.textContent).toContain(`Proof for ${b}`);
});
it("retains same-workspace proof on a transient reload failure and locks changes until reload",async()=>{
 let calls=0;vi.stubGlobal("fetch",vi.fn(async()=>++calls===1?response(a):new Response(JSON.stringify({error:"Proof unavailable"}),{status:503})));
 await render(a);await act(async()=>{[...document.querySelectorAll("button")].find(x=>x.textContent==="Reload proof")!.click();});
 expect(document.body.textContent).toContain(`Proof for ${a}`);expect(document.body.textContent).toContain("Proof unavailable");expect([...document.querySelectorAll("button")].find(x=>x.textContent==="Turn on Keep me found")!.disabled).toBe(true);
});

it("shows an ordinary unavailable state when the gateway returns HTML",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>new Response("<!DOCTYPE html><title>Unavailable</title>",{status:503})));
 await render(a);expect(document.body.textContent).toContain("Responsibility proof is unavailable.");expect(document.body.textContent).not.toContain("Unexpected token");expect(document.body.textContent).not.toContain("DOCTYPE");
});
it("shows unavailable proof for a malformed successful response without claiming an empty result",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({responsibilities:[]})));
  await render(a);
  expect(document.body.textContent).toContain("Responsibility proof is unavailable");
  expect(document.body.textContent).not.toContain("No standing responsibilities yet");
 });
 it("rejects successful proof for another business",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json(data(b))));
  await render(a);
  expect(document.body.textContent).toContain("Responsibility proof is unavailable");
  expect(document.body.textContent).not.toContain(`Proof for ${b}`);
 });
