import { z } from "zod";
import { recordCatalogReport } from "@/platform/catalog-reports/receipts";
import { assertWorkspaceMember,listWork } from "@/platform/workspaces/repository";
import type { WorkspaceDb } from "@/platform/workspaces/schema";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { readInquiryWorkspace } from "@/products/inquiries/server";
import { listPublicWebsiteBookingGrants } from "@/products/scheduling/server";
import { scheduleSchema } from "@/products/scheduling/contracts";
import { aiVisibilityAssessmentPayloadSchema } from "@/products/ai-visibility/client";
import { websiteDocumentStore } from "./document-store";
import { readWebsiteRebuild } from "./rebuild-service";
import { sendEmailWithReceipt } from "@/platform/infra/email/send";
import type { PaperEmail } from "@/platform/infra/email/paper";
import { customerEmailPaused, emailSendingPaused } from "@/platform/infra/email/enabled";
import { getClientEmailOverride } from "@/platform/infra/email/client-override";
import { getTenantConfig } from "@/lib/tenants";
import { CONTROL_PLANE_URL, SITES_ROOT_DOMAIN } from "@/platform/infra/brand";
import { bindToCurrentTenant } from "./hosted-routing";
import type { SiteDocument } from "./site-document-schema";
import { businessOutcomeReportsEnabled, deliverBusinessOutcomeReport, readBusinessOutcomeReports, type BusinessOutcomeReport } from "@/platform/business-outcomes/reports";
export const websiteReportInputSchema=z.object({month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}).strict();
export interface WebsiteMonthlyReport {
 workId:string;workspaceId:string;tenantId:string|null;siteName:string;month:string;generatedAt:string;
 inquiries:{status:"available"|"unavailable";count:number|null;limitedToRecentRecords:boolean};
 bookings:{status:"available"|"unavailable";scheduledInPeriod:number|null;providerAccepted:number|null;providerVerified:number|null};
 visibility:{status:"available"|"unavailable";checkedAt?:string;mentioned?:boolean;recommended?:boolean;note:string};
 readiness:{status:"available"|"unavailable";checkedAt?:string;passedChecks:number|null;totalChecks:number|null};
 /** `summary` says what a published change did ("changed the home page"), from the documents themselves; absent on reports saved before it. */
 changes:Array<{revision:number;contentHash:string;createdAt:string;createdBy:string;published:boolean;summary?:string|null}>;
 businessOutcome?:BusinessOutcomeReport;
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
 // After a slug rename the issued binding names the old slug; the receipt proves it is this tenant (P2 #8).
 const servedCapabilities=published&&tenantId?bindToCurrentTenant(published.document,tenantId,published.receipt,SITES_ROOT_DOMAIN).capabilities:undefined;
 const bookingBinding=servedCapabilities?.tenant===tenantId?servedCapabilities.booking:undefined;
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
 const businessOutcome=tenantId?(await readBusinessOutcomeReports([tenantId],month))?.find(row=>row.workspaceId===record.workspaceId):undefined;
 return{workId,workspaceId:record.workspaceId,tenantId,siteName:published?.document.siteName??record.rebuild.title,month,generatedAt:new Date().toISOString(),inquiries,bookings,visibility,readiness,...(businessOutcome?{businessOutcome}:{}),changes:documentChanges(documents,publishedRevisions).filter(row=>during(row.createdAt))};
}
/** A page's own content: every node reachable from its root, with the facts those nodes show, in visit order. */
function pageDigest(doc:SiteDocument,root:string):string{
 const seen=new Set<string>();const out:unknown[]=[];
 const visit=(id:string)=>{if(seen.has(id))return;seen.add(id);const node=doc.nodes[id];if(!node)return;out.push(node,node.factIds.map(fact=>doc.facts[fact]??null));node.children.forEach(visit);};
 visit(root);return JSON.stringify(out);
}
const pageWord=(page:{path:string;title:string})=>page.path==="/"?"home page":`${page.title} page`;
const listWords=(items:string[])=>items.length<=1?items.join(""):items.length===2?`${items[0]} and ${items[1]}`:`${items.slice(0,-1).join(", ")} and ${items[items.length-1]}`;
const somePages=(pages:Array<{path:string;title:string}>)=>{const named=pages.slice(0,3).map(pageWord);const rest=pages.length-named.length;return listWords(rest>0?[...named,`${rest} more ${rest===1?"page":"pages"}`]:named).replace(/^/,"the ");};
const SECTION_WORDS:Readonly<Record<string,string>>={Header:"header",Footer:"footer",Hero:"top section",TrustStrip:"trust badges",ServiceGrid:"services list",ServiceDetail:"service details",Story:"story",TeamGrid:"team section",Testimonials:"testimonials",ReviewSummary:"reviews",Faq:"questions and answers",Stats:"numbers",Gallery:"photos",Hours:"hours",Map:"map",Locations:"locations",Cta:"booking button",InquiryForm:"contact form",Booking:"booking section",PageHeader:"page heading",RichText:"text"};
/** The sections of one page that changed, as "changed the hours and the map" or "moved sections"; null when it can't be said that plainly. */
function sectionChanges(previous:SiteDocument,next:SiteDocument,oldRoot:string,newRoot:string):string|null{
 const reach=(doc:SiteDocument,root:string)=>{const ids:string[]=[];const seen=new Set<string>();const visit=(id:string)=>{if(seen.has(id)||!doc.nodes[id])return;seen.add(id);ids.push(id);doc.nodes[id]!.children.forEach(visit);};visit(root);return ids;};
 const own=(doc:SiteDocument,id:string)=>{const{children:_children,...rest}=doc.nodes[id]!;return JSON.stringify([rest,rest.factIds.map(fact=>doc.facts[fact]??null)]);};
 const oldIds=new Set(reach(previous,oldRoot));const newIds=reach(next,newRoot);
 const words=(ids:string[])=>[...new Set(ids.map(id=>SECTION_WORDS[next.nodes[id]?.type??previous.nodes[id]?.type??""]).filter(Boolean))].map(word=>`the ${word}`);
 const edited=words(newIds.filter(id=>oldIds.has(id)&&own(previous,id)!==own(next,id)));
 const addedSections=words(newIds.filter(id=>!oldIds.has(id)));
 const newSet=new Set(newIds);const removedSections=[...new Set([...oldIds].filter(id=>!newSet.has(id)).map(id=>SECTION_WORDS[previous.nodes[id]!.type]).filter(Boolean))].map(word=>`the ${word}`);
 const order=(doc:SiteDocument,ids:Iterable<string>)=>JSON.stringify([...ids].map(id=>[id,doc.nodes[id]!.children]));
 const moved=!edited.length&&!addedSections.length&&!removedSections.length&&order(previous,reach(previous,oldRoot))!==order(next,newIds);
 if(moved)return"moved sections";
 if(edited.length>3||addedSections.length>2||removedSections.length>2)return null;
 const parts=[...(edited.length?[`changed ${listWords(edited)}`]:[]),...(addedSections.length?[`added ${listWords(addedSections)}`]:[]),...(removedSections.length?[`removed ${listWords(removedSections)}`]:[])];
 return parts.length?listWords(parts):null;
}
/**
 * What a published website change did, as a verb phrase that follows its
 * actor ("changed the home page", "added the Insurance page"), read from the
 * two documents rather than guessed. `previous` is the last published
 * document before it; none means this was the site's first publish.
 */
export function websiteChangeSummary(previous:SiteDocument|null,next:SiteDocument):string{
 if(!previous)return"published the site";
 const before=new Map(previous.pages.map(page=>[page.path,page]));const after=new Set(next.pages.map(page=>page.path));
 const added=next.pages.filter(page=>!before.has(page.path));
 const removed=previous.pages.filter(page=>!after.has(page.path));
 const changed=next.pages.filter(page=>{const old=before.get(page.path);return!!old&&(old.title!==page.title||old.description!==page.description||pageDigest(previous,old.root)!==pageDigest(next,page.root));});
 // One page changed and nothing else: name the parts of it that changed, in the words a visitor would use.
 if(changed.length===1&&!added.length&&!removed.length&&JSON.stringify(previous.theme)===JSON.stringify(next.theme)){const detail=sectionChanges(previous,next,before.get(changed[0]!.path)!.root,changed[0]!.root);if(detail)return`${detail} on the ${pageWord(changed[0]!)}`;}
 const parts=[...(changed.length?[`changed ${somePages(changed)}`]:[]),...(added.length?[`added ${somePages(added)}`]:[]),...(removed.length?[`removed ${somePages(removed)}`]:[]),...(JSON.stringify(previous.theme)!==JSON.stringify(next.theme)?["changed the site's look"]:[])];
 return parts.length?listWords(parts):"updated the site's settings";
}
/** Every saved revision with whether it went live and, for a published one, what it changed since the last published one. */
function documentChanges(documents:readonly{revision:number;contentHash:string;createdAt:string;createdBy:string;document:SiteDocument}[],publishedRevisions:ReadonlySet<string>):WebsiteMonthlyReport["changes"]{
 let lastPublished:SiteDocument|null=null;
 return [...documents].sort((a,b)=>a.revision-b.revision).map(row=>{
  const published=publishedRevisions.has(`${row.revision}:${row.contentHash}`);
  const summary=published?websiteChangeSummary(lastPublished,row.document):null;
  if(published)lastPublished=row.document;
  return{revision:row.revision,contentHash:row.contentHash,createdAt:row.createdAt,createdBy:row.createdBy,published,summary};
 });
}
const reportMonthLabel=(month:string)=>{const date=new Date(`${month}-15T12:00:00Z`);return Number.isNaN(date.getTime())?month:date.toLocaleDateString("en-US",{month:"long",year:"numeric",timeZone:"UTC"});};
const reportDay=(at:string)=>{const date=new Date(at);return Number.isNaN(date.getTime())?"":date.toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"UTC"});};
const many=(n:number,one:string,more:string)=>`${n} ${n===1?one:more}`;
/** XA · E3 presentation of the monthly recap (lane results, October 16):
 * one sentence for the month (inquiries, else bookings) with one quiet clause
 * that adds a different fact, the one change that mattered (the newest
 * published change, said as whoever acted and what it changed) with a link to
 * its System, the other published changes as rows, and one ink button. No
 * hero figure, no idle clay line-up, and no sender line repeating the subject.
 * Draft-only saves are left out: nothing changed for visitors. Presentation
 * only; counts and their sources are the report's own, and a count that
 * couldn't be read is left out rather than shown as zero. `actors` names the
 * people behind change records (an id with no known name is left unnamed
 * rather than guessed). `systemUrl` overrides where "See it" opens (the
 * website System); by default it is the System on the control plane. */
export function websiteReportPaper(report:WebsiteMonthlyReport,openUrl:string,options:{actors?:Readonly<Record<string,string>>;systemUrl?:string}={}):PaperEmail{
 const month=reportMonthLabel(report.month);
 const monthName=month.split(" ")[0];
 const booked=report.bookings.scheduledInPeriod;
 const lead=report.inquiries.count!==null?{text:`${many(report.inquiries.count,"inquiry","inquiries")} came in through your site in ${monthName}.`,quiet:booked!==null?`${many(booked,"visit was","visits were")} booked${report.bookings.providerVerified!==null?`, and ${report.bookings.providerVerified} of them are on your calendar`:""}.`:undefined}
  :booked!==null?{text:`${many(booked,"visit was","visits were")} booked through your site in ${monthName}.`,quiet:report.bookings.providerVerified!==null?`${report.bookings.providerVerified} of them are on your calendar.`:undefined}:null;
 const sentences:string[]=[];
 if(report.readiness.status==="available"&&report.readiness.passedChecks!==null&&report.readiness.totalChecks!==null)sentences.push(report.readiness.passedChecks===report.readiness.totalChecks?`Your site passed all ${report.readiness.totalChecks} site checks.`:`Your site passed ${report.readiness.passedChecks} of ${report.readiness.totalChecks} site checks.`);
 if(report.visibility.status==="available")sentences.push(report.visibility.mentioned?`When Strelva last asked an AI assistant, it named ${report.siteName}${report.visibility.recommended?" and recommended it":""}.`:`When Strelva last asked an AI assistant, it didn't name ${report.siteName} yet.`);
 if(report.businessOutcome)sentences.push(`Across your business: ${report.businessOutcome.line.text}`);
 const who=(id:string)=>id==="strelva"||id==="system"?"Strelva":options.actors?.[id]??"";
 // Only published changes reached visitors; a saved draft is not a change to the site.
 const published=report.changes.filter(change=>change.published).slice(-5);
 const what=(change:WebsiteMonthlyReport["changes"][number])=>change.summary?.trim()||"published a change to the site";
 const said=(change:WebsiteMonthlyReport["changes"][number])=>{const actor=who(change.createdBy);const phrase=what(change);return actor?`${actor} ${phrase}.`:`${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}.`;};
 const mattered=published[published.length-1];
 const changes=published.slice(0,-1).reverse().map(change=>({date:reportDay(change.createdAt),text:`${what(change).charAt(0).toUpperCase()}${what(change).slice(1)}`,who:who(change.createdBy)}));
 const seeUrl=options.systemUrl??new URL(`/workspace?${new URLSearchParams({view:"system",system:report.workId,workspaceId:report.workspaceId})}`,CONTROL_PLANE_URL).toString();
 return{subject:`${report.siteName}: your ${month} recap`,preheader:lead?.text??`Your ${month} recap for ${report.siteName}.`,sender:report.siteName,senderDetail:"",
  footer:"This comes once a month. A count that couldn't be read is left out, never shown as zero.",
  blocks:[
   ...(lead?[{kind:"lead" as const,...lead}]:[{kind:"paragraph" as const,text:"Inquiries and bookings couldn't be counted this month. Nothing is lost."}]),
   ...(sentences.length?[{kind:"paragraph" as const,text:sentences.join(" "),muted:true}]:[]),
   ...(mattered?[{kind:"rule" as const},{kind:"change" as const,label:"The change that mattered",text:said(mattered),date:reportDay(mattered.createdAt),link:{label:"See it",url:seeUrl}}]:[]),
   ...(changes.length?[{kind:"label" as const,text:"Also changed"},{kind:"changes" as const,rows:changes}]:[]),
   {kind:"actions",actions:[{label:`Open ${report.siteName}`,url:openUrl,style:"primary"}],full:false}]};
}
/** Shared transport enforces the existing tenant email gate. No recipient is inferred. */
export async function sendWebsiteMonthlyReport(report:WebsiteMonthlyReport,recipient:string,actor:WorkspaceActor){
 const to=z.string().email().parse(recipient);if(!report.tenantId)return{status:"suppressed" as const,reason:"website_not_published"};
 await websiteDocumentStore.managePublishedTenant(actor,{workspaceId:report.workspaceId,workId:report.workId,tenantId:report.tenantId});
 if(to.trim().toLowerCase()!==actor.verifiedEmail.trim().toLowerCase()){const {WorkspaceAccessError}=await import("@/platform/workspaces/types");throw new WorkspaceAccessError("Reports can be sent only to the verified current owner.");}
 return deliverWebsiteMonthlyReport({...report,tenantId:report.tenantId},to);
}

/** Transport only. Callers have already checked who may send and resolved the recipient server-side. */
async function deliverWebsiteMonthlyReport(report:WebsiteMonthlyReport&{tenantId:string},to:string){
 if(process.env.STRELVA_WEBSITE_REPORT_EMAIL_ENABLED!=="1"||emailSendingPaused()||customerEmailPaused()||await getClientEmailOverride(report.tenantId)==="off"){const suppressed={status:"suppressed" as const,reason:"website_report_email_disabled"};await recordCatalogReport({tenantId:report.tenantId,kind:"hosted_monthly",period:report.month,status:"suppressed",recipient:to,reason:suppressed.reason});return suppressed;}
 if(businessOutcomeReportsEnabled()){
  const grouped=await readBusinessOutcomeReports([report.tenantId],report.month);
  if(grouped===null){const held={status:"suppressed" as const,reason:"business_outcome_grouping_unavailable"};await recordCatalogReport({tenantId:report.tenantId,kind:"hosted_monthly",period:report.month,status:"suppressed",recipient:to,reason:held.reason});return held;}
  const current=grouped.find(row=>row.workspaceId===report.workspaceId);
  report={...report,businessOutcome:current};
 }
 const send=()=>sendEmailWithReceipt({audience:"client",workspaceId:report.workspaceId,tenantId:report.tenantId,to,fromAddress:"report@updates.strelva.com",subject:`${report.siteName}: ${report.month} monthly recap`,idempotencyKey:`website-report:${report.workId}:${report.month}`,options:{heading:`${report.siteName}: ${report.month} monthly recap`,paragraphs:["Counts come from your native inquiry and booking records. Unavailable measurements are shown below.","Assistant citation results reflect one saved answer. Website readiness checks do not measure whether an assistant names your business.",...(report.businessOutcome?[`Across your business: ${report.businessOutcome.line.text}`]:[])],rows:[{label:"Inquiries (recent retained records)",value:report.inquiries.count===null?"Unavailable":String(report.inquiries.count)},{label:"Bookings scheduled in this period",value:report.bookings.scheduledInPeriod===null?"Unavailable":String(report.bookings.scheduledInPeriod)},{label:"Verified calendar writes",value:report.bookings.providerVerified===null?"Unavailable":String(report.bookings.providerVerified)},{label:"Saved assistant citation check",value:report.visibility.status==="available"?`${report.visibility.mentioned?"Named":"Not named"}; ${report.visibility.recommended?"recommended":"not recommended"} in this check`:"Not measured"},{label:"Website readiness checks",value:report.readiness.status==="available"?`${report.readiness.passedChecks} of ${report.readiness.totalChecks} passed`:"Not measured"},{label:"Website history",value:String(report.changes.length)},...(report.businessOutcome?.line.figures.map(figure=>({label:`Business ${figure.label} (${figure.kind})`,value:String(figure.value)}))??[])],button:{label:"Open website recap",url:new URL(`/workspace?${new URLSearchParams({workspaceId:report.workspaceId,view:"websites",work:report.workId})}`,CONTROL_PLANE_URL).toString()},paper:websiteReportPaper(report,new URL(`/workspace?${new URLSearchParams({workspaceId:report.workspaceId,view:"websites",work:report.workId})}`,CONTROL_PLANE_URL).toString())}}).then(async delivery=>{await recordCatalogReport({tenantId:report.tenantId,kind:"hosted_monthly",period:report.month,status:delivery.status,recipient:to,reason:delivery.status==="suppressed"?delivery.reason:null,providerMessageId:delivery.status==="accepted"?delivery.providerMessageId:null});return delivery;}).catch(async error=>{await recordCatalogReport({tenantId:report.tenantId,kind:"hosted_monthly",period:report.month,status:"failed",recipient:to,reason:"native_report_delivery_failed"});throw error;});
 return report.businessOutcome?deliverBusinessOutcomeReport(report.businessOutcome,report.month,send):send();
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
 const { websiteRebuildReleaseMayBeOn, websiteRebuildReleaseEnabledForWorkspace }=await import("./rebuild-release");
 if(!websiteRebuildReleaseMayBeOn())return{tenants:[] as string[],sent:0,suppressed:0,errors:[] as string[]};
 const { getSupabase }=await import("@/platform/infra/db/client");
 const { WorkspaceStoreError }=await import("@/platform/workspaces/types");
 const db=getSupabase();if(!db)throw new WorkspaceStoreError("Website report storage is unavailable.");
 // Owners get the report only where the rebuild is on for their business (per row under `workspace`).
 const listed=await websiteDocumentStore.listPublished();
 const released=await Promise.all(listed.map(row=>websiteRebuildReleaseEnabledForWorkspace(row.workspaceId).catch(()=>false)));
 const published=listed.filter((_row,index)=>released[index]);
 const grouped=await readBusinessOutcomeReports(published.flatMap(row=>row.tenantId?[row.tenantId]:[]),month);
 if(grouped===null)return{tenants:published.flatMap(row=>row.tenantId?[row.tenantId]:[]),sent:0,suppressed:published.length,errors:["Business outcome grouping is unavailable; report delivery suppressed"]};
 const byBusiness=new Map(grouped.map(row=>[row.workspaceId,row]));
 const result={tenants:[...new Set([...published.flatMap(row=>row.tenantId?[row.tenantId]:[]),...grouped.flatMap(row=>row.tenantIds)])],sent:0,suppressed:0,errors:[] as string[]};
 for(const site of published.filter(row=>!byBusiness.has(row.workspaceId)||byBusiness.get(row.workspaceId)!.primaryTenantId===row.tenantId)){
  try{
   const {data,error}=await (db as unknown as WorkspaceDb).from("workspace_memberships").select("user_id").eq("workspace_id",site.workspaceId).eq("role","owner").order("created_at",{ascending:true}).limit(1);
   if(error)throw new WorkspaceStoreError("No current workspace owner could be confirmed.");
   if(!data?.[0]){if(site.tenantId)await recordCatalogReport({tenantId:site.tenantId,kind:"hosted_monthly",period:month,status:"suppressed",recipient:null,reason:"owner_not_accepted"});result.errors.push(`${site.tenantId??site.workId}: no owner has accepted this business yet; invite one (scripts/business-ownership.ts)`);continue;}
   const identity=await db.auth.admin.getUserById(z.string().uuid().parse(data[0].user_id));
   const user=identity.data.user;if(identity.error||!user?.email||!user.email_confirmed_at)throw new WorkspaceStoreError("No verified workspace owner could be confirmed.");
   const delivery=await sendCronWebsiteMonthlyReport({userId:user.id,verifiedEmail:user.email.trim().toLowerCase()},site.workId,month);
   if(delivery.status==="accepted")result.sent++;else result.suppressed++;
  }catch{result.errors.push(`${site.tenantId??site.workId}: native monthly report could not be confirmed`);}
 }
 return result;
}
