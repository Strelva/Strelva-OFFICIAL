import Stripe from "stripe";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceAccessError, WorkspaceStoreError } from "@/platform/workspaces/types";
export const connectEnabled = () => process.env.STRELVA_CONNECT === "1";
export type RpcDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{data: unknown; error: {message?: string} | null}> };
export const connectDb = () => getSupabase() as unknown as RpcDb | null;
export async function moneyRpc<T>(name: string, args: Record<string, unknown>, db: RpcDb | null = connectDb()): Promise<T> {
 if (!db) throw new WorkspaceStoreError("Money storage is unavailable.");
 const result = await db.rpc(name,args);
 if (result.error) { if (result.error.message?.includes("denied")) throw new WorkspaceAccessError(); throw new WorkspaceStoreError("Money state could not be confirmed."); }
 return result.data as T;
}
export const connectedAccountSchema = z.object({workspace_id:z.string().uuid(),stripe_account_id:z.string().regex(/^acct_[A-Za-z0-9]+$/).nullable(),configurations:z.array(z.enum(["merchant","recipient","customer"])),profile_version:z.string().nullable(),state:z.enum(["pending","ready","restricted","disconnected"]),generation:z.number().int(),capabilities:z.unknown(),requirements:z.unknown()}).passthrough();
export type ConnectedAccount = z.infer<typeof connectedAccountSchema>;
export async function getConnectedMerchant(workspaceId: string, db: RpcDb | null = connectDb()): Promise<ConnectedAccount> {
 if (!connectEnabled()) throw new WorkspaceStoreError("Payments are not enabled.");
 const row = connectedAccountSchema.parse(await moneyRpc("read_connected_account",{p_workspace_id:z.string().uuid().parse(workspaceId)},db));
 if (row.state!=="ready" || !row.stripe_account_id || !row.configurations.includes("merchant")) throw new WorkspaceStoreError("The merchant is not ready to accept payments.");
 return row;
}
export type ConnectProfile = {version:string;feesCollector:"stripe"|"application";lossesCollector:"stripe"|"application"};
export function connectProfile(): ConnectProfile {
 const profile = z.object({version:z.string().min(1),feesCollector:z.enum(["stripe","application"]),lossesCollector:z.enum(["stripe","application"])}).safeParse({version:process.env.STRELVA_CONNECT_PROFILE_VERSION,feesCollector:process.env.STRELVA_CONNECT_FEES_COLLECTOR,lossesCollector:process.env.STRELVA_CONNECT_LOSSES_COLLECTOR});
 if (!profile.success || (profile.data.lossesCollector==="application" && profile.data.feesCollector!=="application")) throw new WorkspaceStoreError("The Connect profile requires an approved liability decision.");
 return profile.data;
}
export function stripeClient() { if (!process.env.STRIPE_SECRET_KEY) throw new WorkspaceStoreError("Payments provider is unavailable."); return new Stripe(process.env.STRIPE_SECRET_KEY); }
export interface ConnectDependencies { db?:RpcDb|null; stripe?:Stripe; beforeProviderMutation?:()=>Promise<void>; checkoutAuthority?:{actor:WorkspaceActor;acceptedEmail:string|null}; payoutAuthority?:{actor:WorkspaceActor;profileVersion:string}; }
export async function manageConnectedAccount(actor:WorkspaceActor,workspaceId:string,action:"read"|"reserve"|"disconnect",db:RpcDb|null=connectDb()) {
 return moneyRpc<ConnectedAccount|null>("manage_connected_account",{p_workspace_id:z.string().uuid().parse(workspaceId),p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_action:action},db);
}
export async function refreshConnectedAccount(workspaceId:string,accountId:string,profileVersion:string,stripe:Stripe,db:RpcDb|null=connectDb()) {
 const account=await stripe.v2.core.accounts.retrieve(accountId,{include:["configuration.merchant","configuration.recipient","configuration.customer","requirements"]});
 const configurations=(Object.keys(account.configuration??{}) as Array<"merchant"|"recipient"|"customer">).filter(key=>account.configuration?.[key]);
 const merchant=account.configuration?.merchant?.capabilities?.card_payments?.status==="active";
 const recipient=account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status==="active";
 return moneyRpc<ConnectedAccount>("record_connected_account",{p_workspace_id:workspaceId,p_account_id:account.id,p_configurations:configurations,p_profile_version:profileVersion,p_capabilities:account.configuration??{},p_requirements:account.requirements??{},p_ready:(!configurations.includes("merchant")||merchant)&&(!configurations.includes("recipient")||recipient)},db);
}
export async function onboardConnectedAccount(actor:WorkspaceActor,input:{workspaceId:string;configurations:Array<"merchant"|"recipient"|"customer">;origin:string},deps:ConnectDependencies={}) {
 if (!connectEnabled()) throw new WorkspaceStoreError("Connect is not enabled.");
 const profile=connectProfile();
 // Onboarding requests the full Dashboard, which Stripe does not support when
 // the platform is responsible for connected-account losses. Check before reserve.
 if (profile.lossesCollector==="application") throw new WorkspaceStoreError("The full Stripe Dashboard requires Stripe responsibility for connected-account losses.");
 const db=deps.db===undefined?connectDb():deps.db;
 const reserved=await manageConnectedAccount(actor,input.workspaceId,"reserve",db);
 if (!reserved || reserved.state==="disconnected") throw new WorkspaceStoreError("The account is disconnected.");
 const stripe=deps.stripe??stripeClient();
 let accountId=reserved.stripe_account_id;
 if (!accountId) {
 const configuration: Stripe.V2.Core.AccountCreateParams.Configuration = {};
 if(input.configurations.includes("merchant")) configuration.merchant={capabilities:{card_payments:{requested:true}}};
 if(input.configurations.includes("recipient")) configuration.recipient={capabilities:{stripe_balance:{stripe_transfers:{requested:true}}}};
 if(input.configurations.includes("customer")) configuration.customer={};
 const account=await stripe.v2.core.accounts.create({contact_email:actor.verifiedEmail,dashboard:"full",metadata:{workspaceId:input.workspaceId},defaults:{responsibilities:{fees_collector:profile.feesCollector,losses_collector:profile.lossesCollector}},configuration},{idempotencyKey:`connect:${input.workspaceId}:${reserved.generation}:${profile.version}`});
 accountId=account.id;
 await refreshConnectedAccount(input.workspaceId,accountId,profile.version,stripe,db);
 }
 let account=await refreshConnectedAccount(input.workspaceId,accountId,profile.version,stripe,db);
 if (!input.configurations.every(c=>account.configurations.includes(c))) {
 if(reserved.profile_version!==profile.version)throw new WorkspaceStoreError("Changing the immutable liability profile is not supported.");
 const configuration:Stripe.V2.Core.AccountUpdateParams.Configuration={};
 if(input.configurations.includes("merchant")&&!account.configurations.includes("merchant"))configuration.merchant={capabilities:{card_payments:{requested:true}}};
 if(input.configurations.includes("recipient")&&!account.configurations.includes("recipient"))configuration.recipient={capabilities:{stripe_balance:{stripe_transfers:{requested:true}}}};
 if(input.configurations.includes("customer")&&!account.configurations.includes("customer"))configuration.customer={};
 await stripe.v2.core.accounts.update(accountId,{configuration},{idempotencyKey:`connect-upgrade:${input.workspaceId}:${reserved.generation}:${profile.version}:${input.configurations.slice().sort().join(",")}`});
 account=await refreshConnectedAccount(input.workspaceId,accountId,profile.version,stripe,db);
 }
 const link=await stripe.v2.core.accountLinks.create({account:accountId,use_case:{type:"account_onboarding",account_onboarding:{configurations:input.configurations,refresh_url:`${input.origin}/workspace/billing?connect=refresh`,return_url:`${input.origin}/workspace/billing?connect=return`}}});
 return {url:link.url,accountId};
}
export interface DirectCheckoutInput {workspaceId:string;idempotencyKey:string;purpose:"checkout"|"deposit"|"quote"|"agent"|"agency_rebill"|"pay_link";amountCents:number;currency:string;successUrl:string;cancelUrl:string;referenceId?:string;}
/** Final new-session admission. Accepted provider observations use their original receipt ports. */
export async function assertBusinessCheckoutAdmission(paymentId:string,merchant:ConnectedAccount,deps:ConnectDependencies={}) {
 const db=deps.db===undefined?connectDb():deps.db;
 const admitted=await moneyRpc("assert_business_checkout_admission",{p_payment_id:paymentId,p_account:merchant.stripe_account_id,p_generation:merchant.generation,p_actor_id:deps.checkoutAuthority?.actor.userId??null,p_verified_email:deps.checkoutAuthority?.actor.verifiedEmail??null,p_accepted_email:deps.checkoutAuthority?.acceptedEmail??null},db);
 if(admitted!==true)throw new WorkspaceStoreError("Current payment authority could not be confirmed.");
}
export async function createDirectCheckout(input:DirectCheckoutInput,deps:ConnectDependencies={}) {
 const db=deps.db===undefined?connectDb():deps.db; const merchant=await getConnectedMerchant(input.workspaceId,db);
 const payment=await moneyRpc<{id:string}>("reserve_business_payment",{p_workspace_id:input.workspaceId,p_key:input.idempotencyKey,p_purpose:input.purpose,p_amount:input.amountCents,p_currency:input.currency,p_reference:input.referenceId??null},db);
 await moneyRpc("claim_business_payment_channel",{p_payment_id:payment.id,p_channel:"checkout"},db);
 const stripe=deps.stripe??stripeClient();
 const prepared=await moneyRpc<{sessionId?:string}>("prepare_business_checkout",{p_payment_id:payment.id},db);
 if(!prepared?.sessionId){await deps.beforeProviderMutation?.();await assertBusinessCheckoutAdmission(payment.id,merchant,{...deps,db});}
 const session=prepared?.sessionId?await stripe.checkout.sessions.retrieve(prepared.sessionId,{stripeAccount:merchant.stripe_account_id!}):await stripe.checkout.sessions.create({mode:"payment",line_items:[{price_data:{currency:input.currency,unit_amount:input.amountCents,product_data:{name:input.purpose==="quote"?"Accepted quote":input.purpose==="deposit"?"Booking deposit":"Business payment"}},quantity:1}],success_url:input.successUrl,cancel_url:input.cancelUrl,metadata:{businessPaymentId:payment.id},payment_intent_data:{application_fee_amount:0,metadata:{businessPaymentId:payment.id}}},{stripeAccount:merchant.stripe_account_id!,idempotencyKey:`payment:${payment.id}`});
 await moneyRpc("record_business_payment_event",{p_account_id:merchant.stripe_account_id,p_event_id:`checkout:${session.id}`,p_object_id:session.id,p_payment_id:payment.id,p_kind:"checkout_created",p_amount:0},db);
 return {paymentId:payment.id,sessionId:session.id,url:session.url};
}
export async function createDirectSubscription(input:{workspaceId:string;idempotencyKey:string;customerId:string;priceId:string;purpose:string;businessWorkspaceId?:string;agencyInvoiceId?:string},deps:ConnectDependencies={}) {
 const merchant=await getConnectedMerchant(input.workspaceId,deps.db===undefined?connectDb():deps.db);
 if (!/^cus_[A-Za-z0-9]+$/.test(input.customerId)||!/^price_[A-Za-z0-9]+$/.test(input.priceId)||input.idempotencyKey.length<8) throw new WorkspaceStoreError("Subscription inputs are invalid.");
 await deps.beforeProviderMutation?.();
 return (deps.stripe??stripeClient()).subscriptions.create({customer:input.customerId,items:[{price:input.priceId}],payment_behavior:"default_incomplete",metadata:{agencyWorkspaceId:input.workspaceId,businessWorkspaceId:input.businessWorkspaceId??"",purpose:input.purpose,...(input.agencyInvoiceId?{agencyInvoiceId:input.agencyInvoiceId}:{})}},{stripeAccount:merchant.stripe_account_id!,idempotencyKey:input.idempotencyKey});
}
/** Trusted callers only: identifiers must come from the signed account-scoped object. No customer-supplied account or payment id. */
export async function ingestConnectEvent(event:Stripe.Event,deps:ConnectDependencies={}) {
 const context = (event as unknown as {context?:string}).context;
 const accountScope=event.account??context;
 if (!accountScope) throw new WorkspaceStoreError("Connect event has no account scope.");
 event={...event,account:accountScope};
 if (event.type==="account.updated" || String(event.type).startsWith("v2.core.account.")) {
 const existing=await moneyRpc<ConnectedAccount|null>("connected_account_by_stripe_id",{p_account_id:accountScope},deps.db===undefined?connectDb():deps.db);
 if(!existing?.stripe_account_id||!existing.profile_version)return {ignored:true};
 await refreshConnectedAccount(existing.workspace_id,existing.stripe_account_id,existing.profile_version,deps.stripe??stripeClient(),deps.db===undefined?connectDb():deps.db);
 return {processed:true};
 }
 if(event.type==="charge.refunded") {
 const charge=event.data.object as Stripe.Charge;
 for await(const refund of (deps.stripe??stripeClient()).refunds.list({charge:charge.id,limit:100},{stripeAccount:accountScope})) {
 if(refund.status==="succeeded")await ingestConnectEvent({...event,id:`refund:${refund.id}`,type:"refund.updated",data:{object:refund}},deps);
 }
 return {processed:true};
 }
 const object=event.data.object as unknown as {id:string;metadata?:Record<string,string>;amount?:number;amount_received?:number;currency?:string;status?:string;payment_intent?:string|null};
 let kind:"paid"|"failed"|"refund"|"dispute"|"dispute_won"|undefined;
 if(event.type==="payment_intent.succeeded") kind="paid";
 if(event.type==="payment_intent.payment_failed") kind="failed";
 if((event.type==="refund.updated"||event.type==="refund.created") && object.status==="succeeded") kind="refund";
 if(event.type==="charge.dispute.funds_withdrawn") kind="dispute";
 if(event.type==="charge.dispute.funds_reinstated") kind="dispute_won";
 if(!kind) return {ignored:true};
 let paymentId=object.metadata?.businessPaymentId;
 if (!paymentId && object.payment_intent) paymentId=(await (deps.stripe??stripeClient()).paymentIntents.retrieve(object.payment_intent,{stripeAccount:event.account})).metadata.businessPaymentId;
 if (!paymentId) return {ignored:true};
 if(kind==="refund"&&object.metadata?.refundRequestId)await moneyRpc("record_business_refund_receipt",{p_request_id:z.string().uuid().parse(object.metadata.refundRequestId),p_refund_id:object.id},deps.db===undefined?connectDb():deps.db);
 if(kind==="paid") {
 const bound=await moneyRpc<{provider_id:string}|null>("read_business_payment_provider",{p_payment_id:paymentId,p_account:accountScope},deps.db===undefined?connectDb():deps.db);
 if(bound&&bound.provider_id!==object.id)throw new WorkspaceStoreError("Payment intent identity does not match.");
 if(!bound && !await moneyRpc<boolean>("recover_agent_payment_provider",{p_payment_id:paymentId,p_account:accountScope,p_provider:object.id,p_amount:object.amount_received??0,p_currency:object.currency??null},deps.db===undefined?connectDb():deps.db)){const sessions=await (deps.stripe??stripeClient()).checkout.sessions.list({payment_intent:object.id,limit:100},{stripeAccount:accountScope});
 const session=sessions.data.find(s=>s.metadata?.businessPaymentId===paymentId);
 if(!session)throw new WorkspaceStoreError("Payment has no matching issued checkout.");
 await moneyRpc("bind_business_payment_provider",{p_payment_id:paymentId,p_account:accountScope,p_provider:object.id,p_currency:object.currency??null,p_checkout:session.id},deps.db===undefined?connectDb():deps.db);}
 }
 const identity=kind==="refund"?`refund:${object.id}`:kind==="paid"?`paid:${object.id}`:kind==="dispute"||kind==="dispute_won"?`dispute:${object.id}:${kind}`:event.id;
 await moneyRpc("record_business_payment_event",{p_account_id:event.account,p_event_id:identity,p_object_id:object.id,p_payment_id:z.string().uuid().parse(paymentId),p_kind:kind,p_amount:kind==="failed"?0:object.amount_received??object.amount??0,p_currency:object.currency??null,p_source_intent:object.payment_intent??null},deps.db===undefined?connectDb():deps.db);
 return {processed:true,hash:createHash("sha256").update(`${event.account}:${event.id}`).digest("hex")};
}
