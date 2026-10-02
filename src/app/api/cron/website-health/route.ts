import { websiteRebuildReleaseEnabled } from "@/products/websites/index";
import { NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/lib/heartbeat";
import { ROOT_DOMAIN,OPERATOR_URL } from "@/lib/brand";
import { websiteDocumentStore } from "@/products/websites/index";
import { scanWebsiteHealth } from "@/products/websites/index";
import { sendEmailWithReceipt } from "@/lib/email/send";
import { resolveLeadNotifyRecipients } from "@/lib/delivery-email";
export const maxDuration=300;
export async function GET(request:Request){
 const denied=requireCronRequest(request);if(denied)return denied;const started=Date.now();let ok=false;let processed=0;let failed=0;
 try{if(!websiteRebuildReleaseEnabled()){ok=true;return NextResponse.json({skipped:true,reason:"website_rebuild_release_disabled"});}let retention:{status:"pruned";removed:number}|{status:"failed"};
  try{retention={status:"pruned",removed:await websiteDocumentStore.pruneCrawls()};}catch{retention={status:"failed"};failed++;}
  const result=await scanWebsiteHealth({list:async()=>{const rows=await websiteDocumentStore.listPublished();return Promise.all(rows.filter(row=>row.tenantId).map(async row=>{return{workspaceId:row.workspaceId,workId:row.workId,tenantId:row.tenantId!,revision:row.revision,contentHash:row.contentHash,url:row.receipt?.providerUrl??`https://${row.tenantId}.${ROOT_DOMAIN}/`};}));},save:receipt=>websiteDocumentStore.recordHealth(receipt),alert:async receipts=>{await sendEmailWithReceipt({audience:"operator",to:resolveLeadNotifyRecipients(),fromAddress:"health@updates.strelva.com",subject:`Strelva: ${receipts.length} hosted website checks need attention`,idempotencyKey:`website-health:${new Date().toISOString().slice(0,10)}`,options:{heading:"Hosted website checks need attention",paragraphs:["The published revision could not be verified. Each result is saved as a health receipt; no content was republished."],rows:receipts.map(value=>({label:value.tenantId,value:`${value.status}: ${value.url}`})),button:{label:"Open operator workspace",url:OPERATOR_URL}}});}});processed=result.processed;failed+=result.failed;ok=failed===0;return NextResponse.json({processed,failed,crawlRetention:retention},{status:failed?207:200});}catch{failed=Math.max(1,failed);return NextResponse.json({error:"Hosted website health checks could not be confirmed."},{status:503});}finally{await recordHeartbeat("website-health",{ok,processed,failed,durationMs:Date.now()-started});}
}
