import { describe,it,expect } from "vitest";
import { inquiryPublicationObservation } from "@/experience/systems/server";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import type { InquiryWorkspaceSnapshot } from "@/products/inquiries/repository";
describe("current inquiry publication health",()=>{
 it("uses exact current-version readback and retains failure/unknown",async()=>{
  const engine=new InquiryEngine({businessId:"business",livePublisher:{async publish(input){return {status:"accepted",acceptanceId:`accept:${input.version}`,acceptedAt:"2026-10-08T12:00:00Z"};}}});
  const work=engine.start({actorId:"owner",intent:"seller inquiry"});
  engine.acceptShape(work.id,{actorId:"owner"});
  engine.setEmailConnection(work.id,{actorId:"owner",status:"connected",consent:"explicit",lastCheckedAt:"2026-10-08T12:00:00Z"});
  engine.runRehearsal(work.id);engine.approvePublish(work.id,{actorId:"owner"});
  const published=await engine.publish(work.id,{actorId:"owner",explicit:true});
  const snapshot=():InquiryWorkspaceSnapshot=>({businessId:"business",tenantId:"acme",tenantStableId:null,revision:1,stateVersion:1,state:{...engine.snapshot(),inquiries:[]},updatedAt:"2026-10-08T12:00:00Z"});
  expect(inquiryPublicationObservation("system",snapshot()).outcome).toBe("unknown");
  engine.recordPublishVerification(work.id,{actorId:"owner",version:published.receipt.targetVersion,verified:true,evidence:["Actual-version fixture readback"]});
  expect(inquiryPublicationObservation("system",snapshot()).outcome).toBe("pass");
  const stale=snapshot();stale.state.capabilities[0]!.live!.version+=1;
  expect(inquiryPublicationObservation("system",stale).outcome).toBe("unknown");
  const failed=snapshot();
  failed.state.changes.find(change=>change.id===published.receipt.id)!.verification!.verified=false;
  expect(inquiryPublicationObservation("system",failed).outcome).toBe("fail");
  expect(inquiryPublicationObservation("system",null).outcome).toBe("unknown");
 });
});
