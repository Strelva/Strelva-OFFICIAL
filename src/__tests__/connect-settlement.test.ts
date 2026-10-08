import { afterEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { readPlatformSettlement } from "@/platform/connect/settlement";
import { executeApprovedRecovery } from "@/platform/connect/recovery";
const rows = <T>(values: T[]) => ({ async *[Symbol.asyncIterator]() { yield* values; } });
function fixture() {
 const original={id:"txn_Original",source:"ch_Source",amount:1000,fee:50,net:950,currency:"cad",status:"available"};
 const charge={id:"ch_Source",amount:1000,amount_refunded:0,currency:"cad",livemode:false,disputed:true,paid:true,captured:true,balance_transaction:original};
 const dispute={id:"dp_Won",charge:"ch_Source",amount:1000,currency:"cad",livemode:false,status:"won",evidence_details:{submission_count:0},balance_transactions:[{id:"txn_Debit",source:"dp_Won",amount:-1000,fee:15,net:-1015,currency:"cad",status:"available"},{id:"txn_Credit",source:"dp_Won",amount:1000,fee:0,net:1000,currency:"cad",status:"available"}]};
 const refunds:Array<{id:string;charge:string;amount:number;currency:string;status:string;balance_transaction:typeof original|null;failure_balance_transaction?:typeof original}>=[];
 const transfers:Array<{id:string;source_transaction:string;amount:number;amount_reversed:number;currency:string;livemode:boolean}>=[];
 const retrieve=vi.fn(async()=>charge),listDisputes=vi.fn(()=>rows([dispute])),listRefunds=vi.fn(()=>rows(refunds));
 const stripe={charges:{retrieve},disputes:{list:listDisputes},refunds:{list:listRefunds},transfers:{list:vi.fn(()=>rows(transfers))}};
 const db={rpc:vi.fn(async()=>({data:["tr_Known"],error:null}))};
 return {original,charge,dispute,refunds,transfers,retrieve,listDisputes,listRefunds,stripe,db};
}
afterEach(()=>vi.unstubAllEnvs());
describe("observed platform source settlement",()=>{
 it("applies actual refund net once, keeps dispute fees, and excludes ledger transfers already reserved",async()=>{
  const f=fixture();f.charge.amount_refunded=200;
  f.refunds.push({id:"re_Partial",charge:"ch_Source",amount:200,currency:"cad",status:"succeeded",balance_transaction:{id:"txn_Refund",source:"re_Partial",amount:-200,fee:-10,net:-190,currency:"cad",status:"available"}});
  f.transfers.push({id:"tr_Known",source_transaction:"ch_Source",amount:300,amount_reversed:100,currency:"cad",livemode:false},{id:"tr_External",source_transaction:"ch_Source",amount:100,amount_reversed:25,currency:"cad",livemode:false});
  expect(await readPlatformSettlement(f.stripe as unknown as Stripe,f.db,"ch_Source")).toEqual({settled:true,currency:"cad",availableCents:670});
  expect(f.retrieve).toHaveBeenCalledWith("ch_Source",{expand:["balance_transaction"]});
  expect(f.listDisputes).toHaveBeenCalledWith({charge:"ch_Source",limit:100});
  expect(f.listRefunds).toHaveBeenCalledWith({charge:"ch_Source",limit:100,expand:["data.balance_transaction","data.failure_balance_transaction"]});
 });
 it("failed refund retains a fee proven by its debit plus returned-funds receipt",async()=>{
  const f=fixture();f.refunds.push({id:"re_Failed",charge:"ch_Source",amount:200,currency:"cad",status:"failed",balance_transaction:{id:"txn_Failed",source:"re_Failed",amount:-200,fee:0,net:-200,currency:"cad",status:"available"},failure_balance_transaction:{id:"txn_Return",source:"re_Failed",amount:200,fee:5,net:195,currency:"cad",status:"available"}});
  expect((await readPlatformSettlement(f.stripe as unknown as Stripe,f.db,"ch_Source")).availableCents).toBe(930);
 });
 it.each(["missing refund","unknown fee","foreign source","foreign currency","pending refund","missing failed credit","duplicate receipt","transfer mode","transfer reversal","zero original fee","overflow"])("%s does not prove available source funds",async name=>{
  const f=fixture();f.charge.amount_refunded=200;f.refunds.push({id:"re_One",charge:"ch_Source",amount:200,currency:"cad",status:"succeeded",balance_transaction:{id:"txn_Refund",source:"re_One",amount:-200,fee:0,net:-200,currency:"cad",status:"available"}});
  if(name==="missing refund")f.refunds.length=0;
  if(name==="unknown fee")Reflect.deleteProperty(f.original,"fee");
  if(name==="foreign source")f.refunds[0]!.charge="ch_Foreign";
  if(name==="foreign currency")f.refunds[0]!.balance_transaction!.currency="usd";
  if(name==="pending refund"){f.refunds[0]!.status="pending";f.charge.amount_refunded=0;}
  if(name==="missing failed credit"){f.refunds[0]!.status="failed";f.charge.amount_refunded=0;}
  if(name==="duplicate receipt")f.refunds[0]!.balance_transaction!.id="txn_Credit";
  if(name==="transfer mode")f.transfers.push({id:"tr_Unknown",source_transaction:"ch_Source",amount:100,amount_reversed:0,currency:"cad",livemode:true});
  if(name==="transfer reversal")f.transfers.push({id:"tr_Unknown",source_transaction:"ch_Source",amount:100,amount_reversed:101,currency:"cad",livemode:false});
  if(name==="zero original fee"){f.original.fee=0;f.original.net=1000;}
  if(name==="overflow")f.original.net=Number.MAX_SAFE_INTEGER+1;
  const result=await readPlatformSettlement(f.stripe as unknown as Stripe,f.db,"ch_Source").catch(()=>null);expect(result?.settled===true).toBe(false);
 });
 it("binds trusted expected currency and configured SDK mode",async()=>{
  const f=fixture();await expect(readPlatformSettlement(f.stripe as unknown as Stripe,f.db,"ch_Source",{currency:"usd"})).rejects.toThrow(/mode or currency/);
  vi.stubEnv("STRIPE_SECRET_KEY","sk_live_nonsecret_fixture");
  await expect(readPlatformSettlement(f.stripe as unknown as Stripe,f.db,"ch_Source",{livemode:false})).rejects.toThrow(/mode or currency/);
 });
 it.each([true,false])("shared recovery reservation bounds are checked before a provider write (%s)",async overdraw=>{
  vi.stubEnv("STRELVA_SPLIT_PAYOUT_EXECUTION","1");const f=fixture();
  const create=vi.fn(async()=>({id:"tr_Recovery",amount:25,currency:"cad",destination:"acct_Recipient",source_transaction:"ch_Source"}));
  const provider={...f.stripe,transfers:{...f.stripe.transfers,create}};
  const db={rpc:vi.fn(async(name:string,args:Record<string,unknown>)=>{
   if(name==="prepare_split_recovery")return {data:{id:"recovery-1",source_account_id:"platform",recipient_account_id:"acct_Recipient",source_transaction:"ch_Source",amount_cents:25,currency:"cad"},error:null};
   if(name==="read_source_transfer_ids")return {data:[],error:null};
   if(name==="assert_recovery_settlement"){expect(args.p_available).toBe(935);return {data:null,error:overdraw?{message:"recovery_source_balance_changed"}:null};}
   return {data:null,error:null};
  })};
  if(overdraw){await expect(executeApprovedRecovery("recovery-1",{db,stripe:provider as unknown as Stripe})).rejects.toThrow();expect(create).not.toHaveBeenCalled();}
  else {await expect(executeApprovedRecovery("recovery-1",{db,stripe:provider as unknown as Stripe})).resolves.toEqual({transferId:"tr_Recovery"});expect(create).toHaveBeenCalledWith(expect.objectContaining({amount:25,source_transaction:"ch_Source"}),{idempotencyKey:"split-recovery:recovery-1"});}
 });
});
