import type Stripe from "stripe";
import {moneyRpc,type RpcDb} from "./index";
/** Processing fees, refunds and transfers outside our ledger consume source
 * funds too. Known ledger transfers are already counted by SQL reservations. */
export async function readPlatformSettlement(stripe:Stripe,db:RpcDb|null,chargeId:string){
 const charge=await stripe.charges.retrieve(chargeId,{expand:["balance_transaction"]});const balance=charge.balance_transaction;
 if(charge.id!==chargeId)throw Error("Settlement charge identity mismatch");
 if(!balance||typeof balance==="string")throw Error("Settlement receipt missing");
 const known=await moneyRpc<string[]>("read_source_transfer_ids",{p_charge:chargeId},db);let external=0;
 for await(const transfer of stripe.transfers.list({limit:100}))if(transfer.source_transaction===chargeId&&!known.includes(transfer.id)){if(transfer.currency!==balance.currency)throw Error("Transfer currency mismatch");external+=transfer.amount-transfer.amount_reversed;}
 return {settled:balance.status==="available"&&!charge.disputed&&charge.currency===balance.currency,currency:balance.currency,availableCents:Math.max(0,balance.net-charge.amount_refunded-external)};
}
