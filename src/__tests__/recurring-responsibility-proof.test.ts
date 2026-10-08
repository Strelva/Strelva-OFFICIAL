import { describe, expect, it } from "vitest";
import { responsibilityProofCard, responsibilityVerdict, addNativeResponsibilityEvidence, keepMeFoundInputSchema } from "@/platform/work-execution/responsibility-proof";
import { createStandingResponsibility } from "@/platform/work-execution/standing";
import { createKeepMeFoundBundle, snapshotResponsibilityMeter, setProviderResponsibilityCadence, snapshotDueResponsibilityMeters } from "@/products/operations/server";
import type { StandingRunsRecord } from "@/platform/work-execution/standing-repository";
import { createMemoryReceiptStore } from "@/products/google-listing/receipts";
const owner="00000000-0000-4000-8000-000000000001", business="00000000-0000-4000-8000-000000000002", standing="00000000-0000-4000-8000-000000000003";
const at="2026-10-06T10:00:00.000Z", from="2026-10-01T00:00:00.000Z", to="2026-10-08T00:00:00.000Z";
const actor={userId:owner,verifiedEmail:"owner@example.test"};
function record(status: "completed"|"failed"|"waiting"="completed", result: unknown={finding:{result:"agreement",sourceCount:2,differenceCount:0}}): StandingRunsRecord {
 const policy=createStandingResponsibility({title:"Google replies",intent:"Check saved sources",scope:{steps:[{id:"check",operation:"investigation.run",workId:business,input:{},maximumCents:0}]},trigger:{kind:"manual"}},owner,at);
 return {policy:{id:standing,workspaceId:business,policy},jobs:[],runs:[{id:standing,standingResponsibilityId:standing,jobId:standing,finiteWorkId:standing,triggerKey:"weekly:1",policyVersion:1,status,attempt:1,createdAt:at,updatedAt:at,receipts:[{id:standing,runId:standing,stepId:"check",attempt:1,status:status==="completed"?"completed":status,effect:"none",result,createdAt:at,finishedAt:at}]}]};
}
describe("receipt-backed responsibility proof",()=>{
 it("does not certify a responsibility from a completed arbitrary saved-source check",()=>{const card=responsibilityProofCard(record(),from,to);expect(card.status).toBe("unverified");expect(card.verified).toContain("saved-source check");expect(card.undoHref).toBeNull();});
 it("shows missing, failed and unavailable evidence honestly",()=>{expect(responsibilityProofCard({...record(),runs:[]},from,to).status).toBe("unverified");expect(responsibilityProofCard(record("failed"),from,to).status).toBe("failed");expect(responsibilityProofCard(record("completed",{finding:{result:"unavailable",sourceCount:1,differenceCount:0}}),from,to).status).toBe("unverified");});
 it("uses provider acceptance + matched readback, preserving accepted-unverified state and undo",async()=>{
  const store=createMemoryReceiptStore(()=>at);
  const posted=await store.record({workspaceId:business,bindingId:null,locationId:"location1",action:"reply_post",targetRef:"review1",authority:{kind:"owner_approval",actor:owner},before:null,after:{comment:"Thanks"},undo:{kind:"delete_reply",reviewId:"review1"},idempotencyKey:"responsibility:reply1"});
  const accepted=await store.settle(posted.receipt.id,business,{status:"posted_unverified",readback:"failed",providerRef:"google:1"});
  expect(responsibilityProofCard(record(),from,to,[accepted]).status).toBe("unverified");
  const verified=await store.settle(accepted.id,business,{status:"posted",readback:"matched"});
  expect(responsibilityProofCard(record(),from,to,[verified]).status).toBe("verified");
  expect(responsibilityProofCard(record(),from,to,[verified,accepted]).status).toBe("partial");
  expect(responsibilityProofCard(record(),from,to,[verified]).undoHref).toContain("/workspace/google");
  expect(responsibilityProofCard(record(),from,to,[{...verified,workspaceId:owner}]).status).toBe("unverified");
  expect(responsibilityVerdict([responsibilityProofCard(record(),from,to,[verified])])).toContain("does not certify");
 });
 it("includes completion this week for a run admitted earlier, and excludes the end boundary",()=>{
  const r=record();r.runs[0]!.createdAt="2026-09-01T00:00:00.000Z";expect(responsibilityProofCard(r,from,to).receiptRefs).toHaveLength(1);
  r.runs[0]!.receipts[0]!.finishedAt=to;expect(responsibilityProofCard(r,from,to).receiptRefs).toHaveLength(0);
 });
});
describe("existing native responsibility evidence",()=>{
 it("keeps native health, reply measurements and report acceptance separate from maintained SLA",()=>{
  const card=responsibilityProofCard(record(),from,to);
  const health=addNativeResponsibilityEvidence(card,{responsibilityId:standing,key:"health",health:[{websiteWorkId:business,checkedAt:at,status:"healthy",evidence:"native:health"}]});
  expect(health.status).toBe("verified");expect(health.verified).toContain("not continuous uptime");
  const inquiry=addNativeResponsibilityEvidence(card,{responsibilityId:standing,key:"inquiry_reply_time",inquiries:{workspaceId:business,inquiries:2,answered:1,withinDay:1,averageReplySeconds:120,medianReplySeconds:120}});
  expect(inquiry.did).toContain("accepted by the mail provider");expect(inquiry.verified).toContain("agreed service target");
  const report=addNativeResponsibilityEvidence(card,{responsibilityId:standing,key:"weekly_proof",reports:[{id:business,status:"accepted",at,evidence:"native:report"},{id:standing,status:"failed",at,evidence:"native:failed"}]});
  expect(report.status).toBe("partial");expect(report.verified).toContain("readership are not verified");
  expect(addNativeResponsibilityEvidence(card,{responsibilityId:owner,key:"health",health:[{websiteWorkId:business,checkedAt:at,status:"healthy",evidence:"foreign"}]})).toEqual(card);
 });
});
describe("bundle and meter commands",()=>{
 const input={businessId:business,serviceRequestId:standing,providerWorkspaceId:owner,idempotencyKey:"keep-me-found:1",investigations:{gbp_replies:business,hours_sync:business,health:business,inquiry_reply_time:business,weekly_proof:business},everySeconds:604800,nextAt:to};
 it("requires exactly the five responsibilities and refuses arbitrary additional scope",()=>{expect(keepMeFoundInputSchema.safeParse(input).success).toBe(true);expect(keepMeFoundInputSchema.safeParse({...input,investigations:{...input.investigations,other:business}}).success).toBe(false);expect(keepMeFoundInputSchema.safeParse({...input,everySeconds:1}).success).toBe(false);});
 it("passes actor and stable payer/provider identities without prices or export",async()=>{const calls: unknown[]=[];const rpc=async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {data:{priced:false,stripeExportEnabled:false},error:null};};await createKeepMeFoundBundle(actor,input,rpc);await snapshotResponsibilityMeter(actor,business,"2026-10",rpc);await setProviderResponsibilityCadence(actor,business,"weekly",rpc);expect(JSON.stringify(calls)).toContain('"p_provider_id"');expect(JSON.stringify(calls)).not.toMatch(/"hours"|"compute"|priceCents/);expect(calls).toHaveLength(3);});
 it("fails closed on revoked mandates, cross agency and storage failures",async()=>{await expect(createKeepMeFoundBundle(actor,input,async()=>({data:null,error:{message:"responsibility_mandate_revoked"}}))).rejects.toThrow("mandate");await expect(createKeepMeFoundBundle(actor,input,async()=>({data:null,error:{message:"responsibility_membership_denied"}}))).rejects.toThrow("access denied");await expect(snapshotResponsibilityMeter(actor,business,"2026-99",async()=>({data:null,error:null}))).rejects.toThrow("valid");});
});

it("bounded background meter preserves isolated authority failures and never enables pricing",async()=>{
 const value={processed:1,failed:1,failures:[{businessId:business,status:"unavailable"}],priced:false,stripeExportEnabled:false};
 expect(await snapshotDueResponsibilityMeters(20,async(name,args)=>{expect(name).toBe("snapshot_due_responsibility_meters");expect(args).toEqual({p_limit:20});return {data:value,error:null};})).toEqual(value);
 await expect(snapshotDueResponsibilityMeters(101,async()=>({data:value,error:null}))).rejects.toThrow();
 await expect(snapshotDueResponsibilityMeters(20,async()=>({data:null,error:{message:"unavailable"}}))).rejects.toThrow("could not be confirmed");
});
