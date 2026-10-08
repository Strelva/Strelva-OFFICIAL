import {connectDb,moneyRpc,stripeClient,type ConnectDependencies} from "./index";
import {readPlatformSettlement} from "./settlement";
import {WorkspaceStoreError} from "@/platform/workspaces/types";
/** This consumes a separately authorized recovery generation, never the original payout key. */
export async function executeApprovedRecovery(recoveryId:string,deps:ConnectDependencies={}){
 if(process.env.STRELVA_SPLIT_PAYOUT_EXECUTION!=="1")throw new WorkspaceStoreError("Payout execution is not enabled.");
 const db=deps.db===undefined?connectDb():deps.db;const p=await moneyRpc<{id:string;recipient_account_id:string;source_account_id:string;source_transaction:string;amount_cents:number;currency:string;transfer_id?:string}>("prepare_split_recovery",{p_recovery:recoveryId},db);
 if(p.source_account_id!=="platform")throw new WorkspaceStoreError("Recovery requires platform-owned source funds.");
 const stripe=deps.stripe??stripeClient();if(!p.transfer_id){const source=await readPlatformSettlement(stripe,db,p.source_transaction,{currency:p.currency});if(!source.settled)throw new WorkspaceStoreError("Source funds are not settled.");await moneyRpc("assert_recovery_settlement",{p_recovery:p.id,p_available:source.availableCents,p_currency:source.currency},db);}
 const transfer=p.transfer_id?await stripe.transfers.retrieve(p.transfer_id):await stripe.transfers.create({amount:p.amount_cents,currency:p.currency,destination:p.recipient_account_id,source_transaction:p.source_transaction,metadata:{splitRecoveryId:p.id}},{idempotencyKey:`split-recovery:${p.id}`});
 if((p.transfer_id&&transfer.id!==p.transfer_id)||(typeof transfer.destination==="string"?transfer.destination:transfer.destination?.id)!==p.recipient_account_id||transfer.source_transaction!==p.source_transaction)throw new WorkspaceStoreError("The transfer does not match its authorized source and recipient.");
 await moneyRpc("record_split_recovery",{p_recovery:p.id,p_transfer:transfer.id,p_amount:transfer.amount,p_currency:transfer.currency},db);return {transferId:transfer.id};
}
export async function reverseRecovery(recoveryId:string,lossId:string,deps:ConnectDependencies={}){
 if(process.env.STRELVA_SPLIT_PAYOUT_EXECUTION!=="1")throw new WorkspaceStoreError("Payout execution is not enabled.");
 const db=deps.db===undefined?connectDb():deps.db;const r=await moneyRpc<{id:string;transfer_id:string;amount_cents:number;provider_reversal_id?:string}>("prepare_recovery_reversal",{p_recovery:recoveryId,p_loss:lossId},db);const stripe=deps.stripe??stripeClient();
 const reversal=r.provider_reversal_id?await stripe.transfers.retrieveReversal(r.transfer_id,r.provider_reversal_id):await stripe.transfers.createReversal(r.transfer_id,{amount:r.amount_cents,metadata:{splitRecoveryReversalId:r.id}},{idempotencyKey:`split-recovery-reversal:${r.id}`});
 if((typeof reversal.transfer==="string"?reversal.transfer:reversal.transfer.id)!==r.transfer_id)throw new WorkspaceStoreError("The reversal does not match the original transfer.");
 await moneyRpc("record_recovery_reversal",{p_id:r.id,p_provider:reversal.id,p_amount:reversal.amount},db);return {reversalId:reversal.id};
}
