import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import { createAgencyManagedWebsiteDraftAccessService, assertAgencyWebsiteDraftSubscription } from "@/platform/offerings/agency-website-draft";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { websiteDocumentStore } from "./document-store";
import { websiteRebuildSchema, rebuildSelectionSchema, type WebsiteRebuildRecord } from "./rebuild-contracts";
import { siteDocumentHash, siteDocumentSchema, safeSitePathSchema, type SiteDocument } from "./site-document";
import { prepareSitePatch, sitePatchSchema } from "./site-operations";
import { renderSiteDocumentHtml } from "./site-export";
import { auditRebuildHtml } from "./rebuild-audit";
import { AGENCY_DOCUMENT_NODE_SECTIONS, AGENCY_DOCUMENT_SECTIONS } from "./agency-document-contracts";
import { websiteRebuildReleaseEnabledForTenant, websiteRebuildReleaseMayBeOn } from "./rebuild-release";
import { renderRebuildPreview } from "./rebuild-export";
const uuid=z.string().uuid();
const sectionSchema=z.enum(AGENCY_DOCUMENT_SECTIONS);
export const agencyWebsiteDocumentPatchSchema=rebuildSelectionSchema.extend({bindingId:uuid,websiteWorkId:uuid,section:sectionSchema,ops:sitePatchSchema.superRefine((ops,context)=>{for(const [index,op] of ops.entries()){for(const field of ["path","from"] as const){const path=field==="path"?op.path:"from" in op?op.from:undefined;if(path&&!/^\/nodes\/[^/]+(?:\/.*)?$/.test(path))context.addIssue({code:"custom",path:[index,field],message:"Agency drafts may patch only authorized site nodes."});}}})}).strict();
export interface AgencyWebsiteDocumentView {website:WebsiteRebuildRecord|null;section:string|null;sections:string[];previewHtml:string|null;previewHref:string|null}
export function assertAgencyDocumentNodeScope(before:SiteDocument,after:SiteDocument,section:string){
 const affected=new Set(Object.keys({...before.nodes,...after.nodes}).filter(id=>!isDeepStrictEqual(before.nodes[id],after.nodes[id])));
 // Adopting or removing a subtree also changes its visibility and placement.
 // Check the whole affected subtree, even if its node JSON did not change.
 const walk=(document:SiteDocument,id:string,seen=new Set<string>())=>{if(seen.has(id))return;seen.add(id);affected.add(id);document.nodes[id]?.children.forEach(child=>walk(document,child,seen));};
 for(const id of [...affected]){const old=before.nodes[id];const next=after.nodes[id];const oldChildren=new Set(old?.children??[]);const nextChildren=new Set(next?.children??[]);if(!isDeepStrictEqual(old?.children,next?.children)){for(const child of oldChildren)walk(before,child);for(const child of nextChildren)walk(after,child);}}
 for(const id of affected)for(const node of [before.nodes[id],after.nodes[id]])if(node&&AGENCY_DOCUMENT_NODE_SECTIONS[node.type]!==section)throw new WorkspaceAccessError("This node is outside the accepted website draft section.");
}
interface AgencyDocumentDependencies {
 documents?:Pick<typeof websiteDocumentStore,"readAgencyCandidate"|"commitAgencyCandidate">;
 grants?:Pick<ReturnType<typeof createAgencyManagedWebsiteDraftAccessService>,"read">;
 subscription?:(tenantId:string)=>Promise<boolean>;
 enabled?:()=>boolean;
 /** Per client site (the grant's tenant). Default: the per-tenant release resolver. */
 enabledForTenant?:(actor:WorkspaceActor,tenantId:string)=>Promise<boolean>;
 now?:()=>string;
}
async function defaultEnabledForTenant(actor:WorkspaceActor,tenantId:string):Promise<boolean>{
 const {releaseViewerFor}=await import("@/platform/release-flags/viewer");
 return websiteRebuildReleaseEnabledForTenant(tenantId,await releaseViewerFor(actor));
}
export function createAgencyWebsiteDocumentService(dependencies:AgencyDocumentDependencies={}){
 const documents=dependencies.documents??websiteDocumentStore;const grants=dependencies.grants??createAgencyManagedWebsiteDraftAccessService();const subscription=dependencies.subscription??assertAgencyWebsiteDraftSubscription;const now=dependencies.now??(()=>new Date().toISOString());
 async function authorized(actor:WorkspaceActor,bindingId:string){
  if(!(dependencies.enabled??websiteRebuildReleaseMayBeOn)())throw new WorkspaceConflictError("Website rebuilds are not enabled.");
  const grant=await grants.read(actor,uuid.parse(bindingId));
  if(!grant||grant.status!=="active"||grant.operatorUserId!==actor.userId||Date.parse(grant.expiresAt)<=Date.parse(now()))throw new WorkspaceAccessError("The named operator's website draft grant is unavailable or expired.");
  // Per client site: the client's business row decides under `workspace`.
  // An injected `enabled` alone owns the whole decision (tests).
  const enabledForTenant=dependencies.enabledForTenant??(dependencies.enabled?async()=>true:defaultEnabledForTenant);
  if(!(await enabledForTenant(actor,grant.tenantId)))throw new WorkspaceConflictError("Website rebuilds are not enabled.");
  return{grant,subscriptionExemption:await subscription(grant.tenantId)};
 }
 async function load(actor:WorkspaceActor,bindingId:string,input:{workId?:string;section?:string}={}){
  const auth=await authorized(actor,bindingId);
  const scoped=await documents.readAgencyCandidate(actor,{bindingId,...(input.workId?{workId:uuid.parse(input.workId)}:{}),...(input.section?{section:sectionSchema.parse(input.section)}:{}),subscriptionExemption:auth.subscriptionExemption});
  if(!scoped)return{...auth,scoped:null};
  const rebuild=websiteRebuildSchema.parse(scoped.work.payload);const candidate=rebuild.candidate;
  if(input.workId&&scoped.work.id!==input.workId)throw new WorkspaceAccessError("This website is outside the draft grant.");
  if(scoped.work.productId!=="websites"||scoped.work.resourceKind!=="website"||scoped.work.workspaceId!==auth.grant.businessWorkspaceId||rebuild.tenantId!==auth.grant.tenantId||!candidate||candidate.contentHash!==siteDocumentHash(candidate.document)||!scoped.sections.includes(scoped.section)||!sectionSchema.safeParse(scoped.section).success)throw new WorkspaceAccessError("This website is outside the draft grant.");
  return{...auth,scoped:{...scoped,rebuild}};
 }
 function previewHref(scoped:NonNullable<Awaited<ReturnType<typeof load>>["scoped"]>,bindingId:string){const candidate=scoped.rebuild.candidate!;return `/api/agency-website-draft-access?${new URLSearchParams({document:"preview",bindingId,websiteWorkId:scoped.work.id,section:scoped.section,revision:String(candidate.revision),contentHash:candidate.contentHash})}`;}
 function view(bindingId:string,scoped:Awaited<ReturnType<typeof load>>["scoped"]):AgencyWebsiteDocumentView{
  return scoped?{website:{workId:scoped.work.id,workspaceId:scoped.work.workspaceId,rebuild:scoped.rebuild},section:scoped.section,sections:scoped.sections,previewHtml:renderRebuildPreview({workId:scoped.work.id,workspaceId:scoped.work.workspaceId,rebuild:scoped.rebuild},{revision:scoped.rebuild.candidate!.revision,contentHash:scoped.rebuild.candidate!.contentHash},{previewHrefBase:previewHref(scoped,bindingId)}),previewHref:previewHref(scoped,bindingId)}:{website:null,section:null,sections:[],previewHtml:null,previewHref:null};
 }
 async function read(actor:WorkspaceActor,bindingId:string,input:{workId?:string;section?:string}={}){return view(bindingId,(await load(actor,bindingId,input)).scoped);}
 async function patch(actor:WorkspaceActor,raw:unknown){
  const input=agencyWebsiteDocumentPatchSchema.parse(raw);const loaded=await load(actor,input.bindingId,{workId:input.websiteWorkId,section:input.section});const scoped=loaded.scoped;
  if(!scoped)throw new WorkspaceAccessError("No published v2 website belongs to this draft binding.");
  const candidate=scoped.rebuild.candidate!;
  if(scoped.work.id!==input.websiteWorkId||scoped.rebuild.revision!==input.expectedRevision||candidate.revision!==input.candidateRevision||candidate.contentHash!==input.candidateContentHash)throw new WorkspaceConflictError("This website changed. Reload before preparing a draft.");
  let prepared:Awaited<ReturnType<typeof prepareSitePatch>>;
  try{prepared=await prepareSitePatch({document:candidate.document,ops:input.ops,forceReview:true});}catch(error){if(error instanceof z.ZodError)throw error;throw new WorkspaceConflictError("The proposed website patch could not be applied.");}
  // Keep every existing source fact immutable. A repeated string in a changed node
  // gets fresh review evidence instead of erasing the owner's earlier decision.
  for(const [id,fact] of Object.entries(candidate.document.facts))if(!isDeepStrictEqual(fact,prepared.document.facts[id])){
   const proposed=prepared.document.facts[id];if(!proposed)throw new WorkspaceAccessError("Existing facts cannot be removed by an agency draft.");
   let suffix=0;let fresh:string;do{fresh=`${id.slice(0,90)}_agency_${candidate.revision+1}_${suffix++}`;}while(prepared.document.facts[fresh]);
   prepared.document.facts[fresh]=proposed;prepared.document.facts[id]=structuredClone(fact);
   for(const nodeId of prepared.changedNodeIds){const node=prepared.document.nodes[nodeId];if(node)node.factIds=node.factIds.map(factId=>factId===id?fresh:factId);}
  }
  for(const [id,fact] of Object.entries(prepared.document.facts))if(!candidate.document.facts[id])fact.verification={supported:false,confidence:0};
  prepared.document=siteDocumentSchema.parse(prepared.document);prepared.contentHash=siteDocumentHash(prepared.document);
  assertAgencyDocumentNodeScope(candidate.document,prepared.document,scoped.section);
  if(prepared.governance.action==="block")throw new WorkspaceConflictError(prepared.governance.reason);
  if(!prepared.changedNodeIds.length)throw new WorkspaceConflictError("This patch does not change the website.");
  const documentRevision=candidate.revision+1;const workRevision=scoped.rebuild.revision+1;
  const nextCandidate={revision:documentRevision,contentHash:prepared.contentHash,document:prepared.document,previewHref:`/api/websites/${scoped.work.id}/preview?revision=${documentRevision}&contentHash=${prepared.contentHash}`};
  const audit=scoped.rebuild.sourceAudit?{scope:"html" as const,before:scoped.rebuild.sourceAudit,after:auditRebuildHtml(renderSiteDocumentHtml(prepared.document,"/",{canonicalUrl:`https://${loaded.grant.tenantId}.strelva.com`,tenant:loaded.grant.tenantId}),`https://${loaded.grant.tenantId}.strelva.com`),checkedAt:now(),unavailable:["PageSpeed and Lighthouse performance","Response security headers","AI assistant visibility","Live hosted response"]}:null;
  const payload=websiteRebuildSchema.parse({...scoped.rebuild,revision:workRevision,status:"review_ready",candidate:nextCandidate,approvedCandidateRevision:null,checkpoint:null,lastError:null,audit,history:[...scoped.rebuild.history,{revision:workRevision,kind:"agency_document_draft",actorId:actor.userId,at:now()}]});
  if(Buffer.byteLength(JSON.stringify(payload),"utf8")>1_950_000)throw new WorkspaceStoreError("This website draft exceeds its saved-work size limit.");
  // Atomic storage rechecks grant/assignment/native sponsor, scope and both CAS
  // identities; it does not impersonate the sponsor or publish the live site.
  const work=await documents.commitAgencyCandidate(actor,{bindingId:input.bindingId,workId:input.websiteWorkId,section:scoped.section,expectedWorkRevision:input.expectedRevision,expectedRevision:input.candidateRevision,expectedCandidateRevision:input.candidateRevision,expectedCandidateHash:input.candidateContentHash,document:prepared.document,payload,subscriptionExemption:loaded.subscriptionExemption});
  return view(input.bindingId,{...scoped,work,rebuild:websiteRebuildSchema.parse(work.payload)});
 }
 async function preview(actor:WorkspaceActor,bindingId:string,raw:unknown){
  const input=z.object({workId:uuid,section:sectionSchema,revision:z.coerce.number().int().positive(),contentHash:z.string().regex(/^[a-f0-9]{64}$/),page:safeSitePathSchema.default("/")}).strict().parse(raw);
  const scoped=(await load(actor,bindingId,{workId:input.workId,section:input.section})).scoped;
  if(!scoped)throw new WorkspaceAccessError();const candidate=scoped.rebuild.candidate!;
  if(candidate.revision!==input.revision||candidate.contentHash!==input.contentHash)throw new WorkspaceConflictError("This private preview changed. Reload the saved draft.");
  if(!candidate.document.pages.some(page=>page.path===input.page))throw new WorkspaceConflictError("This page is not in the saved website draft.");
  return{html:renderRebuildPreview({workId:scoped.work.id,workspaceId:scoped.work.workspaceId,rebuild:scoped.rebuild},input,{previewHrefBase:previewHref(scoped,bindingId)}),contentHash:candidate.contentHash};
 }
 return{read,patch,preview};
}
const service=createAgencyWebsiteDocumentService();
export const readAgencyWebsiteDocument=service.read;
export const patchAgencyWebsiteDocument=service.patch;

export const previewAgencyWebsiteDocument=service.preview;
