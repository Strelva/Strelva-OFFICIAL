import Stripe from "stripe";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const projections=vi.hoisted(()=>({agency:vi.fn(),merchant:vi.fn(),revenue:vi.fn()}));
const stripe=new Stripe("sk_test_signed_fixture");
vi.mock("@/platform/connect",()=>({connectEnabled:()=>true,stripeClient:()=>stripe,ingestConnectEvent:projections.merchant}));
vi.mock("@/platform/connect/revenue",()=>({ingestRevenueEvent:projections.revenue}));
vi.mock("@/platform/agency-billing",()=>({syncAgencyInvoiceFromConnectEvent:projections.agency}));
beforeEach(()=>{
 vi.clearAllMocks();
 projections.agency.mockResolvedValue({ignored:true});
 projections.merchant.mockResolvedValue({ignored:true});
 projections.revenue.mockResolvedValue({ignored:true});
 vi.stubEnv("STRIPE_SECRET_KEY","sk_test_signed_fixture");
 vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET","whsec_signed_fixture");
 vi.stubEnv("STRELVA_BUSINESS_BILLING","1");
});
afterEach(()=>vi.unstubAllEnvs());
async function deliver(options:{live?:boolean;signature?:string}={}) {
 const event={id:"evt_Invoice",object:"event",account:"acct_Merchant",type:"invoice.paid",created:1700000000,livemode:options.live??false,data:{object:{id:"in_Invoice",status:"paid",amount_paid:9000,currency:"usd",customer:"cus_Payer",parent:{subscription_details:{subscription:"sub_Agency"}}}}};
 const payload=JSON.stringify(event);
 const signature=options.signature??stripe.webhooks.generateTestHeaderString({payload,secret:"whsec_signed_fixture"});
 const {POST}=await import("@/app/api/billing/connect/webhook/route");
 return POST(new Request("https://example.test/api/billing/connect/webhook",{method:"POST",headers:{"stripe-signature":signature},body:payload}));
}
describe("independent signed Connect projections",()=>{
 it("persists agency receipt even when merchant and split ingestion ignore the event",async()=>{
  const response=await deliver();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ignored:true});
  expect(projections.agency).toHaveBeenCalledWith(expect.objectContaining({account:"acct_Merchant",id:"evt_Invoice",data:{object:expect.objectContaining({customer:"cus_Payer",amount_paid:9000})}}));
  expect(projections.merchant).toHaveBeenCalledTimes(1);
  expect(projections.revenue).toHaveBeenCalledTimes(1);
 });
 it("verifies real SDK signature before every projection",async()=>{
  expect((await deliver({signature:"invalid"})).status).toBe(400);
  expect(projections.agency).not.toHaveBeenCalled();
  expect(projections.merchant).not.toHaveBeenCalled();
  expect(projections.revenue).not.toHaveBeenCalled();
 });
 it("rejects mode mismatch before any durable projection",async()=>{
  const response=await deliver({live:true});
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ignored:"mode-mismatch"});
  expect(projections.agency).not.toHaveBeenCalled();
  expect(projections.merchant).not.toHaveBeenCalled();
  expect(projections.revenue).not.toHaveBeenCalled();
 });
 it("keeps agency projection behind its independent feature gate",async()=>{
  vi.stubEnv("STRELVA_BUSINESS_BILLING","0");
  expect((await deliver()).status).toBe(200);
  expect(projections.agency).not.toHaveBeenCalled();
  expect(projections.merchant).toHaveBeenCalledTimes(1);
 });
 it("retries receipt failure instead of acknowledging an ignored merchant event",async()=>{
  projections.agency.mockRejectedValueOnce(new Error("storage unavailable"));
  expect((await deliver()).status).toBe(503);
  expect(projections.merchant).not.toHaveBeenCalled();
  expect((await deliver()).status).toBe(200);
  expect(projections.agency).toHaveBeenCalledTimes(2);
  expect(projections.merchant).toHaveBeenCalledTimes(1);
 });
 it("replays the durable agency projection when a later ledger write fails",async()=>{
  projections.revenue.mockRejectedValueOnce(new Error("ledger unavailable"));
  expect((await deliver()).status).toBe(503);
  expect(projections.merchant).not.toHaveBeenCalled();
  expect((await deliver()).status).toBe(200);
  expect(projections.agency).toHaveBeenCalledTimes(2);
  expect(projections.merchant).toHaveBeenCalledTimes(1);
 });
});
