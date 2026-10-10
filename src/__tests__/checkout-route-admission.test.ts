import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),create:vi.fn(),retrieve:vi.fn(),error:vi.fn()}));
vi.mock("stripe",()=>({default:class {checkout={sessions:{create:mocks.create,retrieve:mocks.retrieve}};}}));
vi.mock("@/platform/infra/db/client",()=>({getSupabase:()=>({rpc:mocks.rpc})}));
vi.mock("@/platform/business-billing",()=>({workspaceIdForTenant:async()=>"c0900000-0000-4000-8000-000000000010"}));
vi.mock("@/lib/tenant",()=>({getTenantFromHeaders:async()=>"fictional-store"}));
vi.mock("@/lib/tenants",()=>({getTenantConfig:async()=>({active:true})}));
vi.mock("@/lib/storage",()=>({getContent:async()=>({products:[{id:"fictional-product",name:"Fictional product",price:"$10",comingSoon:false}]})}));
vi.mock("@/platform/infra/rate-limit",()=>({isRateLimitedAsync:async()=>false,rateLimitKey:()=>"fictional-checkout"}));
vi.mock("@/platform/infra/monitoring",()=>({trackError:mocks.error}));
import { POST } from "@/app/api/checkout/route";
const paymentId="c0900000-0000-4000-8000-000000000011";
const request=()=>new NextRequest("http://localhost/checkout",{method:"POST",headers:{"content-type":"application/json","idempotency-key":"fixture-stable-key"},body:JSON.stringify({items:[{productId:"fictional-product",quantity:1,subscription:false}]})});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("STRIPE_SECRET_KEY","sk_test_fictional_local");vi.stubEnv("STRELVA_CONNECT","1");vi.stubEnv("STRELVA_CONNECT_CHECKOUT_TENANTS","fictional-store");mocks.create.mockResolvedValue({id:"cs_Store",url:"https://checkout.stripe.com/fictional"});mocks.retrieve.mockResolvedValue({id:"cs_Accepted",url:"https://checkout.stripe.com/accepted"});mocks.rpc.mockImplementation(async(name:string)=>({data:name==="read_connected_account"?{workspace_id:"c0900000-0000-4000-8000-000000000010",stripe_account_id:"acct_Store",configurations:["merchant"],profile_version:"fixture",state:"ready",generation:9,capabilities:{},requirements:{}}:name==="reserve_business_payment"?{id:paymentId}:name==="prepare_business_checkout"?{}:true,error:null}));});
afterEach(()=>vi.unstubAllEnvs());
describe("actual store Checkout request handler with local ports (not native/provider proof)",()=>{
 it("refuses a new connected session when final authority is withdrawn during preparation",async()=>{
  const original=mocks.rpc.getMockImplementation()!;mocks.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>name==="assert_business_checkout_admission"?{data:null,error:{message:"checkout_admission_denied"}}:original(name,args));
  const result=await POST(request());expect(result.status).toBe(500);expect(mocks.create).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenCalledWith("assert_business_checkout_admission",expect.objectContaining({p_payment_id:paymentId,p_account:"acct_Store",p_generation:9,p_actor_id:null}));
 });
 it("retains exact merchant scope/key/zero fee and frozen shipping after admission",async()=>{
  const result=await POST(request());expect(result.status).toBe(200);expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({mode:"payment",payment_intent_data:{application_fee_amount:0,metadata:{businessPaymentId:paymentId}},shipping_options:[expect.objectContaining({shipping_rate_data:expect.objectContaining({fixed_amount:{amount:599,currency:"usd"}})})]}),{stripeAccount:"acct_Store",idempotencyKey:`payment:${paymentId}`});expect(mocks.rpc.mock.calls.map(([name])=>name)).toEqual(["read_connected_account","reserve_business_payment","claim_business_payment_channel","prepare_business_checkout","assert_business_checkout_admission","record_business_payment_event"]);
 });
 it("retrieves accepted connected session without final new-effect admission",async()=>{
  const original=mocks.rpc.getMockImplementation()!;mocks.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>name==="prepare_business_checkout"?{data:{sessionId:"cs_Accepted"},error:null}:original(name,args));
  expect((await POST(request())).status).toBe(200);expect(mocks.create).not.toHaveBeenCalled();expect(mocks.retrieve).toHaveBeenCalledWith("cs_Accepted",{stripeAccount:"acct_Store"});expect(mocks.rpc.mock.calls.some(([name])=>name==="assert_business_checkout_admission")).toBe(false);
 });
 it("preserves the unactivated frozen client rail and its original payload",async()=>{
  vi.stubEnv("STRELVA_CONNECT_CHECKOUT_TENANTS","");expect((await POST(request())).status).toBe(200);expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({mode:"payment",line_items:[expect.objectContaining({quantity:1})]}),undefined);
 });
});
