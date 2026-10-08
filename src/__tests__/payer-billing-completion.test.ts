import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),merchant:vi.fn(),checkout:vi.fn(),subscription:vi.fn(),stripe:vi.fn()}));
vi.mock("@/platform/infra/db/client",()=>({getSupabase:()=>({rpc:mocks.rpc})}));
vi.mock("@/platform/connect",()=>({getConnectedMerchant:mocks.merchant,createDirectCheckout:mocks.checkout,createDirectSubscription:mocks.subscription,stripeClient:mocks.stripe}));
import { commandAgencyInvoice, fulfillAgencyInvoice, syncAgencyInvoiceFromConnectEvent } from "@/platform/agency-billing";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { PLAN_CATALOG, PLANS } from "@/lib/billing-plans";
import { parseOperatorAllowanceCommand } from "@/platform/work-economics/allowances-types";
import { payerChangeItem, allowanceItem } from "@/platform/needs-you/sources/work-money";
const actor={userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",verifiedEmail:"owner@example.test"};
const agency="11111111-1111-4111-8111-111111111111";const business="22222222-2222-4222-8222-222222222222";const id="33333333-3333-4333-8333-333333333333";
const invoice={id,agency_workspace_id:agency,business_workspace_id:business,kind:"pay_link",amount_cents:14900,currency:"usd",description:"Quoted build",status:"accepted",accepted_email:"owner@example.test",provider_account_id:null,provider_object_id:null,checkout_url:null};
describe("party billing completion",()=>{
 beforeEach(()=>vi.clearAllMocks());
 it("keeps new retail/wholesale unpriced and preserves live tier prices",()=>{expect(PLAN_CATALOG).toHaveLength(4);for(const plan of PLAN_CATALOG){expect(plan.retail).toEqual({priceId:null,monthlyCents:null,purchasable:false});expect(plan.wholesale).toEqual(plan.retail);}expect(PLANS.map(p=>p.monthly)).toEqual([99,199,499]);});
 it("accepts only paired agency party allowance terms",()=>{
  const command={action:"award_period",workspaceId:business,payerId:actor.userId,payerKind:"agency",payerWorkspaceId:agency,periodStart:"2026-10-01T00:00:00Z",periodEnd:"2026-11-01T00:00:00Z",spendingCapCents:1000,grants:[{unitKind:"completed_tracker_change",units:10}],idempotencyKey:"agency-allowance"};
  expect(parseOperatorAllowanceCommand(command)).toMatchObject({payerKind:"agency",payerWorkspaceId:agency});expect(()=>parseOperatorAllowanceCommand({...command,payerWorkspaceId:undefined})).toThrow();expect(()=>parseOperatorAllowanceCommand({...command,payerKind:"business"})).toThrow();
 });
 it("party representatives get decision items without matching the historical signer",()=>{
  expect(payerChangeItem({id,workspaceId:business,successorUserId:"",successorKind:"agency",successorWorkspaceId:agency,canRespond:true,status:"pending",proposerEmail:actor.verifiedEmail},actor)).not.toBeNull();
  expect(allowanceItem({id,workspaceId:business,payerId:agency,payerKind:"agency",payerWorkspaceId:agency,canAccept:true,status:"pending_cap_acceptance",spendingCapCents:1000,periodStart:"2026-10-01",periodEnd:"2026-11-01"},actor)).not.toBeNull();
 });
 it("maps current authority denial and immutable-term conflicts",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:null,error:{message:"agency_invoice_denied"}});await expect(commandAgencyInvoice(actor,{action:"accept",intentId:id})).rejects.toBeInstanceOf(WorkspaceAccessError);
  mocks.rpc.mockResolvedValueOnce({data:null,error:{message:"agency_invoice_conflict"}});await expect(commandAgencyInvoice(actor,{action:"accept",intentId:id})).rejects.toBeInstanceOf(WorkspaceConflictError);
 });
 it("persists scope receipt and exact accepted amount through the connected merchant adapter",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:invoice,error:null}).mockResolvedValueOnce({data:{...invoice,status:"awaiting_payment",provider_account_id:"acct_agency",provider_object_id:"cs_checkout",checkout_url:"https://checkout.stripe.com/c/pay/fixture"},error:null});mocks.merchant.mockResolvedValue({stripe_account_id:"acct_agency"});mocks.checkout.mockResolvedValue({sessionId:"cs_checkout",url:"https://checkout.stripe.com/c/pay/fixture"});
  await expect(fulfillAgencyInvoice(actor,id,"http://localhost:3017")).resolves.toMatchObject({status:"awaiting_payment"});expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({workspaceId:agency,amountCents:14900,currency:"usd",referenceId:id,purpose:"pay_link"}),{});expect(mocks.rpc).toHaveBeenLastCalledWith("record_agency_billing_checkout",expect.objectContaining({p_account_id:"acct_agency",p_object_id:"cs_checkout",p_intent_id:id}));
 });
 it("never calls a provider after acceptance/authority failure or unknown merchant state",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:null,error:{message:"agency_invoice_denied"}});await expect(fulfillAgencyInvoice(actor,id,"http://localhost:3017")).rejects.toBeInstanceOf(WorkspaceAccessError);expect(mocks.checkout).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValueOnce({data:invoice,error:null});mocks.merchant.mockRejectedValueOnce(new WorkspaceStoreError("Merchant not ready"));await expect(fulfillAgencyInvoice(actor,id,"http://localhost:3017")).rejects.toThrow("Merchant not ready");expect(mocks.checkout).not.toHaveBeenCalled();
 });
 it("known provider receipts prevent a second external creation even without read-back URL",async()=>{mocks.rpc.mockResolvedValueOnce({data:{...invoice,provider_object_id:"cs_known",checkout_url:null},error:null});await fulfillAgencyInvoice(actor,id,"http://localhost:3017");expect(mocks.checkout).not.toHaveBeenCalled();expect(mocks.merchant).not.toHaveBeenCalled();});
 it("records a created subscription before a failed provider read-back",async()=>{
  const created={...invoice,kind:"rebill",provider_account_id:"acct_agency",provider_object_id:"sub_created",status:"awaiting_payment"};
  mocks.rpc.mockResolvedValueOnce({data:{...invoice,kind:"rebill"},error:null}).mockResolvedValueOnce({data:{...invoice,kind:"rebill",provider_customer_id:"cus_client",provider_price_id:"price_retail"},error:null}).mockResolvedValueOnce({data:created,error:null});mocks.merchant.mockResolvedValue({stripe_account_id:"acct_agency"});
  const stripe={customers:{create:vi.fn().mockResolvedValue({id:"cus_client"})},prices:{create:vi.fn().mockResolvedValue({id:"price_retail"})},invoices:{retrieve:vi.fn().mockRejectedValue(new Error("readback unavailable"))}};
  mocks.subscription.mockResolvedValue({id:"sub_created",latest_invoice:"in_1"});mocks.stripe.mockReturnValue(stripe);
  await expect(fulfillAgencyInvoice(actor,id,"http://localhost:3017")).resolves.toMatchObject({provider_object_id:"sub_created",status:"awaiting_payment",checkout_url:null});
  expect(stripe.customers.create).toHaveBeenCalledWith(expect.objectContaining({email:invoice.accepted_email}),expect.objectContaining({stripeAccount:"acct_agency",idempotencyKey:`agency-invoice:${id}:customer`}));
  expect(stripe.prices.create).toHaveBeenCalledWith(expect.objectContaining({unit_amount:14900,recurring:{interval:"month"}}),expect.objectContaining({stripeAccount:"acct_agency"}));
  expect(mocks.subscription).toHaveBeenCalledWith(expect.objectContaining({workspaceId:agency,customerId:"cus_client",priceId:"price_retail",businessWorkspaceId:business,purpose:"agency_rebill"}),{stripe});
  expect(mocks.rpc).toHaveBeenNthCalledWith(2,"record_agency_billing_terms",{p_intent_id:id,p_account_id:"acct_agency",p_customer_id:"cus_client",p_price_id:"price_retail"});
 });
 it("records signed account scope and subscription id from current invoice parent",async()=>{
  mocks.rpc.mockResolvedValue({data:{applied:true},error:null});const event={id:"evt_1",created:1,type:"invoice.paid",account:"acct_agency",data:{object:{id:"in_1",amount_paid:14900,currency:"usd",customer:"cus_client",lines:{data:[{quantity:1,pricing:{price_details:{price:"price_retail"}}}]},parent:{subscription_details:{subscription:"sub_1"}},metadata:{amountCents:"1",currency:"cad",agencyInvoiceId:id}}}};await syncAgencyInvoiceFromConnectEvent(event as unknown as import("stripe").default.Event);expect(mocks.rpc).toHaveBeenCalledWith("record_agency_billing_provider_event",{p_account_id:"acct_agency",p_event_id:"evt_1",p_object_id:"sub_1",p_created:1,p_status:"active",p_evidence:{kind:"invoice",source_id:"in_1",customer_id:"cus_client",price_id:"price_retail",quantity:1,amount_cents:14900,currency:"usd"}});
 });
 it("keeps checkout totals/currency as signed observed evidence and ignores metadata pricing",async()=>{
  mocks.rpc.mockResolvedValue({data:{review:true},error:null});
  const event={id:"evt_checkout",created:2,type:"checkout.session.completed",account:"acct_agency",data:{object:{id:"cs_checkout",payment_status:"paid",amount_total:5,currency:"cad",metadata:{amountCents:"14900",currency:"usd"}}}};
  await expect(syncAgencyInvoiceFromConnectEvent(event as unknown as import("stripe").default.Event)).resolves.toEqual({review:true});
  expect(mocks.rpc).toHaveBeenLastCalledWith("record_agency_billing_provider_event",expect.objectContaining({p_evidence:{kind:"checkout",amount_cents:5,currency:"cad",customer_id:null}}));
 });
 it("passes missing/multiple subscription items as incomplete evidence for review",async()=>{
  mocks.rpc.mockResolvedValue({data:{review:true},error:null});
  const item={quantity:1,price:{id:"price_retail",unit_amount:14900,currency:"usd",recurring:{interval:"month",interval_count:1}}};
  for(const items of [[],[item,item]]){
   const event={id:"evt_subscription",created:3,type:"customer.subscription.updated",account:"acct_agency",data:{object:{id:"sub_created",customer:"cus_client",status:"active",items:{data:items}}}};
   await syncAgencyInvoiceFromConnectEvent(event as unknown as import("stripe").default.Event);
   expect(mocks.rpc).toHaveBeenLastCalledWith("record_agency_billing_provider_event",expect.objectContaining({p_evidence:expect.objectContaining({kind:"subscription",price_id:null,unit_amount:null,quantity:null})}));
  }
 });
 it("does not create a subscription if its durable customer/Price binding is refused",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:{...invoice,kind:"rebill"},error:null}).mockResolvedValueOnce({data:null,error:{message:"agency_invoice_conflict"}});mocks.merchant.mockResolvedValue({stripe_account_id:"acct_agency"});
  mocks.stripe.mockReturnValue({customers:{create:vi.fn().mockResolvedValue({id:"cus_client"})},prices:{create:vi.fn().mockResolvedValue({id:"price_retail"})}});
  await expect(fulfillAgencyInvoice(actor,id,"http://localhost:3017")).rejects.toBeInstanceOf(WorkspaceConflictError);
  expect(mocks.subscription).not.toHaveBeenCalled();
 });
});
