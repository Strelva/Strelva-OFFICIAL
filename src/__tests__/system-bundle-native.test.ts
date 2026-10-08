import { expect,it } from "vitest";
import { prepareBundleInquiry } from "@/products/inquiries";
import { prepareBundleWebsiteSection } from "@/products/websites";
import { effectivePackageBehavior } from "@/platform/system-versions/declaration";
export const sourceBusinessId="bb000000-0000-4000-8000-000000000010",businessId="bb000000-0000-4000-8000-000000000011",actorId="bb000000-0000-4000-8000-000000000002",now="2026-10-07T10:00:00.000Z";
export const app={kind:"internal_app",title:"Intake tracker",fields:[{id:"need",label:"Need",type:"text",required:true}],components:[{kind:"form",fields:["need"]},{kind:"list",fields:["need"]}]};
export const inquiry={kind:"inquiry_pattern",name:"Intake",title:"How can we help?",intro:"Tell your team what you need.",fields:[{id:"name",label:"Name",kind:"text",required:true},{id:"email",label:"Email",kind:"email",required:true}],routingWithinMinutes:60};
export const website={kind:"website_section",title:"Common questions",items:[{question:"How do I start?",answer:"Send an inquiry to our team."}]};
export const definition={kind:"bundle",systems:[{key:"tracker",name:"Intake tracker",definition:app},{key:"inquiry",name:"Intake",definition:inquiry},{key:"faq",name:"FAQ",definition:website}]};
export const document={version:2,siteName:"Target business",theme:{palette:"warm",typeScale:"standard"},pages:[{path:"/",title:"Target business",description:"",root:"root"}],nodes:{root:{id:"root",type:"Section",variant:"container",props:{},children:[],factIds:[]}},facts:{},assets:{},redirects:[],provenance:{composer:"rules"}};
export const base={version:2,revision:1,title:"Business website",input:{requestId:"native-target",description:"Target owned website",businessName:"Target business"},status:"review_ready",stages:[],checkpoint:null,sourceAudit:null,audit:null,pageMapping:[],skippedPaths:[],candidate:{revision:1,contentHash:"a".repeat(64),document,previewHref:"/api/websites/bb000000-0000-4000-8000-000000000100/preview"},approvedCandidateRevision:null,tenantId:"bundle-target",launch:{receipt:null,readBack:null},lastError:null,createdBy:actorId,createdAt:now,history:[{revision:1,kind:"candidate",actorId,at:now}]};
it("aggregates all component behavior and rejects source accounts",()=>{
 const declaration=effectivePackageBehavior(definition);expect(declaration.outsideEffects).toEqual(["email","publish"]);expect(declaration.bindingKinds).toEqual(["email","website"]);expect(declaration.recordsWritten).toEqual(["application.records","inquiries","internal_tool.notices","website.document"]);
 expect(()=>effectivePackageBehavior({...inquiry,connections:[{token:"private"}]})).toThrow();expect(()=>effectivePackageBehavior({...website,assets:{private:"source"}})).toThrow();
});
it("uses actual inquiry copyPattern with fresh IDs, missing consent and no live state",()=>{
 const value=prepareBundleInquiry(inquiry,{sourceBusinessId,sourceId:"source:inquiry",businessId,actorId,state:null,now});
 expect(value.work.draft?.businessId).toBe(businessId);expect(value.work.publishApproval).toBeNull();expect(value.work.draft?.connections[0]).toMatchObject({status:"missing",consent:"missing"});expect(value.state.capabilities[0]).toMatchObject({status:"draft",live:null});expect(value.state.inquiries).toEqual([]);
 value.state.inquiries.push({id:"existing-customer-inquiry",businessId,capabilityId:value.work.capabilityId!,capabilityVersion:1,fields:{name:"Local customer"},status:"new",receivedAt:now,timelineEventIds:[],createdReceiptId:"local-receipt"});
 const next=prepareBundleInquiry(inquiry,{sourceBusinessId,sourceId:"source:inquiry",businessId,actorId,state:value.state,now});expect(next.state.inquiries).toEqual(value.state.inquiries);expect(next.state.capabilities).toHaveLength(2);expect(next.state.capabilities[0]?.id).not.toBe(next.state.capabilities[1]?.id);
});
it("creates a real isolated FAQ website document preserving target data and requiring review",()=>{
 const value=prepareBundleWebsiteSection(website,base,{actorId,name:"FAQ",pagePath:"/",now,workId:"bb000000-0000-4000-8000-000000000101"});expect(value.document.nodes[value.sectionId]?.type).toBe("Faq");expect(value.document.assets).toEqual(base.candidate.document.assets);expect(value.payload.approvedCandidateRevision).toBeNull();expect(value.payload.launch).toEqual({receipt:null,readBack:null});expect(value.document.nodes[value.sectionId]?.verification?.needsReview).toBe(true);expect(base.candidate.document.nodes.root.children).toEqual([]);
 expect(()=>prepareBundleWebsiteSection(website,base,{actorId,name:"FAQ",pagePath:"/missing",now,workId:"bb000000-0000-4000-8000-000000000101"})).toThrow();
});
