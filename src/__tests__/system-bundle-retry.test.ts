import {describe,it,expect,vi} from "vitest";
import {installSystemBundle,readBundleTargetChoices} from "@/experience/workspace/agency/bundle-server";
const id="bb000000-0000-4000-8000-000000000001",workspaceId="bb000000-0000-4000-8000-000000000011",revisionId="bb000000-0000-4000-8000-000000000021";
const actor={userId:id,verifiedEmail:"agency@example.test"};
describe("bundle scoped retry",()=>{
 it("completed retry reads only immutable component receipt",async()=>{
 const receipt={workspaceId,bundleId:id,sourceRevisionId:revisionId,outcome:"drafts_created",components:[{key:"app",name:"App",kind:"internal_app",systemId:id,versionId:id,openHref:"/workspace",status:"draft"}]};
 const rpc=vi.fn(async(_name:string,_args:Record<string,unknown>)=>({data:receipt,error:null}));
 expect(await installSystemBundle(actor,{workspaceId,commandId:id,name:"Package",source:{businessId:id,systemId:id,revisionId,number:1}}, {kind:"bundle",systems:[]},{rpc})).toEqual(receipt);
 expect(rpc.mock.calls).toHaveLength(1);expect(rpc.mock.calls[0]?.[0]).toBe("read_system_bundle_install_receipt");
 });
 it("target choices never accept raw inquiry state or website payload",async()=>{
 const rpc=vi.fn(async(_name:string,_args:Record<string,unknown>)=>({data:{workspaceId,revisionId,commandId:id,boundTargets:null,inquiry:[{tenantId:"own",label:"Own",state:{inquiries:["private"]}}],websites:[]},error:null}));
 await expect(readBundleTargetChoices(actor,workspaceId,revisionId,id,{rpc})).rejects.toThrow();
 expect(rpc.mock.calls[0]?.[0]).toBe("read_system_bundle_target_choices");
 });
});
