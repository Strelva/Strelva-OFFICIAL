import { websiteSectionPackageDefinitionSchema } from "@/platform/system-versions/bundle-contracts";
import { siteDocumentSchema, siteDocumentHash } from "./site-document";
import { websiteRebuildSchema } from "./rebuild-contracts";
export function prepareBundleWebsiteSection(raw:unknown,payload:unknown,input:{actorId:string;name:string;pagePath:string;now:string;workId:string}) {
 const definition=websiteSectionPackageDefinitionSchema.parse(raw),base=websiteRebuildSchema.parse(payload);
 if(!base.candidate)throw new Error("This website needs a native document before installing a section.");
 if(!base.candidate.document.pages.some(p=>p.path===input.pagePath))throw new Error("Choose a page owned by this website.");
 const sectionId=`bundle_${input.workId.replaceAll("-","")}`,factId=`${sectionId}_review`,rootId=`${sectionId}_root`;
 // The install grant names this section, not the destination's existing pages,
 // private facts or assets. Original-site merging is an owner-private workflow.
 const document=siteDocumentSchema.parse({version:2,siteName:input.name,theme:{palette:"warm",typeScale:"standard"},pages:[{path:"/",title:definition.title,description:"",root:rootId}],nodes:{[rootId]:{id:rootId,type:"Section",variant:"container",props:{},children:[sectionId],factIds:[]},[sectionId]:{id:sectionId,type:"Faq",variant:"accordion",props:{title:definition.title,items:definition.items},children:[],factIds:[factId],verification:{supported:false,confidence:0,needsReview:true}}},facts:{[factId]:{text:"Review the installed FAQ wording for this business.",kind:"claim",highRisk:true,origin:"owner_stated",sources:[],verification:{supported:false,confidence:0}}},assets:{},redirects:[],provenance:{composer:"rules"}});
 const parsed=siteDocumentSchema.parse(document),contentHash=siteDocumentHash(parsed);
 const draft=websiteRebuildSchema.parse({...base,revision:0,title:input.name,input:{requestId:input.workId,description:"Install an owner-reviewed FAQ section as an isolated website Version.",businessName:document.siteName},status:"review_ready",checkpoint:null,stages:[],sourceAudit:null,audit:null,pageMapping:[],skippedPaths:[],candidate:{revision:1,contentHash,document:parsed,previewHref:`/api/websites/${input.workId}/preview?revision=1&contentHash=${contentHash}`},approvedCandidateRevision:null,launch:{receipt:null,readBack:null},lastError:null,createdBy:input.actorId,createdAt:input.now,history:[]});
 return {document:parsed,payload:draft,contentHash,sectionId};
}
export function rehearseBundleWebsiteSection(definition:unknown) {
 const actorId="aaaaaaaa-0000-4000-8000-000000000001",now="2026-10-07T00:00:00.000Z",workId="aaaaaaaa-0000-4000-8000-000000000002";
 const document={version:2,siteName:"Synthetic rehearsal",theme:{palette:"warm",typeScale:"standard"},pages:[{path:"/",title:"Synthetic",description:"",root:"root"}],nodes:{root:{id:"root",type:"Section",variant:"container",props:{},children:[],factIds:[]}},facts:{},assets:{},redirects:[],provenance:{composer:"rules"}};
 const payload={version:2,revision:1,title:"Synthetic",input:{requestId:"native-rehearsal",description:"Synthetic native document",businessName:"Synthetic"},status:"review_ready",stages:[],checkpoint:null,candidate:{revision:1,contentHash:"a".repeat(64),document,previewHref:`/api/websites/${workId}/preview`},approvedCandidateRevision:null,tenantId:null,launch:{receipt:null,readBack:null},lastError:null,createdBy:actorId,createdAt:now,history:[]};
 return prepareBundleWebsiteSection(definition,payload,{actorId,name:"Synthetic FAQ",pagePath:"/",now,workId});
}
