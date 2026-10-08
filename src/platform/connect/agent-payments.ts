import {createHash} from "node:crypto";
import {z} from "zod";
import {WorkspaceStoreError} from "@/platform/workspaces/types";
import {connectDb,getConnectedMerchant,moneyRpc,type RpcDb} from "./index";
export const agentPaymentInputSchema=z.object({paymentCapability:z.string().regex(/^[a-f0-9]{64}$/),sharedPaymentToken:z.string().min(8).max(1000)}).strict();
/** Supported seller protocol is selected only by server-owned account qualification. */
export interface AgentPaymentResult {id:string;status:"succeeded"|"requires_action"|"processing"|"failed";amountReceived:number;currency:string;merchantAccountId:string}
export interface AgentPaymentIdentity {merchantAccountId:string;paymentId:string;amountCents:number;currency:string}
export interface AgentPaymentProvider {
 chargeWithSharedPaymentToken(input:AgentPaymentIdentity & {sharedPaymentToken:string;idempotencyKey:string}):Promise<AgentPaymentResult>;
 retrievePayment?(input:AgentPaymentIdentity & {providerObjectId:string}):Promise<AgentPaymentResult>;
}
export async function requestAgentPayment(scope:{workspaceId:string},raw:unknown,deps:{db?:RpcDb|null;provider?:AgentPaymentProvider;previewApproved?:boolean}={}) {
 if(process.env.STRELVA_AGENT_PAYMENTS!=="1"||!deps.previewApproved||!deps.provider)return {status:"unavailable",reason:"seller_preview_and_approved_provider_required"};
 const input=agentPaymentInputSchema.parse(raw);const db=deps.db===undefined?connectDb():deps.db;
 const merchant=await getConnectedMerchant(scope.workspaceId,db);
 const request=await moneyRpc<{paymentId:string;amountCents:number;currency:string;status:string}>("reserve_agent_payment_request",{p_workspace_id:scope.workspaceId,p_hash:createHash("sha256").update(input.paymentCapability).digest("hex")},db);
 if(request.status==="paid")return {status:"paid",paymentId:request.paymentId};
 await moneyRpc("claim_business_payment_channel",{p_payment_id:request.paymentId,p_channel:"agent"},db);
 const attempt=await moneyRpc<{providerObjectId?:string}|null>("prepare_agent_payment_attempt",{p_payment_id:request.paymentId,p_account:merchant.stripe_account_id},db);
 const identity={merchantAccountId:merchant.stripe_account_id!,paymentId:request.paymentId,amountCents:request.amountCents,currency:request.currency};
 if(attempt?.providerObjectId&&!deps.provider.retrievePayment)throw new WorkspaceStoreError("The payment requires provider readback before retry.");
 const charge=attempt?.providerObjectId
  ?await deps.provider.retrievePayment!({...identity,providerObjectId:attempt.providerObjectId})
  :await deps.provider.chargeWithSharedPaymentToken({...identity,sharedPaymentToken:input.sharedPaymentToken,idempotencyKey:`payment:${request.paymentId}`});
 if(!/^pi_[A-Za-z0-9]+$/.test(charge.id)||charge.currency.toLowerCase()!==request.currency||charge.merchantAccountId!==merchant.stripe_account_id||(charge.status==="succeeded"&&charge.amountReceived!==request.amountCents))throw new WorkspaceStoreError("The provider payment does not match the accepted request.");
 await moneyRpc("bind_business_payment_provider",{p_payment_id:request.paymentId,p_account:merchant.stripe_account_id,p_provider:charge.id,p_currency:charge.currency.toLowerCase(),p_checkout:null},db);
 if(charge.status==="succeeded")await moneyRpc("record_business_payment_event",{p_account_id:merchant.stripe_account_id,p_event_id:`paid:${charge.id}`,p_object_id:charge.id,p_payment_id:request.paymentId,p_kind:"paid",p_amount:charge.amountReceived,p_currency:charge.currency.toLowerCase()},db);
 return {status:charge.status,paymentId:request.paymentId,providerObjectId:charge.id};
}
