import {readFileSync,writeFileSync} from "node:fs";
import {durableState,InquiryEngine,prepareBundleInquiryUpdate,stateForReceive} from "../src/products/inquiries";
import type {InquiryEngineState} from "../src/products/inquiries/contracts";
async function run(){
const input=JSON.parse(readFileSync(process.argv[2]!,"utf8")) as {snapshot:{state:InquiryEngineState;capabilityId:string};definition:unknown};
const businessId="bb000000-0000-4000-8000-000000000011",actorId="bb000000-0000-4000-8000-000000000002";
if(input.snapshot.state.inquiries.length||!input.snapshot.state.timeline.length)throw new Error("Expected actual canonical SQL state with received-record evidence");
const prepared=prepareBundleInquiryUpdate(input.definition,{state:input.snapshot.state,businessId,capabilityId:input.snapshot.capabilityId,sourceBusinessId:"bb000000-0000-4000-8000-000000000010",sourceVersion:1,actorId,now:new Date().toISOString()});
if(!prepared.work)throw new Error("Expected a staged native local Version draft");
const state=durableState(prepared.state,businessId);
if(JSON.stringify(state.timeline)!==JSON.stringify(input.snapshot.state.timeline)||state.inquiries.length)throw new Error("Native preparation lost canonical records evidence");
const data=JSON.stringify({...prepared,state,effectiveDefinition:input.definition}).replaceAll("'","''");
writeFileSync(process.argv[3]!,`create temporary table bundle_durable_artifact(value jsonb);insert into bundle_durable_artifact values('${data}'::jsonb);\n`);
// A second mode reads the actually committed SQL candidate and drives the
// existing native exact rehearsal/owner decision through a fictional port.
if(process.argv[4]){
 const engine=new InquiryEngine({businessId,state:stateForReceive({businessId,state}),now:()=>new Date().toISOString(),livePublisher:{async publish(){return {status:"accepted",acceptanceId:"fictional-durable-native-acceptance",acceptedAt:new Date().toISOString(),providerReceipt:{fictional:true}};}}});
 const version=prepared.work.draft!.version;if(!engine.runRehearsal(prepared.work.id).passed)throw new Error("Durable native rehearsal failed");engine.approvePublish(prepared.work.id,{actorId,version});await engine.publish(prepared.work.id,{actorId,version,explicit:true});engine.recordPublishVerification(prepared.work.id,{actorId,version,verified:true,evidence:["Fictional exact native port readback"]});
 const published=JSON.stringify({state:durableState(engine.snapshot(),businessId),work:engine.getWork(prepared.work.id)}).replaceAll("'","''");writeFileSync(process.argv[4],`create temporary table bundle_durable_publication(value jsonb);insert into bundle_durable_publication values('${published}'::jsonb);\n`);
}

}
void run();
