import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { createDirectCheckout, createDirectSubscription, getConnectedMerchant, stripeClient, type ConnectDependencies } from "@/platform/connect";

import { agencyInvoiceSchema } from "./types";
export { agencyInvoiceSchema, type AgencyInvoice } from "./types";
const commands=z.union([
 z.object({action:z.literal("propose"),agencyWorkspaceId:z.string().uuid(),businessWorkspaceId:z.string().uuid(),kind:z.enum(["rebill","pay_link"]),amountCents:z.number().int().min(1).max(100000000),currency:z.string().regex(/^[a-z]{3}$/),description:z.string().trim().min(1).max(300),idempotencyKey:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/)}).strict(),
 z.object({action:z.enum(["accept","decline","read","revoke","prepare"]),intentId:z.string().uuid(),businessWorkspaceId:z.string().uuid().optional()}).strict(),
]);
type RpcDb={rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{message?:string}|null}>};
async function rpc(name:string,args:Record<string,unknown>,db:RpcDb|null) {
 if(!db) throw new WorkspaceStoreError("Agency invoices are unavailable.");
 const result=await db.rpc(name,args);
 if(result.error) {
  if(result.error.message?.includes("denied")) throw new WorkspaceAccessError();
  if(result.error.message?.includes("conflict")) throw new WorkspaceConflictError("The invoice changed. Reload its terms before continuing.");
  throw new WorkspaceStoreError("The invoice could not be confirmed.");
 }
 return agencyInvoiceSchema.parse(result.data);
}
export function commandAgencyInvoice(actor:WorkspaceActor,input:unknown,db:RpcDb|null=getSupabase() as unknown as RpcDb|null) {
 return rpc("agency_billing_intent_command",{p_command:commands.parse(input),p_actor_id:actor.userId,p_verified_email:actor.verifiedEmail},db);
}
/** A client acceptance authorizes these exact retail terms; it never alters wholesale. */
export async function fulfillAgencyInvoice(actor:WorkspaceActor,intentId:string,origin:string,deps:ConnectDependencies={}) {
 const db=deps.db===undefined?getSupabase() as unknown as RpcDb|null:deps.db;
 const intent=await commandAgencyInvoice(actor,{action:"prepare",intentId},db);
 if(intent.provider_object_id) return intent;
 const merchant=await getConnectedMerchant(intent.agency_workspace_id,db);
 let objectId:string;let url:string|null;
 if(intent.kind==="pay_link") {
  const result=await createDirectCheckout({workspaceId:intent.agency_workspace_id,idempotencyKey:`agency-invoice:${intent.id}`,purpose:"pay_link",amountCents:intent.amount_cents,currency:intent.currency,referenceId:intent.id,
   successUrl:`${origin}/workspace/billing?workspaceId=${intent.business_workspace_id}&invoiceId=${intent.id}`,cancelUrl:`${origin}/workspace/billing?workspaceId=${intent.business_workspace_id}&invoiceId=${intent.id}`},deps);
  objectId=result.sessionId;url=result.url??null;
 } else {
  if(!intent.accepted_email) throw new WorkspaceStoreError("The accepted payer is unavailable.");
  const stripe=deps.stripe??stripeClient();const scope={stripeAccount:merchant.stripe_account_id!};
  const customer=await stripe.customers.create({email:intent.accepted_email,metadata:{agencyInvoiceId:intent.id,businessWorkspaceId:intent.business_workspace_id}},{...scope,idempotencyKey:`agency-invoice:${intent.id}:customer`});
  const price=await stripe.prices.create({currency:intent.currency,unit_amount:intent.amount_cents,recurring:{interval:"month"},product_data:{name:intent.description}},{...scope,idempotencyKey:`agency-invoice:${intent.id}:price`});
  const subscription=await createDirectSubscription({workspaceId:intent.agency_workspace_id,idempotencyKey:`agency-invoice:${intent.id}:subscription`,customerId:customer.id,priceId:price.id,purpose:"agency_rebill",businessWorkspaceId:intent.business_workspace_id},{...deps,stripe});
  objectId=subscription.id;
  const invoiceId=typeof subscription.latest_invoice==="string"?subscription.latest_invoice:subscription.latest_invoice?.id;
  const persisted=await rpc("record_agency_billing_checkout",{p_intent_id:intent.id,p_account_id:merchant.stripe_account_id,p_object_id:objectId,p_url:null},db);
  try { url=invoiceId?(await stripe.invoices.retrieve(invoiceId,scope)).hosted_invoice_url??null:null; } catch { return persisted; }
 }
 return rpc("record_agency_billing_checkout",{p_intent_id:intent.id,p_account_id:merchant.stripe_account_id,p_object_id:objectId,p_url:url},db);
}

/** Call only after Stripe signature verification. Scoped account + provider id owns attribution. */
export async function syncAgencyInvoiceFromConnectEvent(event:import("stripe").default.Event,db:RpcDb|null=getSupabase() as unknown as RpcDb|null) {
 if(!event.account||!db)return {ignored:true};
 const object=event.data.object as unknown as {id:string;status?:string;payment_status?:string;subscription?:string|{id?:string};parent?:{subscription_details?:{subscription?:string|{id?:string}}}};
 let status:"active"|"paid"|"cancelled"|null=null;let providerId=object.id;
 if(event.type==="checkout.session.completed"&&object.payment_status==="paid")status="paid";
 if(event.type==="customer.subscription.updated"&&object.status==="active")status="active";
 if(event.type==="customer.subscription.deleted")status="cancelled";
 if(event.type==="invoice.paid") {const subscription=object.parent?.subscription_details?.subscription??object.subscription;providerId=typeof subscription==="string"?subscription:subscription?.id??"";status="active";}
 if(!status||!providerId)return {ignored:true};
 const result=await db.rpc("record_agency_billing_provider_event",{p_account_id:event.account,p_event_id:event.id,p_object_id:providerId,p_created:event.created,p_status:status});
 if(result.error)throw new WorkspaceStoreError("The agency payment receipt could not be recorded.");
 return result.data;
}
