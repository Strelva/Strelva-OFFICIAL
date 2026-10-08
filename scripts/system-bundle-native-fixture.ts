import {InquiryEngine} from "../src/products/inquiries";
import {siteDocumentHash,siteDocumentSchema} from "../src/products/websites";
import { writeFileSync } from "node:fs";
import { createApplicationDraft, rehearseApplicationPackage } from "../src/products/applications/server";
import { prepareBundleInquiry, rehearseBundleInquiry,prepareBundleInquiryUpdate } from "../src/products/inquiries";
import { prepareBundleWebsiteSection, rehearseBundleWebsiteSection,prepareBundleWebsiteUpdate } from "../src/products/websites";
const owner="bb000000-0000-4000-8000-000000000002",agency="bb000000-0000-4000-8000-000000000001",business="bb000000-0000-4000-8000-000000000011",source="bb000000-0000-4000-8000-000000000010",now="2026-10-07T10:00:00.000Z";
const app={kind:"internal_app",title:"Tracker",fields:[{id:"need",label:"Need",type:"text",required:true}],components:[{kind:"form",fields:["need"]},{kind:"list",fields:["need"]}]};
const inquiry={kind:"inquiry_pattern",name:"Intake",title:"How can we help?",intro:"Tell your team what you need.",fields:[{id:"name",label:"Name",kind:"text",required:true},{id:"email",label:"Email",kind:"email",required:true}],routingWithinMinutes:60};
const faq={kind:"website_section",title:"Common questions",items:[{question:"How do I start?",answer:"Send an inquiry to our team."}]};
const definition={kind:"bundle",systems:[{key:"tracker",name:"Tracker",definition:app},{key:"inquiry",name:"Intake",definition:inquiry},{key:"faq",name:"FAQ",definition:faq}]};
const document={version:2,siteName:"Target business",theme:{palette:"warm",typeScale:"standard"},pages:[{path:"/",title:"Home",description:"",root:"root"},{path:"/services",title:"Services",description:"",root:"services"}],nodes:{root:{id:"root",type:"Section",variant:"container",props:{},children:[],factIds:[]},services:{id:"services",type:"Section",variant:"container",props:{},children:[],factIds:[]}},facts:{target_service:{text:"Target-owned existing service",kind:"service",highRisk:false,origin:"owner_confirmed",sources:[]}},assets:{target_logo:{url:"/tenant-media/target-logo.png",alt:"Target-owned existing logo"}},redirects:[],provenance:{composer:"rules"}};
const base={version:2,revision:1,title:"Business website",input:{requestId:"native-target",description:"Target owned website",businessName:"Target business"},status:"review_ready",stages:[],checkpoint:null,sourceAudit:null,audit:null,pageMapping:[],skippedPaths:[],candidate:{revision:1,contentHash:"a".repeat(64),document,previewHref:"/api/websites/bb000000-0000-4000-8000-000000000100/preview"},approvedCandidateRevision:null,tenantId:"bundle-target",launch:{receipt:null,readBack:null},lastError:null,createdBy:owner,createdAt:now,history:[{revision:1,kind:"candidate",actorId:owner,at:now}]};
const first=prepareBundleInquiry(inquiry,{sourceBusinessId:source,sourceId:"source:inquiry",businessId:business,actorId:owner,state:null,now});
const second=prepareBundleInquiry(inquiry,{sourceBusinessId:source,sourceId:"source:inquiry",businessId:business,actorId:agency,state:first.state,now});
const {kind:_kind,...appSpec}=app;
const websiteUpdate=prepareBundleWebsiteUpdate(faq,base,{actorId:owner,now,sectionId:"bundle_bb000000000040008000000000000102",pagePath:"/services",workId:"bb000000-0000-4000-8000-000000000100"});
const inquiryUpdate=prepareBundleInquiryUpdate(inquiry,{state:second.state,businessId:business,capabilityId:first.work.capabilityId,sourceBusinessId:source,sourceVersion:1,actorId:owner,now});
const confirmedDocument=siteDocumentSchema.parse(structuredClone(websiteUpdate.document));
for(const fact of Object.values(confirmedDocument.facts))fact.origin="owner_confirmed";
for(const node of Object.values(confirmedDocument.nodes))if(node.verification)node.verification={...node.verification,needsReview:false};
const confirmedHash=siteDocumentHash(confirmedDocument);
const confirmedPayload={...websiteUpdate.payload,revision:3,history:[...(websiteUpdate.payload?.history??[]),{revision:3,kind:"owner_confirmation",actorId:owner,at:now}],candidate:{revision:3,contentHash:confirmedHash,document:confirmedDocument,previewHref:"/api/websites/bb000000-0000-4000-8000-000000000100/preview"}};
const faq2={...faq,title:"Updated common questions"},inquiry2={...inquiry,intro:"Updated creator explanation."};
const definition2={kind:"bundle",systems:[{key:"tracker",name:"Tracker",definition:app},{key:"inquiry",name:"Intake",definition:inquiry2},{key:"faq",name:"FAQ",definition:faq2}]};
const artifacts2=[{key:"tracker",kind:"internal_app",...rehearseApplicationPackage("bb000000-0000-4000-8000-000000000022",app)},{key:"inquiry",kind:"inquiry_pattern",...rehearseBundleInquiry(inquiry2)},{key:"faq",kind:"website_section",...rehearseBundleWebsiteSection(faq2)}];
const websiteUpdate2=prepareBundleWebsiteUpdate(faq2,confirmedPayload,{actorId:owner,now,sectionId:"bundle_bb000000000040008000000000000102",pagePath:"/services",workId:"bb000000-0000-4000-8000-000000000100",expectedDefinition:faq});
const websiteSecond=prepareBundleWebsiteUpdate(faq,websiteUpdate2.payload,{actorId:owner,now,sectionId:"bundle_bb000000000040008000000000000104",pagePath:"/services",workId:"bb000000-0000-4000-8000-000000000100"});
const data={websiteSecond,definition2,artifacts2,websiteUpdate2,confirmedDocument,confirmedHash,confirmedPayload,websiteUpdate,inquiryUpdate,definition,base,document,artifacts:[{key:"tracker",kind:"internal_app",...rehearseApplicationPackage("bb000000-0000-4000-8000-000000000021",app)},{key:"inquiry",kind:"inquiry_pattern",...rehearseBundleInquiry(inquiry)},{key:"faq",kind:"website_section",...rehearseBundleWebsiteSection(faq)}],ownerState:first.state,agencyState:second.state,
 ownerParts:[{key:"tracker",workId:"bb000000-0000-4000-8000-000000000101",payload:createApplicationDraft({...appSpec,maintenanceOwner:owner},{userId:owner,verifiedEmail:"owner@example.test"},true)},{key:"inquiry",capabilityId:first.work.capabilityId,requestId:first.work.id},{key:"faq",workId:"bb000000-0000-4000-8000-000000000102",...prepareBundleWebsiteSection(faq,base,{actorId:owner,name:"FAQ",pagePath:"/services",now,workId:"bb000000-0000-4000-8000-000000000102"})}],
 agencyParts:[{key:"tracker",workId:"bb000000-0000-4000-8000-000000000103",payload:createApplicationDraft({...appSpec,maintenanceOwner:agency},{userId:agency,verifiedEmail:"agency@example.test"},true)},{key:"inquiry",capabilityId:second.work.capabilityId,requestId:second.work.id},{key:"faq",workId:"bb000000-0000-4000-8000-000000000104",...prepareBundleWebsiteSection(faq,base,{actorId:agency,name:"FAQ",pagePath:"/services",now,workId:"bb000000-0000-4000-8000-000000000104"})}]};
const quote=(value:unknown)=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
async function writeNativeFixture(){
 const publisher=new InquiryEngine({businessId:business,state:second.state,now:()=>now,livePublisher:{async publish(){return {status:"accepted",acceptanceId:"fictional-native-inquiry-acceptance",acceptedAt:now,providerReceipt:{fictional:true}};}}});
 publisher.updateInquiryRules(first.work.id,{actorId:owner,routing:{destination:"owner@example.test"}});
 publisher.setEmailConnection(first.work.id,{actorId:owner,status:"connected",consent:"explicit",lastCheckedAt:now});
 const run=publisher.runRehearsal(first.work.id);if(!run.passed)throw new Error("Native fixture inquiry rehearsal failed");
 const version=publisher.getWork(first.work.id).draft!.version;
 publisher.approvePublish(first.work.id,{actorId:owner,version});await publisher.publish(first.work.id,{actorId:owner,explicit:true,version});
 publisher.recordPublishVerification(first.work.id,{actorId:owner,version,verified:true,evidence:["Fictional native provider read back the exact domain-engine publication."]});
 const publishedState=publisher.snapshot(),publishedWork=publisher.getWork(first.work.id);
 writeFileSync(process.argv[2]!,`create temp table bundle_native_input(value jsonb); insert into bundle_native_input values(${quote({...data,publishedState,publishedWork})});\n`);
}
void writeNativeFixture();
