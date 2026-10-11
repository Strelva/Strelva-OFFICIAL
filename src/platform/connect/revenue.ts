import {createHash} from "node:crypto";
import type Stripe from "stripe";
import {connectDb,moneyRpc,stripeClient,type ConnectDependencies} from "./index";
import {stripeBillingContext} from "@/platform/business-billing";
const providerId=(reference:string|{id:string}|null|undefined)=>typeof reference==="string"?reference:reference?.id??null;
/** Only signed webhook callers. Net paid invoice line amounts exclude tax; a
 * missing/ambiguous card charge remains unreconciled rather than inventing a source. */
export async function ingestRevenueEvent(event:Stripe.Event,deps:ConnectDependencies={}) {
 if(process.env.STRELVA_REVENUE_SPLITS!=="1")return {ignored:true};
 const stripe=deps.stripe??stripeClient();const db=deps.db===undefined?connectDb():deps.db;const source=event.account??"platform";const options=event.account?{stripeAccount:event.account}:undefined;
 const pending=async(reason:string)=>{await moneyRpc("record_money_reconciliation_issue",{p_account:source,p_event:event.id,p_type:event.type,p_reason:reason,p_object:(event.data.object as {id?:string}).id??null},db);return {unreconciled:true,reason};};
 if(event.type==="payment_intent.succeeded"&&!event.account) {
 const pi=event.data.object as Stripe.PaymentIntent;const collectionId=pi.metadata.platformCollectionId;
 if(!collectionId)return {ignored:true};
 const chargeId=typeof pi.latest_charge==="string"?pi.latest_charge:pi.latest_charge?.id;
 if(!chargeId)return pending("settlement_charge_required");
 const charge=await stripe.charges.retrieve(chargeId);
 if(charge.id!==chargeId||providerId(charge.payment_intent)!==pi.id||providerId(charge.customer)!==providerId(pi.customer)||charge.livemode!==event.livemode||!charge.paid||!charge.captured||charge.amount!==pi.amount_received||charge.currency!==pi.currency)return pending("collection_charge_mismatch");
 await moneyRpc("record_neutral_version_settlement",{p_id:collectionId,p_intent:pi.id,p_charge:chargeId,p_amount:pi.amount_received,p_currency:pi.currency,p_customer:typeof pi.customer==="string"?pi.customer:pi.customer?.id,p_event:event.id},db);
 // Record the accepted settlement first. Generic creator observation is a
 // separately recoverable ledger write; it never dispatches a provider effect.
 await moneyRpc("observe_neutral_creator_settlement",{p_collection_id:collectionId},db);return {processed:true};
 }
 if(event.type==="invoice.paid") {
 const invoice=event.data.object as Stripe.Invoice;
 if(invoice.status!=="paid"||invoice.amount_paid<=0)return {ignored:true};
 const context=stripeBillingContext(invoice);
 const tenantId=invoice.metadata?.tenantId??invoice.parent?.subscription_details?.metadata?.tenantId??null;
 const resolved=await moneyRpc<{workspaceId?:string}|null>("resolve_billing_workspace",{p_workspace_id:context.workspaceId,p_tenant_id:tenantId},db);
 if(!resolved?.workspaceId)return {ignored:true};
 const customer=typeof invoice.customer==="string"?invoice.customer:invoice.customer?.id;
 const subscription=invoice.parent?.subscription_details?.subscription;
 if(!await moneyRpc<boolean>("verify_invoice_split_source",{p_business:resolved.workspaceId,p_account:source,p_customer:customer??null,p_subscription:typeof subscription==="string"?subscription:subscription?.id??null},db))return pending("invoice_source_ownership_required");
 const payments=[];
 for await(const p of stripe.invoicePayments.list({invoice:invoice.id,status:"paid",limit:100},options))payments.push(p);
 if(payments.length!==1||payments[0]!.amount_paid!==invoice.amount_paid||providerId(payments[0]!.invoice)!==invoice.id||payments[0]!.currency!==invoice.currency||payments[0]!.status!=="paid"||payments[0]!.livemode!==event.livemode)return pending("single_card_source_required");
 const payment=payments[0]!.payment;let expectedIntent:string|null=null;let chargeId=typeof payment.charge==="string"?payment.charge:payment.charge?.id;
 if(payment.payment_intent){const pi=typeof payment.payment_intent==="string"?await stripe.paymentIntents.retrieve(payment.payment_intent,options):payment.payment_intent;expectedIntent=pi.id;if(providerId(pi.customer)!==customer||pi.currency!==invoice.currency||pi.livemode!==event.livemode)return pending("invoice_payment_intent_mismatch");chargeId=typeof pi.latest_charge==="string"?pi.latest_charge:pi.latest_charge?.id;}
 if(!chargeId)return pending("settlement_charge_required");
 const charge=await stripe.charges.retrieve(chargeId,options);
 if(charge.id!==chargeId||providerId(charge.customer)!==customer||(expectedIntent!==null&&providerId(charge.payment_intent)!==expectedIntent)||charge.livemode!==event.livemode||!charge.paid||!charge.captured||charge.currency!==invoice.currency||charge.amount<invoice.amount_paid)return pending("charge_does_not_cover_invoice");
 const lines=[];for await(const line of stripe.invoices.listLineItems(invoice.id,{limit:100},options))lines.push(line);
 if(lines.reduce((sum,line)=>sum+Math.max(0,line.amount-(line.discount_amounts??[]).reduce((d,a)=>d+a.amount,0)),0)>invoice.amount_paid)return pending("paid_line_basis_exceeds_card_payment");
 if(lines.some(l=>l.amount<0))return pending("credit_line_allocation_requires_policy");
 for(const line of lines){const basis=Math.max(0,line.amount-(line.discount_amounts??[]).reduce((sum,d)=>sum+d.amount,0));const installationId=line.metadata?.installationId??null;
 const item=line.parent?.subscription_item_details?.subscription_item;
 const business=await moneyRpc<string|null>("resolve_invoice_business_line",{p_payer_workspace:resolved.workspaceId,p_subscription:typeof subscription==="string"?subscription:subscription?.id??null,p_item:item??null,p_basis:basis,p_currency:invoice.currency},db);
 if(!business)return pending("approved_invoice_business_line_required");
 await moneyRpc("record_invoice_split_source",{p_account:source,p_line:line.id,p_charge:chargeId,p_business:business,p_payer:event.account?business:resolved.workspaceId,p_customer:customer??null,p_subscription:typeof subscription==="string"?subscription:subscription?.id??null,p_item:item??null,p_basis:basis,p_currency:invoice.currency,p_start:new Date(line.period.start*1000).toISOString(),p_end:new Date(line.period.end*1000).toISOString()},db);
 await moneyRpc("accrue_invoice_splits",{p_business_id:business,p_line_id:line.id,p_period_start:new Date(line.period.start*1000).toISOString(),p_period_end:new Date(line.period.end*1000).toISOString(),p_source_account:source,p_charge_id:chargeId,p_basis:basis,p_currency:invoice.currency,p_installation_id:installationId,p_source_revision_id:null},db);await moneyRpc("record_invoice_money_evidence",{p_account:source,p_event:event.id,p_invoice:invoice.id,p_line:line.id},db);}
 return {processed:true};
 }
 if(event.type==="charge.refunded"||event.type==="charge.dispute.funds_withdrawn"||event.type==="charge.dispute.funds_reinstated") {
 const object=event.data.object as Stripe.Charge|Stripe.Dispute;const chargeId="charge" in object?(typeof object.charge==="string"?object.charge:object.charge.id):object.id;
 const generation=await moneyRpc<number>("acquire_split_reconciliation",{p_account:source,p_charge:chargeId},db);
 const charge=await stripe.charges.retrieve(chargeId,options);let disputed=0;
 for await(const d of stripe.disputes.list({charge:chargeId,limit:100},options))if(d.status!=="won"&&d.status!=="warning_closed")disputed+=d.amount;
 await moneyRpc("finish_split_reconciliation",{p_account:source,p_charge:chargeId,p_generation:generation,p_snapshot:`${event.id}:${createHash("sha256").update(`${charge.amount}:${charge.amount_refunded}:${disputed}`).digest("hex")}`,p_loss:Math.min(charge.amount,charge.amount_refunded+disputed),p_basis:charge.amount},db);return {processed:true};
 }
 return {ignored:true};
}
