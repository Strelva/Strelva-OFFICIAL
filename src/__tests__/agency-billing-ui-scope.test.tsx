// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgencyInvoiceAcceptance, AgencyInvoiceControls } from "@/experience/workspace/billing/AgencyInvoiceControls";
import { WorkspacePayerTransition } from "@/experience/workspace/WorkspacePayerTransition";
import type { AgencyInvoice } from "@/platform/agency-billing/types";

const roots: ReturnType<typeof createRoot>[]=[];
beforeEach(()=>vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true));
afterEach(async()=>{for(const root of roots.splice(0))await act(async()=>root.unmount());document.body.innerHTML="";vi.unstubAllGlobals();});
function host(){const node=document.createElement("div");document.body.append(node);const root=createRoot(node);roots.push(root);return {node,root};}
function deferred(){let resolve!:(value:Response)=>void;const promise=new Promise<Response>(done=>{resolve=done;});return {promise,resolve};}
function invoice(id:string,description:string,amount=100):AgencyInvoice{return {id,agency_workspace_id:"agency",business_workspace_id:id,kind:"pay_link",amount_cents:amount,currency:"usd",description,status:"accepted",can_manage:true,provider_object_id:null,provider_account_id:null,checkout_url:null};}
const button=(node:HTMLElement,name:string)=>[...node.querySelectorAll("button")].find(item=>item.textContent===name)!;

it("aborts a prior client command and keeps its late response/error out of the current agreement",async()=>{
 const {node,root}=host();const old=deferred();let signal:AbortSignal|undefined;
 const request=vi.fn<typeof fetch>((_url,init)=>{signal=init?.signal??undefined;return old.promise;});
 await act(async()=>root.render(createElement(AgencyInvoiceControls,{agencyWorkspaceId:"agency",businessWorkspaceId:"one",initialInvoices:[invoice("one","First client"),invoice("third","Other agreement",400)],request})));
 await act(async()=>button(node,"Create accepted checkout").click());
 const selector=node.querySelector<HTMLSelectElement>('select[id]')!;
 const agreements=[...node.querySelectorAll<HTMLSelectElement>("select")].find(item=>[...item.options].some(option=>option.value==="third"))!;
 expect(selector).toBeTruthy();expect(agreements.disabled).toBe(true);
 await act(async()=>{agreements.value="third";agreements.dispatchEvent(new Event("change",{bubbles:true}));});
 expect(node.textContent).toContain("$1.00");
 await act(async()=>root.render(createElement(AgencyInvoiceControls,{agencyWorkspaceId:"agency",businessWorkspaceId:"two",initialInvoices:[invoice("two","Second client",900)],request})));
 expect(signal?.aborted).toBe(true);expect(node.textContent).toContain("$9.00");expect(button(node,"Create accepted checkout").disabled).toBe(false);
 await act(async()=>old.resolve(Response.json({error:"First client provider failed"},{status:503})));
 expect(node.textContent).toContain("$9.00");expect(node.textContent).not.toContain("First client provider failed");expect(node.querySelector("[role=alert]")).toBeNull();
});
it("late invoice reads cannot replace the invoice selected by a route change",async()=>{
 const {node,root}=host();const old=deferred();let signal:AbortSignal|undefined;
 const request=vi.fn<typeof fetch>((url,init)=>{if(String(url).endsWith("one")){signal=init?.signal??undefined;return old.promise;}return Promise.resolve(Response.json(invoice("two","Second invoice")));});
 await act(async()=>root.render(createElement(AgencyInvoiceAcceptance,{invoiceId:"one",request})));
 await act(async()=>root.render(createElement(AgencyInvoiceAcceptance,{invoiceId:"two",request})));
 expect(signal?.aborted).toBe(true);expect(node.textContent).toContain("Second invoice");
 await act(async()=>old.resolve(Response.json(invoice("one","Wrong old invoice"))));
 expect(node.textContent).not.toContain("Wrong old invoice");expect(node.textContent).toContain("Second invoice");
});
it("late accepted invoice commands cannot change a newly selected invoice or its busy state",async()=>{
 const {node,root}=host();const old=deferred();let signal:AbortSignal|undefined;
 const request=vi.fn<typeof fetch>((url,init)=>{if(init?.method==="POST"){signal=init.signal??undefined;return old.promise;}return Promise.resolve(Response.json(invoice(String(url).endsWith("one")?"one":"two",String(url).endsWith("one")?"First":"Second")));});
 await act(async()=>root.render(createElement(AgencyInvoiceAcceptance,{invoiceId:"one",request})));
 await act(async()=>button(node,"Create accepted checkout").click());
 await act(async()=>root.render(createElement(AgencyInvoiceAcceptance,{invoiceId:"two",request})));
 expect(signal?.aborted).toBe(true);expect(button(node,"Create accepted checkout").disabled).toBe(false);
 await act(async()=>old.resolve(Response.json({...invoice("one","Wrong old command"),status:"paid"})));
 expect(node.textContent).toContain("Second");expect(node.textContent).not.toContain("Wrong old command");
});
it("offers agency names from scoped server options with no workspace UUID textbox",async()=>{
 const {node,root}=host();const request=vi.fn<typeof fetch>(async()=>Response.json({transitions:[],current:null,pending:null,currentActorId:"owner"}));
 await act(async()=>root.render(createElement(WorkspacePayerTransition,{workspaceId:"business",canPropose:true,agencyChoices:[{id:"agency-id",name:"Cedar Studio"}],request})));
 await act(async()=>{const select=node.querySelector("select")!;select.value="agency";select.dispatchEvent(new Event("change",{bubbles:true}));});
 expect(node.textContent).toContain("Cedar Studio");expect(node.querySelector('input[name="successorAgencyWorkspaceId"]')).toBeNull();expect(node.textContent).not.toContain("agency-id");
});
it("shows receipt review without inviting another payment",async()=>{
 const {node,root}=host();const reviewed={...invoice("review","Reviewed agreement"),status:"active",kind:"rebill",payment_receipt_state:"review",checkout_url:"https://invoice.stripe.com/i/fixture"};
 const request=vi.fn<typeof fetch>(async()=>Response.json(reviewed));
 await act(async()=>root.render(createElement(AgencyInvoiceAcceptance,{invoiceId:"review",request})));
 expect(node.querySelector("[role=alert]")?.textContent).toContain("Payment needs review");
 expect(node.textContent).not.toContain("Payment is confirmed");expect(node.textContent).not.toContain("Pay this agreement");
});
it("separates exact payment confirmation from unconfirmed subscription activity",async()=>{
 const {node,root}=host();const paid={...invoice("paid","Paid monthly agreement"),kind:"rebill",status:"awaiting_payment",payment_receipt_state:"matched",checkout_url:"https://invoice.stripe.com/i/fixture"};
 const request=vi.fn<typeof fetch>(async()=>Response.json(paid));
 await act(async()=>root.render(createElement(AgencyInvoiceAcceptance,{invoiceId:"paid",request})));
 expect(node.textContent).toContain("Payment is confirmed for these accepted terms");expect(node.textContent).toContain("subscription’s current state still needs reconciliation");expect(node.textContent).not.toContain("Pay this agreement");
});
