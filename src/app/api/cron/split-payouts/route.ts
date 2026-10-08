import {requireCronRequest} from "@/lib/cron-auth";
import {recordHeartbeat} from "@/platform/infra/heartbeat";
import {readPlatformSettlement} from "@/platform/connect/settlement";
import {stripeClient,connectDb} from "@/platform/connect";
import {planSplitPayouts,readPayoutCandidates,reservePayoutPlans} from "@/platform/connect/payouts";
export async function GET(request:Request) {
 const denied=requireCronRequest(request);if(denied)return denied;
 if(process.env.STRELVA_SPLIT_PAYOUTS_DRY_RUN!=="1")return Response.json({enabled:false,mode:"dry_run"});
 try {const stripe=stripeClient();const result=await reservePayoutPlans(await planSplitPayouts(await readPayoutCandidates(),{async settledCharge(id){return readPlatformSettlement(stripe,connectDb(),id);}}));await recordHeartbeat("split-payouts",{ok:true,processed:result.plans.length});return Response.json(result);}catch{await recordHeartbeat("split-payouts",{ok:false,failed:1});return Response.json({error:"Dry-run payout planning failed."},{status:503});}
}
