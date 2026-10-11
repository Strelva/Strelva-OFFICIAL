import {requireCronRequest} from "@/lib/cron-auth";
import {connectEnabled,moneyRpc} from "@/platform/connect";
export async function GET(request:Request){const denied=requireCronRequest(request);if(denied)return denied;if(!connectEnabled())return Response.json({enabled:false});try{return Response.json({expired:await moneyRpc<number>("expire_business_payment_holds",{p_limit:100})});}catch{return Response.json({error:"Payment holds could not be expired."},{status:503});}}
