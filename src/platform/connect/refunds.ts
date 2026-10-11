import type {WorkspaceActor} from "@/platform/workspaces/types";
import {WorkspaceStoreError} from "@/platform/workspaces/types";
import {connectEnabled,connectDb,moneyRpc,stripeClient,type ConnectDependencies} from "./index";
export async function createDirectRefund(actor:WorkspaceActor,input:{workspaceId:string;paymentId:string;amountCents:number;idempotencyKey:string},deps:ConnectDependencies={}) {
 if(!connectEnabled())throw new WorkspaceStoreError("Refunds are not enabled.");
 const db=deps.db===undefined?connectDb():deps.db;
 const reservation=await moneyRpc<{id:string;merchant_account_id:string;payment_intent_id:string;amount_cents:number}>("reserve_business_refund",{p_workspace_id:input.workspaceId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_payment_id:input.paymentId,p_amount:input.amountCents,p_key:input.idempotencyKey},db);
 const refund=await (deps.stripe??stripeClient()).refunds.create({payment_intent:reservation.payment_intent_id,amount:reservation.amount_cents,refund_application_fee:true,metadata:{businessPaymentId:input.paymentId,refundRequestId:reservation.id}},{stripeAccount:reservation.merchant_account_id,idempotencyKey:`refund:${reservation.id}`});
 await moneyRpc("record_business_refund_receipt",{p_request_id:reservation.id,p_refund_id:refund.id},db);
 await moneyRpc("record_business_payment_event",{p_account_id:reservation.merchant_account_id,p_event_id:`refund-created:${refund.id}`,p_object_id:refund.id,p_payment_id:input.paymentId,p_kind:"refund_created",p_amount:0},db);
 return {refundId:refund.id,status:refund.status};
}
