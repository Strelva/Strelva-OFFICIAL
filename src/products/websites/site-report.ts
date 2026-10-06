import { z } from "zod";
import { assertWorkspaceMember,listWork } from "@/platform/workspaces/repository";
import type { WorkspaceDb } from "@/platform/workspaces/schema";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { readInquiryWorkspace } from "@/products/inquiries/server";
import { listPublicWebsiteBookingGrants } from "@/products/scheduling/server";
import { scheduleSchema } from "@/products/scheduling/contracts";
import { aiVisibilityAssessmentPayloadSchema } from "@/products/ai-visibility/client";
import { websiteDocumentStore } from "./document-store";
import { readWebsiteRebuild } from "./rebuild-service";
import { sendEmailWithReceipt } from "@/lib/email/send";
import { getTenantConfig } from "@/lib/tenants";
import { OPERATOR_URL } from "@/lib/brand";
export const websiteReportInputSchema=z.object({month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}).strict();
export interface WebsiteMonthlyReport {
 workId:string;workspaceId:string;tenantId:string|null;siteName:string;month:string;generatedAt:string;
 inquiries:{status:"available"|"unavailable";count:number|null;limitedToRecentRecords:boolean};
 bookings:{status:"available"|"unavailable";scheduledInPeriod:number|null;providerAccepted:number|null;providerVerified:number|null};
 visibility:{status:"available"|"unavailable";checkedAt?:string;mentioned?:boolean;recommended?:boolean;note:string};
 readiness:{status:"available"|"unavailable";checkedAt?:string;passedChecks:number|null;totalChecks:number|null};
 changes:Array<{revision:number;contentHash:string;createdAt:string;createdBy:string;published:boolean}>;
}
export async function readWebsiteMonthlyReport(actor:WorkspaceActor,workId:string,raw:unknown):Promise<WebsiteMonthlyReport>{
 const {month}=websiteReportInputSchema.parse(raw);const record=await readWebsiteRebuild(actor,workId);await assertWorkspaceMember(actor,record.workspaceId);
 const start=new Date(`${month}-01T00:00:00.000Z`);const end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);const during=(at:string)=>Date.parse(at)>=start.getTime()&&Date.parse(at)<end.getTime();
 const key={workspaceId:record.workspaceId,workId};
 const [documents,receipts,published]=await Promise.all([websiteDocumentStore.list(actor,key),websiteDocumentStore.receipts(actor,key),record.rebuild.tenantId?websiteDocumentStore.published(record.rebuild.tenantId):Promise.resolve(null)]);
 if(published&&(published.workspaceId!==record.workspaceId||published.workId!==workId)){const {WorkspaceAccessError}=await import("@/platform/workspaces/types");throw new WorkspaceAccessError();}
 const tenantId=published?.tenantId??null;
 // Workspace document access does not grant access to private native inquiry
 // or calendar records. Recheck current native ownership before reading them.
 if(tenantId)await websiteDocumentStore.managePublishedTenant(actor,{...key,tenantId});
 const work=tenantId?await listWork(actor,record.workspaceId):[];
 const publishedRevisions=new Set(receipts.filter(receipt=>receipt.status==="published").map(receipt=>`${receipt.candidateRevision}:${receipt.artifactHash}`));
 let inquiries:WebsiteMonthlyReport["inquiries"]={status:"unavailable",count:null,limitedToRecentRecords:true};
 if(tenantId){try{const data=await readInquiryWorkspace({tenantId,businessId:record.workspaceId,leadLimit:500});if(data.recordsAvailable&&data.records)inquiries={status:"available",count:data.records.filter(row=>during(row.createdAt)).length,limitedToRecentRecords:true};}catch{/* Missing storage is not zero inquiries. */}}
 const bookingBinding=published?.document.capabilities?.tenant===tenantId?published.document.capabilities.booking:undefined;
 let scheduleId:unknown;
 if(bookingBinding){try{const tenant=tenantId?await getTenantConfig(tenantId):null;const rawGrants=await listPublicWebsiteBookingGrants(actor,record.workspaceId);const grants=Array.isArray(rawGrants)?rawGrants:[rawGrants];scheduleId=grants.find(grant=>grant.status==="published"&&!!tenant?.stableId&&grant.tenant_stable_id===tenant.stableId&&grant.capability_id===bookingBinding.capabilityId&&Number(grant.capability_version)===bookingBinding.version)?.work_id;}catch{/* The booking measurement remains explicitly unavailable. */}}
 const schedule=work.find(row=>row.id===scheduleId);const parsed=scheduleSchema.safeParse(schedule?.payload);
 const reservations=parsed.success?parsed.data.reservations.filter(row=>during(row.start)&&row.status!=="cancelled"):null;
 const bookings:WebsiteMonthlyReport["bookings"]=reservations?{status:"available",scheduledInPeriod:reservations.length,providerAccepted:reservations.filter(row=>row.status==="accepted").length,providerVerified:reservations.filter(row=>row.status==="accepted"&&row.verification==="verified").length}:{status:"unavailable",scheduledInPeriod:null,providerAccepted:null,providerVerified:null};
 const sourceUrl=published?.document.provenance.sourceUrl;
 // Readiness and a saved assistant answer are independent measurements. A high
 // website score cannot establish that an assistant named this business.
 const assessments=work.filter(row=>row.productId==="ai_visibility"&&during(row.updatedAt)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).flatMap(row=>{const result=aiVisibilityAssessmentPayloadSchema.safeParse(row.payload);return result.success&&!!sourceUrl&&result.data.url===sourceUrl?[{checkedAt:row.updatedAt,result:result.data}]:[];});
 const probe=assessments.find(row=>row.result.citation.probed);
 const visibility:WebsiteMonthlyReport["visibility"]=probe?{status:"available",checkedAt:probe.checkedAt,mentioned:probe.result.citation.mentioned,recommended:probe.result.citation.recommended,note:probe.result.citation.note}:{status:"unavailable",note:"No completed assistant citation check was saved for this website in this period. Website readiness does not measure whether an assistant names the business."};
 const checked=assessments.find(row=>row.result.measurementStatus!=="unavailable"&&row.result.readinessMeasured!==false&&row.result.signals.length>0);
 // The assessment score may blend readiness and citation. Report the actual
 // website checks separately instead of relabeling that blended score.
 const readiness:WebsiteMonthlyReport["readiness"]=checked?{status:"available",checkedAt:checked.checkedAt,passedChecks:checked.result.signals.filter(signal=>signal.pass).length,totalChecks:checked.result.signals.length}:{status:"unavailable",passedChecks:null,totalChecks:null};
 return{workId,workspaceId:record.workspaceId,tenantId,siteName:published?.document.siteName??record.rebuild.title,month,generatedAt:new Date().toISOString(),inquiries,bookings,visibility,readiness,changes:documents.filter(row=>during(row.createdAt)).map(row=>({revision:row.revision,contentHash:row.contentHash,createdAt:row.createdAt,createdBy:row.createdBy,published:publishedRevisions.has(`${row.revision}:${row.contentHash}`)}))};
}
/** Shared transport enforces the existing tenant email gate. No recipient is inferred. */
export async function sendWebsiteMonthlyReport(report:WebsiteMonthlyReport,recipient:string,actor:WorkspaceActor){
 const to=z.string().email().parse(recipient);if(!report.tenantId)return{status:"suppressed" as const,reason:"website_not_published"};
 await websiteDocumentStore.managePublishedTenant(actor,{workspaceId:report.workspaceId,workId:report.workId,tenantId:report.tenantId});
 if(to.trim().toLowerCase()!==actor.verifiedEmail.trim().toLowerCase()){const {WorkspaceAccessError}=await import("@/platform/workspaces/types");throw new WorkspaceAccessError("Reports can be sent only to the verified current owner.");}
 return deliverWebsiteMonthlyReport({...report,tenantId:report.tenantId},to);
}

/** Transport only. Callers have already checked who may send and resolved the recipient server-side. */
function deliverWebsiteMonthlyReport(report:WebsiteMonthlyReport&{tenantId:string},to:string){
 return sendEmailWithReceipt({audience:"client",tenantId:report.tenantId,to,fromAddress:"report@updates.strelva.com",subject:`${report.siteName}: ${report.month} website report`,idempotencyKey:`website-report:${report.workId}:${report.month}`,options:{heading:`Your ${report.month} website report`,paragraphs:["Counts come from your native inquiry and booking records. Unavailable measurements are shown below.","Assistant citation results reflect one saved answer. Website readiness checks do not measure whether an assistant names your business."],rows:[{label:"Inquiries (recent retained records)",value:report.inquiries.count===null?"Unavailable":String(report.inquiries.count)},{label:"Bookings scheduled in this period",value:report.bookings.scheduledInPeriod===null?"Unavailable":String(report.bookings.scheduledInPeriod)},{label:"Verified calendar writes",value:report.bookings.providerVerified===null?"Unavailable":String(report.bookings.providerVerified)},{label:"Saved assistant citation check",value:report.visibility.status==="available"?`${report.visibility.mentioned?"Named":"Not named"}; ${report.visibility.recommended?"recommended":"not recommended"} in this check`:"Not measured"},{label:"Website readiness checks",value:report.readiness.status==="available"?`${report.readiness.passedChecks} of ${report.readiness.totalChecks} passed`:"Not measured"},{label:"Website revisions",value:String(report.changes.length)}],button:{label:"Open website report",url:new URL(`/workspace?${new URLSearchParams({workspaceId:report.workspaceId,view:"websites",work:report.workId})}`,OPERATOR_URL).toString()}}});
}

export async function sendOwnerWebsiteMonthlyReport(actor:WorkspaceActor,workId:string,raw:unknown){
 const report=await readWebsiteMonthlyReport(actor,workId,raw);
 const { listWorkspaces }=await import("@/platform/workspaces/repository");
 const workspace=(await listWorkspaces(actor)).find(row=>row.id===report.workspaceId&&row.access==="member"&&row.role==="owner");
 if(!workspace){const { WorkspaceAccessError }=await import("@/platform/workspaces/types");throw new WorkspaceAccessError("Only the business owner can send a website report.");}
 return{report,delivery:await sendWebsiteMonthlyReport(report,actor.verifiedEmail,actor)};
}

/** The business's owner recipient by the one rule (Reborn §1): the record's
 * owner contact, else the published site's tenant rule, else the reading
 * owner's own verified address. Resolved server-side only. */
export async function resolveWebsiteReportRecipient(workspaceId:string,tenantId:string|null,ownerEmail:string):Promise<{email:string;from:"record"|"tenant"|"linked_tenant"|"tenant_fallback"|"owner"}>{
 const parse=(value:unknown)=>z.string().trim().toLowerCase().email().safeParse(value);
 try{const { resolveOwnerRecipient }=await import("@/platform/business-record/service");const found=await resolveOwnerRecipient(workspaceId);const parsed=parse(found?.email);if(found&&parsed.success)return{email:parsed.data,from:found.from==="record"?"record":"linked_tenant"};}catch{/* Fall through to the tenant rule. */}
 if(tenantId){const tenant=await getTenantConfig(tenantId).catch(()=>undefined);const { resolveOwnerNoticeRecipient }=await import("@/lib/owner-recipient");const found=await resolveOwnerNoticeRecipient({id:tenantId,ownerEmail:tenant?.ownerEmail});if(found)return{email:found.email,from:found.from};}
 return{email:z.string().email().parse(ownerEmail.trim().toLowerCase()),from:"owner"};
}

/** Cron send: the report is read under the current owner's authority (the
 * reads require the business owner who also owns the published tenant), then
 * goes to the recipient the one owner-recipient rule names. The recipient is
 * never browser-supplied. */
async function sendCronWebsiteMonthlyReport(actor:WorkspaceActor,workId:string,month:string){
 const report=await readWebsiteMonthlyReport(actor,workId,{month});
 const { listWorkspaces }=await import("@/platform/workspaces/repository");
 const workspace=(await listWorkspaces(actor)).find(row=>row.id===report.workspaceId&&row.access==="member"&&row.role==="owner");
 if(!workspace){const { WorkspaceAccessError }=await import("@/platform/workspaces/types");throw new WorkspaceAccessError("Only the business owner can send a website report.");}
 if(!report.tenantId)return{status:"suppressed" as const,reason:"website_not_published"};
 await websiteDocumentStore.managePublishedTenant(actor,{workspaceId:report.workspaceId,workId:report.workId,tenantId:report.tenantId});
 const recipient=await resolveWebsiteReportRecipient(report.workspaceId,report.tenantId,actor.verifiedEmail);
 return deliverWebsiteMonthlyReport({...report,tenantId:report.tenantId},recipient.email);
}

/** Monthly cron resolves the current workspace owner from trusted membership,
 * then verifies their Supabase identity to read the report. It cannot
 * impersonate the creator or send customer data to a browser-supplied
 * destination. A business with no owner yet (a converted client before its
 * owner accepts) is reported as such: nobody may read its report. */
export async function runWebsiteMonthlyReports(month:string){
 const { websiteRebuildReleaseEnabled }=await import("./rebuild-release");
 if(!websiteRebuildReleaseEnabled())return{tenants:[] as string[],sent:0,suppressed:0,errors:[] as string[]};
 const { getSupabase }=await import("@/lib/db/client");
 const { WorkspaceStoreError }=await import("@/platform/workspaces/types");
 const db=getSupabase();if(!db)throw new WorkspaceStoreError("Website report storage is unavailable.");
 const published=await websiteDocumentStore.listPublished();const result={tenants:published.flatMap(row=>row.tenantId?[row.tenantId]:[]),sent:0,suppressed:0,errors:[] as string[]};
 for(const site of published){
  try{
   const {data,error}=await (db as unknown as WorkspaceDb).from("workspace_memberships").select("user_id").eq("workspace_id",site.workspaceId).eq("role","owner").order("created_at",{ascending:true}).limit(1);
   if(error)throw new WorkspaceStoreError("No current workspace owner could be confirmed.");
   if(!data?.[0]){result.errors.push(`${site.tenantId??site.workId}: no owner has accepted this business yet; invite one (scripts/business-ownership.ts)`);continue;}
   const identity=await db.auth.admin.getUserById(z.string().uuid().parse(data[0].user_id));
   const user=identity.data.user;if(identity.error||!user?.email||!user.email_confirmed_at)throw new WorkspaceStoreError("No verified workspace owner could be confirmed.");
   const delivery=await sendCronWebsiteMonthlyReport({userId:user.id,verifiedEmail:user.email.trim().toLowerCase()},site.workId,month);
   if(delivery.status==="accepted")result.sent++;else result.suppressed++;
  }catch{result.errors.push(`${site.tenantId??site.workId}: native monthly report could not be confirmed`);}
 }
 return result;
}
