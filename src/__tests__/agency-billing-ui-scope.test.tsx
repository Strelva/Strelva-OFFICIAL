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
 await act(async()=>root.render(createElement(AgencyInvoiceControls,{agencyWorkspaceId:"agency",businessWorkspaceId:"one",checkoutAvailability:{status:"ready"},initialInvoices:[invoice("one","First client"),invoice("third","Other agreement",400)],request})));
 await act(async()=>button(node,"Create accepted checkout").click());
 const selector=node.querySelector<HTMLSelectElement>('select[id]')!;
 const agreements=[...node.querySelectorAll<HTMLSelectElement>("select")].find(item=>[...item.options].some(option=>option.value==="third"))!;
 expect(selector).toBeTruthy();expect(agreements.disabled).toBe(true);
 await act(async()=>{agreements.value="third";agreements.dispatchEvent(new Event("change",{bubbles:true}));});
 expect(node.textContent).toContain("$1.00");
 await act(async()=>root.render(createElement(AgencyInvoiceControls,{agencyWorkspaceId:"agency",businessWorkspaceId:"two",checkoutAvailability:{status:"ready"},initialInvoices:[invoice("two","Second client",900)],request})));
 expect(signal?.aborted).toBe(true);expect(node.textContent).toContain("$9.00");expect(button(node,"Create accepted checkout").disabled).toBe(false);
 await act(async()=>old.resolve(Response.json({error:"First client provider failed"},{status:503})));
 expect(node.textContent).toContain("$9.00");expect(node.textContent).not.toContain("First client provider failed");expect(node.querySelector("[role=alert]")).toBeNull();
});
it("late invoice reads cannot replace the invoice selected by a route change",async()=>{
 const {node,root}=host();const old=deferred();let signal:AbortSignal|undefined;
 const request=vi.fn<typeof fetch>((url,init)=>{if(String(url).endsWith("one")){signal=init?.signal??undefined;return old.promise;}return Promise.resolve(Response.json(invoice("two","Second invoice")));});
 await act(async()=>root.render(createElement(AgencyInvoiceAcceptance,{invoiceId:"one",checkoutAvailability:{status:"ready"},request})));
 await act(async()=>root.render(createElement(AgencyInvoiceAcceptance,{invoiceId:"two",checkoutAvailability:{status:"ready"},request})));
 expect(signal?.aborted).toBe(true);expect(node.textContent).toContain("Second invoice");
 await act(async()=>old.resolve(Response.json(invoice("one","Wrong old invoice"))));
 expect(node.textContent).not.toContain("Wrong old invoice");expect(node.textContent).toContain("Second invoice");
});
it("late accepted invoice commands cannot change a newly selected invoice or its busy state",async()=>{
 const {node,root}=host();const old=deferred();let signal:AbortSignal|undefined;
 const request=vi.fn<typeof fetch>((url,init)=>{if(init?.method==="POST"){signal=init.signal??undefined;return old.promise;}return Promise.resolve(Response.json(invoice(String(url).endsWith("one")?"one":"two",String(url).endsWith("one")?"First":"Second")));});
 await act(async()=>root.render(createElement(AgencyInvoiceAcceptance,{invoiceId:"one",checkoutAvailability:{status:"ready"},request})));
 await act(async()=>button(node,"Create accepted checkout").click());
 await act(async()=>root.render(createElement(AgencyInvoiceAcceptance,{invoiceId:"two",checkoutAvailability:{status:"ready"},request})));
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

it.each(["coming_soon", "setup_required", "unavailable"] as const)("withholds checkout and payment links when payments are %s",async status=>{
 const {node,root}=host();const request=vi.fn<typeof fetch>();
 const accepted={...invoice("one","Client agreement"),checkout_url:"https://checkout.stripe.com/fictional"};
 await act(async()=>root.render(createElement(AgencyInvoiceControls,{agencyWorkspaceId:"agency",businessWorkspaceId:"one",initialInvoices:[accepted],checkoutAvailability:{status},request})));
 const checkout=button(node,"Create accepted checkout");expect(checkout.disabled).toBe(true);
 await act(async()=>checkout.click());expect(request).not.toHaveBeenCalled();expect(node.textContent).not.toContain("Open payment page");
 if(status==="coming_soon")expect(node.textContent).toContain("Coming soon");
});
it("keeps checkout fail-closed when the caller omits payment readiness",async()=>{
 const {node,root}=host();const request=vi.fn<typeof fetch>(async()=>Response.json(invoice("one","Client agreement")));
 await act(async()=>root.render(createElement(AgencyInvoiceAcceptance,{invoiceId:"one",request})));
 expect(button(node,"Create accepted checkout").disabled).toBe(true);expect(node.textContent).toContain("Coming soon");
});
it("offers serving agencies without suggesting the owner join their team",async()=>{
 const {node,root}=host();const request=vi.fn<typeof fetch>(async()=>Response.json({transitions:[],current:null,pending:null,currentActorId:"owner"}));
 await act(async()=>root.render(createElement(WorkspacePayerTransition,{workspaceId:"business",canPropose:true,request})));
 await act(async()=>{const select=node.querySelector("select")!;select.value="agency";select.dispatchEvent(new Event("change",{bubbles:true}));});
 expect(node.textContent).toContain("No agency is serving this business yet");expect(node.textContent).toContain("You do not need to join its team");expect(node.textContent).not.toContain("Ask its owner for an invitation");
});
it("filters the response inbox to the current business after accepting an agency payer",async()=>{
 const {node,root}=host();const pending={id:"proposal",workspaceId:"business",successorKind:"agency",successorWorkspaceId:"agency",successorWorkspaceName:"Cedar",status:"pending",canRespond:true,proposerEmail:"owner@test.invalid"};
 const foreign={...pending,id:"foreign",workspaceId:"other",successorWorkspaceName:"Other agency"};
 const request=vi.fn<typeof fetch>(async(_url,init)=>Response.json({transitions:init?.method==="POST"?[{...pending,status:"accepted",acceptedAt:"2026-10-12T12:00:00Z"},foreign]:[pending],pending,current:null,currentActorId:"agency-owner"}));
 await act(async()=>root.render(createElement(WorkspacePayerTransition,{workspaceId:"business",canPropose:false,request})));
 await act(async()=>button(node,"Accept future payer role").click());
 expect(node.textContent).not.toContain("Other agency");expect(node.textContent).not.toContain("Pending ·");expect(node.textContent).toContain("Cedar");
});
