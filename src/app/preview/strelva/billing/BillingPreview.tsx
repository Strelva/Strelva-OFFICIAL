"use client";
import { useCallback, useState } from "react";
import { AgencyBillingView } from "@/experience/workspace/billing/AgencyBillingView";
import { WorkspacePayerTransition } from "@/experience/workspace/WorkspacePayerTransition";
import { AgencyInvoiceAcceptance } from "@/experience/workspace/billing/AgencyInvoiceControls";
import type { AgencyInvoice } from "@/platform/agency-billing/types";
import type { PayerTransition, PayerTransitionSnapshot } from "@/platform/work-economics/payer-transitions";
const business="7e000000-0000-4000-8000-000000000010";const agency="7e000000-0000-4000-8000-000000000020";const actor="7e000000-0000-4000-8000-000000000001";
export function BillingPreview({mode}:{mode:string}) {
 const [invoiceStatus,setInvoiceStatus]=useState<AgencyInvoice["status"]>(mode==="invoice-unconfirmed"?"active":mode==="invoice-matched"||mode==="invoice-review"?"awaiting_payment":"proposed");
 const invoiceRequest=useCallback<typeof fetch>(async(_url,init)=>{
  if(mode==="invoice-error")return Response.json({error:"The agreement could not be confirmed. Try again."},{status:503});
  const next=init?.method==="POST"?JSON.parse(String(init.body)).action==="accept"?"accepted":"declined":invoiceStatus;
  if(init?.method==="POST")setInvoiceStatus(next);
  const value:AgencyInvoice={id:"7e000000-0000-4000-8000-000000000070",agency_workspace_id:agency,business_workspace_id:business,kind:"rebill",amount_cents:25000,currency:"usd",description:"Fictional monthly agency service agreement",status:next,can_accept:true,can_manage:false,provider_object_id:null,provider_account_id:null,checkout_url:mode==="invoice-review"?"https://example.test/fictional-checkout":null,payment_receipt_state:mode==="invoice-review"?"review":mode==="invoice-matched"?"matched":"unconfirmed"};
  return Response.json(value);
 },[invoiceStatus,mode]);
 const [pending,setPending]=useState<PayerTransition|null>(mode.includes("pending")?{id:"7e000000-0000-4000-8000-000000000040",workspaceId:business,successorKind:mode==="agency-pending"?"agency":"business",successorUserId:"",successorEmail:"",successorWorkspaceId:mode==="agency-pending"?agency:null,successorWorkspaceName:mode==="agency-pending"?"Cedar Studio":null,proposerEmail:"owner@example.test",status:"pending",proposedAt:"2026-10-07T15:00:00Z",resolvedAt:null,acceptedAt:null,canRespond:mode!=="readonly"}:null);
 const [history,setHistory]=useState<PayerTransition[]>([]);
 const request=useCallback<typeof fetch>(async(_url,init)=>{
  if(String(_url).includes("/provider-change"))return Response.json({id:"7e000000-0000-4000-8000-000000000060",status:"awaiting_policy"});
  if(mode==="loading")return new Promise<Response>(()=>{});
  if(mode==="error")return Response.json({error:"Billing history is temporarily unavailable."},{status:503});
  let next=pending;let records=history;
  if(init?.method==="POST") {
   const command=JSON.parse(String(init.body));
   if(command.action==="propose")next={id:"7e000000-0000-4000-8000-000000000041",workspaceId:business,successorKind:command.successorAgencyWorkspaceId?"agency":command.successorKind==="business"?"business":"user",successorUserId:command.successorEmail?actor:"",successorEmail:command.successorEmail??"",successorWorkspaceId:command.successorAgencyWorkspaceId??null,successorWorkspaceName:command.successorAgencyWorkspaceId?"Cedar Studio":null,proposerEmail:"owner@example.test",status:"pending",proposedAt:new Date().toISOString(),resolvedAt:null,acceptedAt:null,canRespond:true};
   else if(next) {records=[{...next,status:command.action==="accept"?"accepted":command.action==="reject"?"rejected":"revoked",acceptedAt:command.action==="accept"?new Date().toISOString():null},...history];next=null;}
   setPending(next);setHistory(records);
  }
  const transitions=[...(next?[next]:[]),...records];const result:PayerTransitionSnapshot={transitions,current:records.find(item=>item.status==="accepted")??null,pending:next,currentActorId:actor};
  return Response.json(result);
 },[history,mode,pending]);
 return <main className="mx-auto max-w-3xl px-6 py-12 text-warm-black"><p className="text-sm text-gray-muted">Fictional local billing preview · {mode}</p>{mode.startsWith("invoice-")?<AgencyInvoiceAcceptance invoiceId="7e000000-0000-4000-8000-000000000070" request={invoiceRequest}/>:<><AgencyBillingView billing={{workspaceId:agency,accountId:"7e000000-0000-4000-8000-000000000050",name:"Cedar Studio",paymentStatus:mode==="past-due"?"past_due":"none",clients:mode==="empty"?[]:[{workspaceId:business,name:"Harbor Coffee · Buffalo and Elmwood",state:"subscription",paymentStatus:"active",lineState:"active",monthlyCents:null,planKey:"workspace",endedAt:null},{workspaceId:"7e000000-0000-4000-8000-000000000011",name:"Lakeview Practice",state:"grandfathered",paymentStatus:"active",lineState:"ended",monthlyCents:null,planKey:null,endedAt:"2026-10-07T12:00:00Z"}]}}/><WorkspacePayerTransition workspaceId={business} canPropose={mode!=="readonly"} agencyChoices={[{id:agency,name:"Cedar Studio"}]} providerChangeEnabled request={request}/></>}</main>;
}
