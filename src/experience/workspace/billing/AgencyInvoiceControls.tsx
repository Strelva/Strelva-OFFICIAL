"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import type { AgencyInvoice } from "@/platform/agency-billing/types";

export function AgencyInvoiceControls({agencyWorkspaceId,businessWorkspaceId,initialInvoices=[]}:{agencyWorkspaceId:string;businessWorkspaceId:string;initialInvoices?:AgencyInvoice[]}) {
 const [kind,setKind]=useState("rebill");const [invoice,setInvoice]=useState<AgencyInvoice|null>(initialInvoices[0]??null);const [idempotencyKey,setIdempotencyKey]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 async function command(body:Record<string,unknown>) {
  setBusy(true);setError("");try {
   const response=await fetch((body.action==="propose"?kind:invoice?.kind)==="rebill"?`/api/agency/clients/${businessWorkspaceId}/rebill`:"/api/agency/pay-links",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   const value=await response.json();if(!response.ok)throw new Error(value.error??"The invoice could not be confirmed.");setInvoice(value);if(body.action==="propose")setIdempotencyKey("");
  }catch(cause){setError(cause instanceof Error?cause.message:"The invoice could not be confirmed.");}finally{setBusy(false);}
 }
 return <details className="mt-4"><summary className="cursor-pointer text-sm">Set a client retail agreement</summary>
  <p className="mt-3 text-sm text-gray-muted">The business owner reviews the exact terms before any checkout or subscription is created. Your wholesale bill stays separate.</p>
  <form className="mt-4 grid gap-3" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void command({action:"propose",agencyWorkspaceId,businessWorkspaceId,kind,amountCents:Number(form.get("amountCents")),currency:"usd",description:form.get("description"),idempotencyKey:idempotencyKey||(()=>{const key=crypto.randomUUID();setIdempotencyKey(key);return key;})()});}}>
   <SelectInput label="Agreement" value={kind} disabled={busy} onChange={event=>setKind(event.target.value)} options={[{value:"rebill",label:"Monthly retail subscription"},{value:"pay_link",label:"One-off invoice"}]} />
   <TextInput label="Amount in cents (USD)" name="amountCents" type="number" min={1} max={100000000} step={1} required disabled={busy} />
   <TextInput label="What this covers" name="description" maxLength={300} required disabled={busy}/><Button type="submit" disabled={busy}>Prepare client agreement</Button>
  </form>
  {initialInvoices.length > 1 ? <SelectInput className="mt-4" label="Existing client agreements" value={invoice?.id ?? ""} onChange={event=>setInvoice(initialInvoices.find(item=>item.id===event.target.value)??null)} options={initialInvoices.map(item=>({value:item.id,label:`${item.description} · ${item.status.replaceAll("_"," ")}`}))} /> : null}
  {invoice?<div className="mt-4 space-y-3 text-sm"><p role="status">Agreement {invoice.status.replaceAll("_"," ")}. ${(invoice.amount_cents/100).toFixed(2)}{invoice.kind==="rebill"?" / month":" once"}.</p><a className="underline" href={`/workspace/billing?workspaceId=${businessWorkspaceId}&invoiceId=${invoice.id}`}>Client review page</a>{invoice.status==="accepted"?<Button disabled={busy} onClick={()=>void command({action:"fulfill",intentId:invoice.id})}>Create accepted checkout</Button>:null}{invoice.checkout_url?<a className="block underline" href={invoice.checkout_url}>Open payment page</a>:null}</div>:null}
  {error?<p role="alert" className="mt-3 text-sm text-critical">{error}</p>:null}
 </details>;
}
export function AgencyInvoiceAcceptance({invoiceId}:{invoiceId:string}) {
 const [invoice,setInvoice]=useState<AgencyInvoice|null>(null);const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 const load=useCallback(async()=> {const response=await fetch(`/api/agency/pay-links?intentId=${invoiceId}`,{cache:"no-store"});const value=await response.json();if(!response.ok)throw new Error(value.error??"The agreement could not be loaded.");setInvoice(value);},[invoiceId]);
 useEffect(()=>{void load().catch(cause=>setError(cause instanceof Error?cause.message:"The agreement could not be loaded."));},[load]);
 async function respond(action:"accept"|"decline"|"fulfill") {setBusy(true);setError("");try {const response=await fetch("/api/agency/pay-links",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,intentId:invoiceId})});const value=await response.json();if(!response.ok)throw new Error(value.error??"Your answer could not be confirmed.");setInvoice(value);}catch(cause){setError(cause instanceof Error?cause.message:"Your answer could not be confirmed.");}finally{setBusy(false);}}
 return <section className="mt-8" aria-labelledby="retail-agreement"><h2 id="retail-agreement" className="font-medium">Agency retail agreement</h2>{invoice?<><p className="mt-3">{invoice.description}</p><p className="mt-3 tabular-nums">{new Intl.NumberFormat(undefined,{style:"currency",currency:invoice.currency}).format(invoice.amount_cents/100)}{invoice.kind==="rebill"?" / month":" once"}</p><p className="mt-3 text-sm text-gray-muted">Your agency is the seller. This agreement is separate from its wholesale bill and existing job limits. Status: {invoice.status.replaceAll("_"," ")}.</p>{invoice.status==="proposed"&&invoice.can_accept?<div className="mt-4 flex flex-wrap gap-3"><Button disabled={busy} onClick={()=>void respond("accept")}>Accept these terms</Button><Button variant="secondary" disabled={busy} onClick={()=>void respond("decline")}>Decline</Button></div>:null}{invoice.status==="accepted"&&invoice.can_manage?<Button className="mt-4" disabled={busy} onClick={()=>void respond("fulfill")}>Create accepted checkout</Button>:null}{invoice.status==="awaiting_payment"&&!invoice.checkout_url?<p role="status" className="mt-4 text-sm">The subscription is recorded. Its payment page still needs reconciliation; no new subscription is being created.</p>:null}{invoice.checkout_url?<a className="mt-4 inline-flex min-h-12 items-center underline" href={invoice.checkout_url}>Pay this agreement</a>:null}</>:error?null:<p role="status" className="mt-4 text-sm">Loading agreement…</p>}{error?<p role="alert" className="mt-4 text-sm text-critical">{error}</p>:null}</section>;
}
