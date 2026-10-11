import { inquiryPackageDefinitionSchema } from "@/platform/system-versions/bundle-contracts";
import {stateForReceive} from "./receive";
import { InquiryEngine } from "./inquiry-engine";
import { patternShape } from "./inquiry-pattern-updates";
import type { InquiryCapabilityDefinition, InquiryEngineState, InquiryFieldDefinition } from "./contracts";
export function prepareBundleInquiry(raw:unknown,input:{sourceBusinessId:string;sourceId:string;businessId:string;actorId:string;state:InquiryEngineState|null;now:string}) {
 const definition=bundleInquiryDefinition(raw,input);
 const engine=new InquiryEngine({businessId:input.businessId,...(input.state?{state:stateForReceive({businessId:input.businessId,state:input.state})}:{}),now:()=>input.now,idFactory:()=>crypto.randomUUID()});
 const work=engine.copyPattern(definition.id,{sourceCapabilityId:definition.id,sourceDefinition:definition,sourceBusinessId:input.sourceBusinessId,targetBusinessId:input.businessId,targetActorId:input.actorId,destination:"your team",emailConnection:{status:"missing",consent:"missing",lastCheckedAt:null}});
 return {state:engine.snapshot(),work};
}
export function bundleInquiryDefinition(raw:unknown,input:{sourceId:string;sourceBusinessId:string;now:string;sourceVersion?:number}) {
 const shape=inquiryPackageDefinitionSchema.parse(raw);
 const fields:InquiryFieldDefinition[]=shape.fields.map(f=>({...f,component:`${f.kind}_field` as InquiryFieldDefinition["component"]}));
 const definition:InquiryCapabilityDefinition={kind:"inquiry",id:input.sourceId,businessId:input.sourceBusinessId,version:input.sourceVersion??1,name:shape.name,form:{component:"form",id:`${input.sourceId}:form`,title:shape.title,intro:shape.intro,fields,disclosure:"Strelva"},record:{component:"record_detail",type:"inquiry",singularLabel:"Inquiry",pluralLabel:"Inquiries",fields},routing:{component:"routing_rule",id:`${input.sourceId}:routing`,sentence:"Route inquiries to this business's chosen team.",destination:"your team",channel:"email",withinMinutes:shape.routingWithinMinutes},followUp:null,connections:[{id:"email",provider:"email",status:"missing",consent:"missing",lastCheckedAt:null}],createdAt:input.now,updatedAt:input.now};
 patternShape(definition);
 return definition;
}

export function rehearseBundleInquiry(definition:unknown) {
 const synthetic="aaaaaaaa-0000-4000-8000-000000000001",now="2026-10-07T00:00:00.000Z";
 const result=prepareBundleInquiry(definition,{sourceBusinessId:synthetic,sourceId:"synthetic-source",businessId:"aaaaaaaa-0000-4000-8000-000000000002",actorId:synthetic,state:null,now});
 if(result.work.publishApproval||result.state.inquiries.length||result.state.capabilities[0]?.status!=="draft")throw new Error("Native inquiry rehearsal produced an unsafe effect.");
 return result;
}
