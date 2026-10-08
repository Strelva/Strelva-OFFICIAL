import { NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/platform/infra/heartbeat";
import { listTenantDomainClaims,refreshDomainClaim } from "@/lib/domains";
import { getActiveTenants } from "@/lib/tenants";
import { sendEmailWithReceipt } from "@/platform/infra/email/send";
import { resolveLeadNotifyRecipients } from "@/lib/delivery-email";
import { OPERATOR_URL } from "@/platform/infra/brand";
import { websiteRebuildReleaseEnabledForTenant, websiteRebuildReleaseMayBeOn } from "@/products/websites/index";
import { OPERATOR_VIEWER } from "@/platform/release-flags/viewer";
import { verifyHostedDomains } from "@/products/websites/index";
import { websiteDocumentStore, websiteRebuildReleaseEnabledForWorkspace } from "@/products/websites/index";
import { operatorQueueReleaseEnabled } from "@/platform/operator-queue/release";
import { getRedis } from "@/platform/infra/redis";
import { createHash } from "node:crypto";
export const maxDuration=300;
/**
 * Domain verification for every active site: custom-repo clients and hosted
 * sites alike when the operator queue release is on. Hosted-only checks keep
 * their existing rebuild gate while the operator queue release is off.
 * Against Vercel it only reads (project domain + domain config GETs, through
 * refreshDomainClaim); the only write is Strelva's own claim status.
 * The seven-day operator email stays tied to the rebuild release, so with the
 * release off this cron is report-only: the operator queue reads the claims.
 */
export async function GET(request:Request){
 const denied=requireCronRequest(request);if(denied)return denied;const started=Date.now();let ok=false;let processed=0;let failed=0;
 try{
  const coverageEnabled=operatorQueueReleaseEnabled();
  if(!coverageEnabled&&(!websiteRebuildReleaseMayBeOn()||!process.env.VERCEL_API_TOKEN)){ok=true;return NextResponse.json({skipped:true,reason:"website_rebuild_or_provider_disabled"});}
  if(!process.env.VERCEL_API_TOKEN){ok=true;return NextResponse.json({skipped:true,reason:"domain_provider_disabled"});}
  const alerting=websiteRebuildReleaseMayBeOn();
  const result=await verifyHostedDomains({list:async()=>{
   if(coverageEnabled)return(await getActiveTenants()).map(tenant=>({tenantId:tenant.id}));
   const listed=await websiteDocumentStore.listPublished();
   const released=await Promise.all(listed.map(row=>websiteRebuildReleaseEnabledForWorkspace(row.workspaceId,OPERATOR_VIEWER)));
   return listed.filter((row,index)=>released[index]&&row.tenantId).map(row=>({tenantId:row.tenantId!}));
  },claims:listTenantDomainClaims,refresh:refreshDomainClaim,...(alerting?{alert:async(value:{tenantId:string;hostname:string;createdAt:string;checkedAt:string})=>{
   // Per site under `workspace`: alert only where the client's business has the rebuild on (operators count).
   if(!(await websiteRebuildReleaseEnabledForTenant(value.tenantId,OPERATOR_VIEWER).catch(()=>false)))return;
   const digest=createHash("sha256").update(`${value.tenantId}:${value.hostname}`).digest("hex").slice(0,32);
   const day=new Date().toISOString().slice(0,10);const marker=`reb:website-domain-alert:${digest}:${day}`;const redis=getRedis();if(redis&&await redis.get(marker).catch(()=>null))return;
   const delivery=await sendEmailWithReceipt({audience:"operator",to:resolveLeadNotifyRecipients(),fromAddress:"health@updates.strelva.com",subject:"Strelva: website domain still awaits verification",idempotencyKey:`website-domain:${digest}:${day}`,options:{heading:"A website domain has waited seven days",paragraphs:["The owner has not completed DNS verification. The hosted site remains available on its Strelva address."],rows:[{label:"Website",value:value.tenantId},{label:"Domain",value:value.hostname},{label:"Domain requested",value:value.createdAt},{label:"Last provider check",value:value.checkedAt}],button:{label:"Open operator workspace",url:OPERATOR_URL}}});
   if(delivery.status==="accepted"&&redis)await redis.set(marker,"accepted",{ex:48*3600}).catch(()=>undefined);
  }}:{})});processed=result.processed;failed=result.failed;
  // New owner receipts are isolated behind the rebuild release; the checker
  // reads provider state and never retries an attachment.
  const proposals=alerting?await (await import("@/products/websites/index")).reconcileWebsiteDomainRequests():null;
  failed+=proposals?.failed??0;ok=failed===0;return NextResponse.json({...result,...(proposals?{domainRequests:proposals}:{}),...(coverageEnabled?{mode:alerting?"alerting":"report_only"}:{})},{status:failed?207:200});
 }catch{failed=Math.max(1,failed);return NextResponse.json({error:"Website domain verification could not be confirmed."},{status:503});}
 finally{await recordHeartbeat("website-domain-verification",{ok,processed,failed,durationMs:Date.now()-started});}
}
