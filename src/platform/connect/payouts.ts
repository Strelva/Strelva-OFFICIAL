import {connectDb,moneyRpc,type RpcDb} from "./index";
export interface PayoutCandidate {split_id:string;source_account_id:string;source_charge_id:string;currency:string;agreement_version:string;recipient_account_id:string|null;amount_cents:number;state:string;configurations:string[];capabilities: {recipient?:{capabilities?:{stripe_balance?:{stripe_transfers?:{status?:string}}}}};}
export interface SettlementReader {settledCharge(chargeId:string):Promise<{settled:boolean;currency:string;availableCents:number}>;}
/** No transfer adapter is accepted: this runner cannot make a payout, even when an env flag is set. */
export async function planSplitPayouts(rows:PayoutCandidate[],settlement:SettlementReader) {
 const plans:Array<{splitId:string;recipient:string;sourceTransaction:string;amountCents:number;currency:string;agreementVersion:string;availableCents:number}>=[];
 const skipped:Array<{splitId:string;reason:string}>=[];
 const consumed=new Map<string,number>();
 for(const row of rows) {
 let reason:string|undefined;
 if(!Number.isSafeInteger(row.amount_cents)||row.amount_cents<=0) reason="no_remaining_accrual";
 else if(row.source_account_id!=="platform") reason="source_funds_belong_to_connected_merchant";
 else if(!row.recipient_account_id||row.state!=="ready"||!row.configurations.includes("recipient")||row.capabilities.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status!=="active")reason="recipient_not_ready";
 else if(!row.agreement_version)reason="agreement_required";
 if(reason){skipped.push({splitId:row.split_id,reason});continue;}
 try {
 const source=await settlement.settledCharge(row.source_charge_id);
 const used=consumed.get(row.source_charge_id)??0;
 if(!source.settled)reason="source_not_settled";
 else if(source.currency!==row.currency)reason="currency_mismatch";
 else if(used+row.amount_cents>source.availableCents)reason="insufficient_source_balance";
 if(reason){skipped.push({splitId:row.split_id,reason});continue;}
 consumed.set(row.source_charge_id,used+row.amount_cents);
 plans.push({splitId:row.split_id,recipient:row.recipient_account_id!,sourceTransaction:row.source_charge_id,amountCents:row.amount_cents,currency:row.currency,agreementVersion:row.agreement_version,availableCents:source.availableCents});
 }catch{skipped.push({splitId:row.split_id,reason:"settlement_unavailable"});}
 }
 return {mode:"dry_run" as const,plans,skipped};
}
export async function readPayoutCandidates(db:RpcDb|null=connectDb()){return moneyRpc<PayoutCandidate[]>("read_split_payout_candidates",{p_limit:100},db);}

export async function reservePayoutPlans(result:Awaited<ReturnType<typeof planSplitPayouts>>,db:RpcDb|null=connectDb()){const reserved:unknown[]=[];for(const p of result.plans){try{reserved.push(await moneyRpc("reserve_split_payout_dry_run",{p_split_id:p.splitId,p_recipient:p.recipient,p_charge:p.sourceTransaction,p_amount:p.amountCents,p_currency:p.currency,p_agreement:p.agreementVersion,p_available:p.availableCents},db));}catch{result.skipped.push({splitId:p.splitId,reason:"durable_reservation_conflict"});}}return {...result,reserved};}
