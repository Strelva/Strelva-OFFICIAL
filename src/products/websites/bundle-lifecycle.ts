import {websiteSectionPackageDefinitionSchema} from "@/platform/system-versions/bundle-contracts";
import {websiteRebuildSchema} from "./rebuild-contracts";
import {siteDocumentSchema,siteDocumentHash} from "./site-document";
/** Replace exactly one installed FAQ; preserve the destination's other content,
 * facts, assets and tenant. The ordinary native fact/copy/approval/launch gate owns release. */
export function prepareBundleWebsiteUpdate(raw:unknown,payload:unknown,input:{sectionId:string;pagePath:string;workId:string;actorId:string;now:string;expectedDefinition?:unknown;resolution?:"local"|"source"}){
 let shape=websiteSectionPackageDefinitionSchema.parse(raw);const base=websiteRebuildSchema.parse(payload);
 if(!base.candidate)throw new Error("The native website document is unavailable.");
 const document=structuredClone(base.candidate.document),page=document.pages.find(p=>p.path===input.pagePath);
 if(!page||!document.nodes[page.root])throw new Error("The bound website page is unavailable.");
 const current=document.nodes[input.sectionId],expected=input.expectedDefinition===undefined?null:websiteSectionPackageDefinitionSchema.parse(input.expectedDefinition);
 if(current&&expected&&JSON.stringify(current.props)!==JSON.stringify({title:expected.title,items:expected.items})&&!input.resolution)return {conflict:{path:"website_section",local:current.props,source:{title:shape.title,items:shape.items}},document:null,payload:null,contentHash:null};
 if(current&&input.resolution==="local")shape=websiteSectionPackageDefinitionSchema.parse({kind:"website_section",...current.props});
 const factId=`${input.sectionId}_review`;
 document.nodes[input.sectionId]={id:input.sectionId,type:"Faq",variant:"accordion",props:{title:shape.title,items:shape.items},children:[],factIds:[factId],verification:{supported:false,confidence:0,needsReview:true}};
 document.facts[factId]={text:"Review this updated FAQ wording for this business.",kind:"claim",highRisk:true,origin:"owner_stated",sources:[],verification:{supported:false,confidence:0}};
 const root=document.nodes[page.root]!;const first=root.children.indexOf(input.sectionId);root.children=first<0?[...root.children,input.sectionId]:root.children.filter((id,index)=>id!==input.sectionId||index===first);
 const parsed=siteDocumentSchema.parse(document),contentHash=siteDocumentHash(parsed),revision=base.candidate.revision+1;
 const next=websiteRebuildSchema.parse({...base,revision:base.revision+1,history:[...base.history,{revision:base.revision+1,kind:"bundle_source_update",actorId:input.actorId,at:input.now}],status:"review_ready",candidate:{revision,contentHash,document:parsed,previewHref:`/api/websites/${input.workId}/preview?revision=${revision}&contentHash=${contentHash}`},approvedCandidateRevision:null,launch:{receipt:null,readBack:null},lastError:null});
 return {document:parsed,payload:next,contentHash,conflict:null,effectiveDefinition:shape};
}
