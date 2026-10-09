import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { fulfillAgencyInvoice } from "@/platform/agency-billing";
const actor={userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",verifiedEmail:"manager@example.test"};
const agency="11111111-1111-4111-8111-111111111111", business="22222222-2222-4222-8222-222222222222", id="33333333-3333-4333-8333-333333333333";
const invoice={id,agency_workspace_id:agency,business_workspace_id:business,kind:"rebill",amount_cents:14900,currency:"usd",description:"Accepted terms",status:"accepted",accepted_email:"accepting-owner@example.test",provider_account_id:null,provider_object_id:null,checkout_url:null};
const merchant={workspace_id:agency,stripe_account_id:"acct_Agency",configurations:["merchant"],profile_version:"approved",state:"ready",generation:7,capabilities:{},requirements:{}};
beforeEach(()=>vi.stubEnv("STRELVA_CONNECT","1"));
afterEach(()=>vi.unstubAllEnvs());
describe("exact agency authority immediately before new effects",()=>{
 it.each(["manager membership removed","manager verification withdrawn","accepting owner removed","payer changed"])("stops price and subscription after customer readback: %s",async reason=>{
  let release!:()=>void, entered!:()=>void, live=true;
  const wait=new Promise<void>(resolve=>{release=resolve;}), started=new Promise<void>(resolve=>{entered=resolve;});
  const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{
   if(name==="read_connected_account")return {data:merchant,error:null};
   if(name==="assert_agency_billing_mutation"){
    expect(args).toMatchObject({p_actor_id:actor.userId,p_verified_email:actor.verifiedEmail,p_accepted_email:invoice.accepted_email,p_account_id:merchant.stripe_account_id,p_generation:7});
    if(!live)return {data:null,error:{message:"agency_invoice_denied"}};
   }
   return {data:invoice,error:null};
  });
  const customer=vi.fn(async()=>{entered();await wait;return {id:"cus_Client"};}), price=vi.fn(), subscription=vi.fn();
  const stripe={customers:{create:customer},prices:{create:price},subscriptions:{create:subscription}} as unknown as Stripe;
  const fulfillment=fulfillAgencyInvoice(actor,id,"http://localhost:3017",{db:{rpc},stripe});
  const denied=expect(fulfillment).rejects.toThrow();
  await started;live=false;release();await denied;
  expect(customer).toHaveBeenCalledTimes(1);expect(price).not.toHaveBeenCalled();expect(subscription).not.toHaveBeenCalled();
  expect(rpc.mock.calls.some(([name])=>name==="record_agency_billing_terms_authorized")).toBe(false);
  expect(reason).toBeTruthy();
 });
 it("stops the actor-authorized binding and subscription when authority disappears during Price creation",async()=>{
  let live=true;
  const rpc=vi.fn(async(name:string)=>({data:name==="read_connected_account"?merchant:invoice,error:!live&&name==="record_agency_billing_terms_authorized"?{message:"agency_invoice_denied"}:null}));
  const subscription=vi.fn();
  const stripe={customers:{create:async()=>({id:"cus_Client"})},prices:{create:async()=>{live=false;return {id:"price_Retail"};}},subscriptions:{create:subscription}} as unknown as Stripe;
  await expect(fulfillAgencyInvoice(actor,id,"http://localhost:3017",{db:{rpc},stripe})).rejects.toThrow();
  expect(subscription).not.toHaveBeenCalled();
  expect(rpc.mock.calls.some(([name])=>name==="record_agency_billing_checkout")).toBe(false);
 });
 it("rechecks after the subscription helper's merchant read before subscription POST",async()=>{
  let live=true, reads=0;
  const rpc=vi.fn(async(name:string)=>{
   if(name==="read_connected_account"){if(++reads===2)live=false;return {data:merchant,error:null};}
   return {data:invoice,error:!live&&name==="assert_agency_billing_mutation"?{message:"agency_invoice_denied"}:null};
  });
  const subscription=vi.fn();
  const stripe={customers:{create:async()=>({id:"cus_Client"})},prices:{create:async()=>({id:"price_Retail"})},subscriptions:{create:subscription}} as unknown as Stripe;
  await expect(fulfillAgencyInvoice(actor,id,"http://localhost:3017",{db:{rpc},stripe})).rejects.toThrow();
  expect(subscription).not.toHaveBeenCalled();
  expect(rpc.mock.calls.some(([name])=>name==="record_agency_billing_terms_authorized")).toBe(true);
 });
 it("rechecks after checkout preparation before a new session POST",async()=>{
  let live=true;
  const rpc=vi.fn(async(name:string)=>{
   if(name==="read_connected_account")return {data:merchant,error:null};
   if(name==="reserve_business_payment")return {data:{id},error:null};
   if(name==="prepare_business_checkout"){live=false;return {data:{},error:null};}
   return {data:{...invoice,kind:"pay_link"},error:!live&&name==="assert_agency_billing_mutation"?{message:"agency_invoice_denied"}:null};
  });
  const create=vi.fn();const stripe={checkout:{sessions:{create}}} as unknown as Stripe;
  await expect(fulfillAgencyInvoice(actor,id,"http://localhost:3017",{db:{rpc},stripe})).rejects.toThrow();
  expect(create).not.toHaveBeenCalled();
 });
});
