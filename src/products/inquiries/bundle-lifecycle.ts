import {stateForReceive} from "./receive";
import {InquiryEngine} from "./inquiry-engine";
import {bundleInquiryDefinition} from "./bundle";
import {proposePatternUpdate,resolvePatternUpdate,stagePatternUpdate,stagePatternDefinition,type PatternInstallation,type PatternConflictResolution} from "./inquiry-pattern-updates";
import type {InquiryEngineState} from "./contracts";
/** The destination's real installation owns local routing, accounts and records.
 * Qualified shape only enters the ordinary explicit-conflict draft workflow. */
export function prepareBundleInquiryUpdate(raw:unknown,input:{state:InquiryEngineState;businessId:string;capabilityId:string;sourceBusinessId:string;sourceVersion:number;actorId:string;now:string;resolutions?:PatternConflictResolution[]}){
 const engine=new InquiryEngine({businessId:input.businessId,state:stateForReceive({businessId:input.businessId,state:input.state}),now:()=>input.now,idFactory:()=>crypto.randomUUID()});
 const installation=(input.state as InquiryEngineState & {patternInstallations?:PatternInstallation[]}).patternInstallations?.find(i=>i.capabilityId===input.capabilityId);
 if(!installation)throw new Error("The native pattern installation is unavailable.");
 const capability=input.state.capabilities.find(c=>c.id===input.capabilityId),current=input.state.requests.find(r=>r.id===capability?.activeRequestId);
 const source=bundleInquiryDefinition(raw,{sourceId:installation.sourceCapabilityId,sourceBusinessId:input.sourceBusinessId,sourceVersion:input.sourceVersion,now:input.now});
 if(input.sourceVersion===installation.sourceVersion){
  const currentDefinition=current?.draft??capability?.live;if(!currentDefinition)throw new Error("The native pattern definition is unavailable.");
  const candidates=[{path:"name",before:installation.lastTargetShape.name,local:currentDefinition.name,value:source.name},{path:"form.title",before:installation.lastTargetShape.form.title,local:currentDefinition.form.title,value:source.form.title},{path:"form.intro",before:installation.lastTargetShape.form.intro,local:currentDefinition.form.intro,value:source.form.intro},{path:"form.fields",before:installation.lastTargetShape.form.fields,local:currentDefinition.form.fields,value:source.form.fields},{path:"routing.withinMinutes",before:installation.lastTargetShape.routing?.withinMinutes,local:currentDefinition.routing?.withinMinutes,value:source.routing?.withinMinutes}];
  const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value!==null&&typeof value==="object"?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>`${JSON.stringify(key)}:${canonical(v)}`).join(",")}}`:JSON.stringify(value)??"undefined";
  const equal=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
  const changes=candidates.filter(c=>!equal(c.value,c.local)),conflicts=changes.filter(c=>!equal(c.local,c.before)&&!equal(c.local,c.value)).map(c=>({path:c.path,sourceBefore:c.before??null,sourceAfter:c.value??null,localValue:c.local??null,reason:"local_edit_and_source_update" as const}));
  if(conflicts.length&&!input.resolutions)return {state:input.state,work:null,conflicts};
  const expected=new Set(conflicts.map(c=>c.path)),seen=new Set<string>();for(const r of input.resolutions??[]){if(!expected.has(r.path)||seen.has(r.path)||!["local","source"].includes(r.choice))throw new Error("The native draft conflict choice is invalid.");seen.add(r.path);}if(seen.size!==expected.size)throw new Error("Choose every native draft conflict.");
  const target=structuredClone(currentDefinition);let changed=false;
  for(const c of changes){if(conflicts.some(f=>f.path===c.path)&&input.resolutions?.find(r=>r.path===c.path)?.choice==="local")continue;if(equal(c.value,c.local))continue;changed=true;switch(c.path){case "name":target.name=source.name;break;case "form.title":target.form.title=source.form.title;break;case "form.intro":target.form.intro=source.form.intro;break;case "form.fields":target.form.fields=structuredClone(source.form.fields);target.record.fields=structuredClone(source.record.fields);break;case "routing.withinMinutes":if(target.routing&&source.routing)target.routing.withinMinutes=source.routing.withinMinutes;break;}}
  if(!changed&&current?.draft)return {state:engine.snapshot(),work:current,conflicts:[]};target.version++;target.updatedAt=input.now;
  const staged=stagePatternDefinition(engine,{definition:target,capabilityId:input.capabilityId,baseTargetVersion:currentDefinition.version,actorId:input.actorId,now:input.now});return {state:engine.snapshot(),work:staged.work,conflicts:[]};
 }
 const proposal=proposePatternUpdate(engine,{capabilityId:input.capabilityId,sourceDefinition:source,sourceVersion:input.sourceVersion,now:input.now});
 if(proposal.conflicts.length&&!input.resolutions)return {state:input.state,work:null,conflicts:proposal.conflicts};
 const resolution=resolvePatternUpdate(proposal,input.resolutions??[],input.now);
 const staged=stagePatternUpdate(engine,{proposal,resolution,actorId:input.actorId,now:input.now});
 return {state:engine.snapshot(),work:staged.work,conflicts:[]};
}
