import { NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/platform/infra/heartbeat";
import { purgeExpiredGoogleContent } from "@/products/google-listing/retention";
export async function GET(request:Request){
 const denied=requireCronRequest(request);if(denied)return denied;
 try {
  const removed=await purgeExpiredGoogleContent();
  await recordHeartbeat("google-content-retention",{ok:true,processed:removed});
  return NextResponse.json({removed});
 } catch {
  await recordHeartbeat("google-content-retention",{ok:false,failed:1});
  return NextResponse.json({error:"Google content retention could not be confirmed."},{status:503});
 }
}
