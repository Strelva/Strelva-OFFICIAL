import {createHash,createHmac} from "node:crypto";
import type {WorkspaceActor} from "@/platform/workspaces/types";
import {WorkspaceStoreError} from "@/platform/workspaces/types";
import {connectEnabled,moneyRpc,connectDb,type RpcDb} from "./index";
export async function createPaymentRequestFromAgentQuote(actor:WorkspaceActor,input:{workspaceId:string;quoteReceiptId:string;idempotencyKey:string;expiresAt:string;origin:string},db:RpcDb|null=connectDb()) {
 if(!connectEnabled())throw new WorkspaceStoreError("Payments are not enabled.");
 const secret=process.env.STRELVA_PAYMENT_LINK_SECRET;if(!secret||secret.length<32)throw new WorkspaceStoreError("Payment links are not configured.");
 const token=createHmac("sha256",secret).update(`${input.workspaceId}:${input.idempotencyKey}`).digest("hex");
 const request=await moneyRpc("issue_payment_from_agent_quote",{p_workspace_id:input.workspaceId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_quote_receipt_id:input.quoteReceiptId,p_expires:input.expiresAt,p_hash:createHash("sha256").update(token).digest("hex"),p_key:input.idempotencyKey},db);
 return {request,paymentUrl:`${input.origin}/pay/business?token=${token}`};
}
