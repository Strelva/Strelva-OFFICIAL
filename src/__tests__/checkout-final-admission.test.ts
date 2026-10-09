import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { createDirectCheckout } from "@/platform/connect";
const workspaceId="c0900000-0000-4000-8000-000000000010",paymentId="c0900000-0000-4000-8000-000000000011";
const merchant={workspace_id:workspaceId,stripe_account_id:"acct_Merchant",configurations:["merchant"],profile_version:"approved-local",state:"ready",generation:4,capabilities:{},requirements:{}};
const input={workspaceId,idempotencyKey:"stable-key",purpose:"checkout" as const,amountCents:1000,currency:"usd",successUrl:"https://app.example/paid",cancelUrl:"https://app.example/cancel"};
beforeEach(()=>vi.stubEnv("STRELVA_CONNECT","1"));afterEach(()=>vi.unstubAllEnvs());
describe("Checkout final new-session admission (mocked contract, no provider qualification)",()=>{
 it("stops new session when actual final native admission rejects after preparation wait",async()=>{
  let live=true,entered!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;}),wait=new Promise<void>(resolve=>{release=resolve;});
  const rpc=vi.fn(async(name:string)=>{if(name==="read_connected_account")return {data:merchant,error:null};if(name==="reserve_business_payment")return {data:{id:paymentId},error:null};if(name==="prepare_business_checkout"){entered();await wait;return {data:{},error:null};}if(name==="assert_business_checkout_admission"&&!live)return {data:null,error:{message:"checkout_admission_denied"}};return {data:true,error:null};});
  const create=vi.fn(async()=>({id:"cs_New",url:"https://checkout.stripe.com/test"}));
  const operation=createDirectCheckout(input,{db:{rpc},stripe:{checkout:{sessions:{create}}} as unknown as Stripe});
  const denied=expect(operation).rejects.toThrow();await started;live=false;release();await denied;
  expect(create).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledWith("assert_business_checkout_admission",expect.objectContaining({p_payment_id:paymentId,p_account:"acct_Merchant",p_generation:4}));
 });
 it("checks final payment authority after any caller admission callback wait",async()=>{
  let live=true;
  const rpc=vi.fn(async(name:string)=>({data:name==="read_connected_account"?merchant:name==="reserve_business_payment"?{id:paymentId}:name==="prepare_business_checkout"?{}:true,error:name==="assert_business_checkout_admission"&&!live?{message:"checkout_admission_denied"}:null}));
  const create=vi.fn();await expect(createDirectCheckout(input,{db:{rpc},stripe:{checkout:{sessions:{create}}} as unknown as Stripe,beforeProviderMutation:async()=>{live=false;}})).rejects.toThrow();expect(create).not.toHaveBeenCalled();
 });
 it("preserves accepted session recovery without new-effect checks or callback",async()=>{
  const rpc=vi.fn(async(name:string)=>({data:name==="read_connected_account"?merchant:name==="reserve_business_payment"?{id:paymentId}:name==="prepare_business_checkout"?{sessionId:"cs_Accepted"}:null,error:name==="assert_business_checkout_admission"?{message:"checkout_admission_denied"}:null}));
  const callback=vi.fn(),create=vi.fn(),retrieve=vi.fn(async()=>({id:"cs_Accepted",url:"https://checkout.stripe.com/accepted"}));
  await expect(createDirectCheckout(input,{db:{rpc},stripe:{checkout:{sessions:{create,retrieve}}} as unknown as Stripe,beforeProviderMutation:callback})).resolves.toMatchObject({sessionId:"cs_Accepted"});expect(create).not.toHaveBeenCalled();expect(callback).not.toHaveBeenCalled();expect(rpc.mock.calls.some(([name])=>name==="assert_business_checkout_admission")).toBe(false);
 });
 it("records already accepted provider effect if authority disappears during POST",async()=>{
  let live=true;
  const rpc=vi.fn(async(name:string)=>({data:name==="read_connected_account"?merchant:name==="reserve_business_payment"?{id:paymentId}:name==="prepare_business_checkout"?{}:true,error:name==="assert_business_checkout_admission"&&!live?{message:"checkout_admission_denied"}:null}));
  const create=vi.fn(async()=>{live=false;return {id:"cs_Accepted",url:"https://checkout.stripe.com/accepted"};});
  await expect(createDirectCheckout(input,{db:{rpc},stripe:{checkout:{sessions:{create}}} as unknown as Stripe})).resolves.toMatchObject({sessionId:"cs_Accepted"});expect(rpc).toHaveBeenLastCalledWith("record_business_payment_event",expect.objectContaining({p_object_id:"cs_Accepted"}));expect(rpc.mock.calls.filter(([name])=>name==="assert_business_checkout_admission")).toHaveLength(1);
 });
 it("refuses malformed affirmative native admission before provider POST",async()=>{
  const rpc=vi.fn(async(name:string)=>({data:name==="read_connected_account"?merchant:name==="reserve_business_payment"?{id:paymentId}:name==="prepare_business_checkout"?{}:null,error:null}));const create=vi.fn();await expect(createDirectCheckout(input,{db:{rpc},stripe:{checkout:{sessions:{create}}} as unknown as Stripe})).rejects.toThrow();expect(create).not.toHaveBeenCalled();
 });
});
