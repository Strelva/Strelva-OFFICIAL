import {formatMoney} from "@/platform/connect/money-format";
import {connectEnabled,moneyRpc} from "@/platform/connect";
import type {SourceAdapter,AdapterContext} from "../adapters";
import {revisionOf,proposeAsMember,unchangedOutcome} from "./shared";
interface FollowUp {id:string;kind:string;issuedAt:string;amountCents:number;currency:string;status:string;refundRequired:boolean;}
async function list(ctx:AdapterContext):Promise<FollowUp[]>{if(!connectEnabled()||!ctx.actor)return [];return moneyRpc("read_payment_follow_ups",{p_workspace_id:ctx.workspaceId,p_user_id:ctx.actor.userId,p_verified_email:ctx.actor.verifiedEmail});}
export function businessPaymentAdapter():SourceAdapter{return {lifecycle:"business_payment",needsMemberActor:true,trustedRecipientOnly:true,
 propose:ctx=>proposeAsMember(ctx,async actor=>(await list({...ctx,actor})).map(q=>({kind:"money",route:"owner_decides",title:q.refundRequired?"A customer payment needs refund review":"A customer quote is awaiting payment",detail:`${formatMoney(q.amountCents,q.currency)} · ${q.status}`,approveEffect:"Mark your payment follow-up as reviewed. This does not charge or refund money.",notYetEffect:"The request stays available for follow-up.",sourceLifecycle:"business_payment",sourceId:q.id,revisionHash:revisionOf(q),urgent:false,adminMayDecide:false,openHref:`/workspace/payments?workspaceId=${ctx.workspaceId}`,openedAt:q.issuedAt}))),
 currentRevision:async(ctx,id)=>{const q=(await list(ctx)).find(q=>q.id===id);return q?revisionOf(q):null;},
 async resolve(ctx,item,decision,by){const unchanged=unchangedOutcome(decision,by);if(unchanged)return unchanged;if(by.kind!=="session")return {outcome:"failed",reason:"Sign in as the business owner."};await moneyRpc("acknowledge_payment_follow_up",{p_workspace_id:ctx.workspaceId,p_user_id:by.actor.userId,p_verified_email:by.actor.verifiedEmail,p_request_id:item.sourceId});return {outcome:"done",receiptRef:`payment_follow_up:${item.sourceId}`};}
};}
