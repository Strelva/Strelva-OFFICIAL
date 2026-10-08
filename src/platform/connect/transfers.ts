import {connectDb,moneyRpc,stripeClient,type ConnectDependencies} from "./index";
import {readPlatformSettlement} from "./settlement";
import {WorkspaceStoreError} from "@/platform/workspaces/types";
/** Prepared platform-source rail. Cron only calls the dry-run planner. A flag
 * cannot execute a transfer without a separately recorded operator approval. */
export async function executeApprovedPayout(payoutId:string,deps:ConnectDependencies={}){
 if(process.env.STRELVA_SPLIT_PAYOUT_EXECUTION!=="1")throw new WorkspaceStoreError("Payout execution is not enabled.");
 const db=deps.db===undefined?connectDb():deps.db;
 const p=await moneyRpc<{id:string;recipient_account_id:string;source_account_id:string;source_transaction:string;amount_cents:number;currency:string;transfer_id?:string}>("prepare_approved_split_transfer",{p_payout_id:payoutId},db);
 if(p.source_account_id!=="platform")throw new WorkspaceStoreError("This source belongs to the merchant.");
 const stripe=deps.stripe??stripeClient();
 if(!p.transfer_id){const source=await readPlatformSettlement(stripe,db,p.source_transaction);if(!source.settled)throw new WorkspaceStoreError("Source funds are not settled.");await moneyRpc("assert_split_transfer_settlement",{p_payout_id:p.id,p_available:source.availableCents,p_currency:source.currency},db);}
 const transfer=p.transfer_id?await stripe.transfers.retrieve(p.transfer_id):await stripe.transfers.create({amount:p.amount_cents,currency:p.currency,destination:p.recipient_account_id,source_transaction:p.source_transaction,metadata:{splitPayoutId:p.id}},{idempotencyKey:`split-payout:${p.id}`});
 await moneyRpc("record_split_transfer",{p_payout_id:p.id,p_transfer_id:transfer.id,p_amount:transfer.amount,p_currency:transfer.currency},db);return {transferId:transfer.id};
}
export async function reverseApprovedPayout(payoutId:string,lossEvent:string,deps:ConnectDependencies={}) {
 if(process.env.STRELVA_SPLIT_PAYOUT_EXECUTION!=="1")throw new WorkspaceStoreError("Payout execution is not enabled.");
 const db=deps.db===undefined?connectDb():deps.db;
 const r=await moneyRpc<{id:string;transfer_id:string;amount_cents:number;reversal_id?:string}>("prepare_split_transfer_reversal",{p_payout_id:payoutId,p_loss_event:lossEvent},db);
 const stripe=deps.stripe??stripeClient();const reversal=r.reversal_id?await stripe.transfers.retrieveReversal(r.transfer_id,r.reversal_id):await stripe.transfers.createReversal(r.transfer_id,{amount:r.amount_cents,metadata:{splitReversalId:r.id}},{idempotencyKey:`split-reversal:${r.id}`});
 await moneyRpc("record_split_transfer_reversal",{p_id:r.id,p_reversal_id:reversal.id,p_amount:reversal.amount},db);return {reversalId:reversal.id};
}
