import { websiteRebuildReleaseEnabled } from "@/products/websites/index";
import { NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat, checkHeartbeats, CRON_MAX_AGE_SECONDS } from "@/lib/heartbeat";
import { ROOT_DOMAIN,OPERATOR_URL } from "@/lib/brand";
import { websiteDocumentStore } from "@/products/websites/index";
import { scanWebsiteHealth, type WebsiteHealthReceipt } from "@/products/websites/index";
import { sendEmailWithReceipt } from "@/lib/email/send";
import { resolveLeadNotifyRecipients } from "@/lib/delivery-email";
import { getActiveTenants } from "@/lib/tenants";
import { getDomainHealth } from "@/lib/domain-monitor-store";
import { checkTenantDomains } from "@/lib/domain-monitor";
import { getScanSummaries } from "@/lib/scan-store";
import { collectDomainEvidence, deriveSiteCoverage } from "@/platform/operator-queue/site-coverage";
import { saveSiteHealth } from "@/platform/operator-queue/site-health-store";
export const maxDuration=300;

/**
 * Two checks, both read-only toward client sites:
 *
 * 1. Every active site gets a health result (custom repos and hosted sites),
 *    whether or not the website rebuild release is on. Evidence comes from
 *    the domain monitor, the scanner, cron heartbeats and the custom repo's
 *    revalidation mark; a site the domain monitor missed is probed with a GET.
 *    Report-only: the result is saved for the operator queue, nobody is emailed.
 * 2. With the rebuild release on, published hosted documents are read back and
 *    compared with their revision hash, as before (crawl pruning and the
 *    operator email stay with it).
 */
export async function GET(request:Request){
 const denied=requireCronRequest(request);if(denied)return denied;const started=Date.now();let ok=false;let processed=0;let failed=0;
 try{
  let hosted:Record<string,unknown>={skipped:true,reason:"website_rebuild_release_disabled"};let receipts:WebsiteHealthReceipt[]=[];
  if(websiteRebuildReleaseEnabled()){
   let retention:{status:"pruned";removed:number}|{status:"failed"};
   try{retention={status:"pruned",removed:await websiteDocumentStore.pruneCrawls()};}catch{retention={status:"failed"};failed++;}
   const result=await scanWebsiteHealth({list:async()=>{const rows=await websiteDocumentStore.listPublished();return Promise.all(rows.filter(row=>row.tenantId).map(async row=>{return{workspaceId:row.workspaceId,workId:row.workId,tenantId:row.tenantId!,revision:row.revision,contentHash:row.contentHash,url:row.receipt?.providerUrl??`https://${row.tenantId}.${ROOT_DOMAIN}/`};}));},save:receipt=>websiteDocumentStore.recordHealth(receipt),alert:async receipts=>{await sendEmailWithReceipt({audience:"operator",to:resolveLeadNotifyRecipients(),fromAddress:"health@updates.strelva.com",subject:`Strelva: ${receipts.length} hosted website checks need attention`,idempotencyKey:`website-health:${new Date().toISOString().slice(0,10)}`,options:{heading:"Hosted website checks need attention",paragraphs:["The published revision could not be verified. Each result is saved as a health receipt; no content was republished."],rows:receipts.map(value=>({label:value.tenantId,value:`${value.status}: ${value.url}`})),button:{label:"Open operator workspace",url:OPERATOR_URL}}});}});
   processed+=result.processed;failed+=result.failed;receipts=result.results;hosted={processed:result.processed,failed:result.failed,crawlRetention:retention};
  }
  const coverage=await coverEverySite(receipts);processed+=coverage.sites;failed+=coverage.failed;
  ok=failed===0;
  // The pre-existing hosted response fields stay at the top level for callers.
  return NextResponse.json({processed,failed,...(hosted.crawlRetention?{crawlRetention:hosted.crawlRetention}:{}),hosted,coverage},{status:failed?207:200});
 }catch{failed=Math.max(1,failed);return NextResponse.json({error:"Website health checks could not be confirmed."},{status:503});}finally{await recordHeartbeat("website-health",{ok,processed,failed,durationMs:Date.now()-started});}
}

async function coverEverySite(receipts:WebsiteHealthReceipt[]){
 const now=Date.now();
 const tenants=await getActiveTenants();
 const [snapshot,scans,heartbeats]=await Promise.all([getDomainHealth(),getScanSummaries(tenants.map(tenant=>tenant.id)),checkHeartbeats(now)]);
 const byId=new Map(tenants.map(tenant=>[tenant.id,tenant]));
 const evidence=await collectDomainEvidence({tenantIds:tenants.map(tenant=>tenant.id),snapshot,now,maxAgeSeconds:CRON_MAX_AGE_SECONDS["domain-monitor"],probe:async id=>{const tenant=byId.get(id);return tenant?checkTenantDomains(tenant):null;}});
 const results=deriveSiteCoverage({tenants:tenants.map(tenant=>({id:tenant.id,stableId:tenant.stableId,siteName:tenant.siteName,deliveryModel:tenant.deliveryModel,customRepo:tenant.customRepo})),domains:evidence.domains,scans,heartbeats,hosted:receipts.map(receipt=>({tenantId:receipt.tenantId,checkedAt:receipt.checkedAt,status:receipt.status})),now});
 let saved=true;try{await saveSiteHealth({checkedAt:new Date(now).toISOString(),results});}catch{saved=false;}
 const counts={healthy:0,degraded:0,blocked:0,unknown:0};for(const result of results)counts[result.status]++;
 return{sites:results.length,...counts,customRepos:results.filter(result=>result.deliveryModel==="custom_repo").length,probed:evidence.probed,probeFailed:evidence.probeFailed,noHosts:evidence.noHosts,deferred:evidence.deferred,saved,failed:(saved?0:1)+evidence.probeFailed};
}
