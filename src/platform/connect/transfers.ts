import {connectDb,moneyRpc,stripeClient,type ConnectDependencies} from "./index";
import {readPlatformSettlement} from "./settlement";
import {WorkspaceStoreError} from "@/platform/workspaces/types";
import {z} from "zod";
const payoutSchema=z.object({id:z.uuid(),recipient_account_id:z.string().regex(/^acct_[A-Za-z0-9]+$/),source_account_id:z.literal("platform"),source_transaction:z.string().regex(/^ch_[A-Za-z0-9]+$/),amount_cents:z.number().int().positive().max(100000000),currency:z.string().regex(/^[a-z]{3}$/),transfer_id:z.string().regex(/^tr_[A-Za-z0-9]+$/).nullable().optional()}).passthrough();
/** Prepared platform-source rail. Cron only calls the dry-run planner. A flag
 * cannot execute a transfer without a separately recorded operator approval. */
export async function executeApprovedPayout(payoutId:string,deps:ConnectDependencies={}){
 if(process.env.STRELVA_SPLIT_PAYOUT_EXECUTION!=="1")throw new WorkspaceStoreError("Payout execution is not enabled.");
 const db=deps.db===undefined?connectDb():deps.db;
 let p=payoutSchema.parse(await moneyRpc("prepare_approved_split_transfer",{p_payout_id:payoutId},db));
 if(p.id!==payoutId)throw new WorkspaceStoreError("Payout reservation identity changed.");
 if(p.source_account_id!=="platform")throw new WorkspaceStoreError("This source belongs to the merchant.");
 const stripe=deps.stripe??stripeClient();
 if(!p.transfer_id){
  if(!deps.payoutAuthority)throw new WorkspaceStoreError("A current operator and approved profile are required before a new transfer.");
  const source=await readPlatformSettlement(stripe,db,p.source_transaction,{currency:p.currency});if(!source.settled)throw new WorkspaceStoreError("Source funds are not settled.");
  await moneyRpc("assert_split_transfer_settlement",{p_payout_id:p.id,p_available:source.availableCents,p_currency:source.currency},db);
  await deps.beforeProviderMutation?.();
  const current=payoutSchema.parse(await moneyRpc("assert_governed_payout_dispatch",{p_payout_id:p.id,p_user_id:deps.payoutAuthority.actor.userId,p_verified_email:deps.payoutAuthority.actor.verifiedEmail,p_profile_version:deps.payoutAuthority.profileVersion,p_recipient:p.recipient_account_id,p_charge:p.source_transaction,p_amount:p.amount_cents,p_currency:p.currency,p_available:source.availableCents},db));
  if(current.id!==p.id||current.recipient_account_id!==p.recipient_account_id||current.source_transaction!==p.source_transaction||current.amount_cents!==p.amount_cents||current.currency!==p.currency)throw new WorkspaceStoreError("Current payout authority does not match the reservation.");
  // A parallel accepted receipt is retrieved; final admission never redispatches it.
  p=current;
 }
 const transfer=p.transfer_id?await stripe.transfers.retrieve(p.transfer_id):await stripe.transfers.create({amount:p.amount_cents,currency:p.currency,destination:p.recipient_account_id,source_transaction:p.source_transaction,metadata:{splitPayoutId:p.id}},{idempotencyKey:`split-payout:${p.id}`});
 if((p.transfer_id&&transfer.id!==p.transfer_id)||(typeof transfer.destination==="string"?transfer.destination:transfer.destination?.id)!==p.recipient_account_id||transfer.source_transaction!==p.source_transaction)throw new WorkspaceStoreError("The transfer does not match its authorized source and recipient.");
 await moneyRpc("record_split_transfer",{p_payout_id:p.id,p_transfer_id:transfer.id,p_amount:transfer.amount,p_currency:transfer.currency},db);return {transferId:transfer.id};
}
export async function reverseApprovedPayout(payoutId:string,lossEvent:string,deps:ConnectDependencies={}) {
 if(process.env.STRELVA_SPLIT_PAYOUT_EXECUTION!=="1")throw new WorkspaceStoreError("Payout execution is not enabled.");
 const db=deps.db===undefined?connectDb():deps.db;
 const r=await moneyRpc<{id:string;transfer_id:string;amount_cents:number;reversal_id?:string}>("prepare_split_transfer_reversal",{p_payout_id:payoutId,p_loss_event:lossEvent},db);
 const stripe=deps.stripe??stripeClient();const reversal=r.reversal_id?await stripe.transfers.retrieveReversal(r.transfer_id,r.reversal_id):await stripe.transfers.createReversal(r.transfer_id,{amount:r.amount_cents,metadata:{splitReversalId:r.id}},{idempotencyKey:`split-reversal:${r.id}`});
 if((typeof reversal.transfer==="string"?reversal.transfer:reversal.transfer.id)!==r.transfer_id)throw new WorkspaceStoreError("The reversal does not match the original transfer.");
 await moneyRpc("record_split_transfer_reversal",{p_id:r.id,p_reversal_id:reversal.id,p_amount:reversal.amount},db);return {reversalId:reversal.id};
}
