import { getSupabase } from "@/platform/infra/db/client";
/** Content expiry continues independently of workspace/product feature flags. */
export async function purgeExpiredGoogleContent(): Promise<number> {
 const db=getSupabase();if(!db)throw new Error("Google content retention storage is unavailable.");
 const {data,error}=await (db as unknown as {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}).rpc("purge_expired_google_receipt_payloads",{p_limit:10000});
 if(error || typeof data!=="number" || !Number.isInteger(data) || data<0)throw new Error("Google content retention purge could not be confirmed.");
 return data;
}
