import { afterEach, describe, expect, it, vi } from "vitest";
import { replyFromWorkspace, workspaceInquiryRepliesEnabled, workspaceReplyInput, type WorkspaceReplyDependencies } from "@/products/inquiries/workspace-replies";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { readBusinessInquiryOutcomes, readBusinessOutcomeMonth } from "@/platform/business-outcomes";
const actor = { userId: "d0000000-0000-4000-8000-0000000000e2", verifiedEmail: "owner@example.test" };
const input = { workspaceId: "d0000000-0000-4000-8000-0000000000a1", rowId: "d0000000-0000-4000-8000-0000000000b1", requestId: "d0000000-0000-4000-8000-0000000000f1", subject: "Re: Party", body: "Thank you Dana. We can host 30 guests for $40 each." };
const claim = { acquired: true, id: "d0000000-0000-4000-8000-0000000000c1", status: "sending", recipient: "dana@example.test", subject: input.subject, body: input.body,
  tenantId: "mclears", replyTo: "owner@example.test", businessName: "McClear's", providerMessageId: null, acceptedAt: null };
function deps(patch: Partial<WorkspaceReplyDependencies> = {}): WorkspaceReplyDependencies {
  return { enabled: () => true, gates: vi.fn(async () => true), rpc: vi.fn(async (name) => name.startsWith("claim") ? claim : { status: "accepted" }),
    send: vi.fn(async () => ({ status: "accepted", providerMessageId: "mail-1", acceptedAt: "2026-10-06T12:00:00Z" })),
    readback: vi.fn(async () => ({ status: "available", providerMessageId: "mail-1", to: ["dana@example.test"], subject: input.subject, lastEvent: "delivered" })), ...patch };
}
afterEach(() => vi.unstubAllEnvs());
describe("owner workspace replies", () => {
  it("requires explicit flags; flags off do no storage or transport work", async () => {
    vi.stubEnv("DUAL_WRITE_PG", "1");
    expect(workspaceInquiryRepliesEnabled({})).toBe(false);
    expect(workspaceInquiryRepliesEnabled({ STRELVA_INQUIRY_RECORDS: "1" })).toBe(false);
    expect(workspaceInquiryRepliesEnabled({ STRELVA_INQUIRY_RECORDS: "1", STRELVA_INQUIRY_REPLIES: "1" })).toBe(true);
    const d = deps({ enabled: () => false }); expect((await replyFromWorkspace(actor,input,d)).status).toBe("suppressed"); expect(d.rpc).not.toHaveBeenCalled(); expect(d.send).not.toHaveBeenCalled();
  });
  it("saves owner scope and exact message before transport; provider acceptance survives failed readback", async () => {
    const d = deps({ readback: vi.fn(async () => ({ status: "unavailable", reason: "offline" })) });
    expect(await replyFromWorkspace(actor,input,d)).toMatchObject({ status: "accepted", retryable: false, providerMessageId: "mail-1" });
    expect(d.rpc).toHaveBeenNthCalledWith(1,"claim_workspace_inquiry_reply",expect.objectContaining({ p_user_id: actor.userId,p_verified_email: actor.verifiedEmail,p_lead_row_id:input.rowId,p_body:input.body }),expect.any(Function));
    expect(d.send).toHaveBeenCalledWith(expect.objectContaining({ audience: "customer",fromAddress:"hello@mail.strelva.com",replyTo:"owner@example.test",idempotencyKey:expect.stringContaining(claim.id) }));
    expect(d.rpc).toHaveBeenNthCalledWith(2,"finish_workspace_inquiry_reply",expect.objectContaining({ p_status:"accepted",p_provider_message_id:"mail-1" }));
  });
  it("never sends a duplicate, in-progress, bounced or unknown purpose", async () => {
    for(const status of ["sending","accepted","bounced","unknown"]){ const d=deps({ rpc:vi.fn(async()=>({...claim,acquired:false,status})) }); expect((await replyFromWorkspace(actor,input,d)).status).toBe(status); expect(d.send).not.toHaveBeenCalled(); }
  });
  it("suppresses at the email gates after authorized claim; no provider read", async () => {
    const d=deps({gates:vi.fn(async()=>false)}); expect((await replyFromWorkspace(actor,input,d)).status).toBe("suppressed");expect(d.send).not.toHaveBeenCalled();expect(d.readback).not.toHaveBeenCalled();
  });
  it("provider timeout closes unknown acceptance; retry uses same claim without another send", async () => {
    const rpc=vi.fn().mockResolvedValueOnce(claim).mockResolvedValueOnce({status:"unknown"}).mockResolvedValueOnce({...claim,acquired:false,status:"unknown"});
    const d=deps({rpc,send:vi.fn(async()=>{throw new Error("timeout");})}); expect((await replyFromWorkspace(actor,input,d)).status).toBe("unknown");await replyFromWorkspace(actor,input,d);expect(d.send).toHaveBeenCalledTimes(1);
  });
  it("accepted provider write is never retried when its database receipt fails", async () => {
    const d=deps({rpc:vi.fn().mockResolvedValueOnce(claim).mockRejectedValueOnce(new Error("DB down"))});expect((await replyFromWorkspace(actor,input,d)).status).toBe("accepted");expect(d.readback).not.toHaveBeenCalled();expect(d.send).toHaveBeenCalledTimes(1);
  });
  it("rejects non-owner/wrong-business and changed message before transport", async () => {
    const d=deps({rpc:vi.fn(async()=>{throw new WorkspaceAccessError();})});await expect(replyFromWorkspace(actor,input,d)).rejects.toBeInstanceOf(WorkspaceAccessError);expect(d.send).not.toHaveBeenCalled();
    const changed=deps({rpc:vi.fn(async()=>{throw new Error("inquiry_reply_changed");})});await expect(replyFromWorkspace(actor,input,changed)).rejects.toThrow("changed");expect(changed.send).not.toHaveBeenCalled();
  });
  it("truthful readback projects bounce, defer, failure and delivery; mismatch stays accepted", async () => {
    for(const [lastEvent,status] of [["bounced","bounced"],["delivery_delayed","deferred"],["failed","failed"],["opened","delivered"]]){
      const d=deps({readback:vi.fn(async()=>({status:"available",providerMessageId:"mail-1",to:["dana@example.test"],subject:input.subject,lastEvent}))});expect((await replyFromWorkspace(actor,input,d)).status).toBe(status);
    }
    const d=deps({readback:vi.fn(async()=>({status:"available",providerMessageId:"mail-1",to:["wrong@example.test"],subject:input.subject,lastEvent:"delivered"}))});expect((await replyFromWorkspace(actor,input,d)).status).toBe("accepted");
  });
  it("refuses subject injection, arbitrary destinations and malformed request ids", () => {
    expect(workspaceReplyInput.safeParse({...input,subject:"Hello\nBCC: victim@example.test"}).success).toBe(false);
    expect(workspaceReplyInput.safeParse({...input,to:"victim@example.test"}).success).toBe(false);
    expect(workspaceReplyInput.safeParse({...input,requestId:"same"}).success).toBe(false);
  });
});
describe("inquiry outcome proof",()=>{
  it("weekly proof requires its off-by-default flag and passes authenticated business scope",async()=>{
    const rpc=vi.fn(async()=>({data:{answered:2,averageReplySeconds:7200},error:null}));await expect(readBusinessInquiryOutcomes(actor,input.workspaceId,"2026-10-01","2026-10-08",rpc)).rejects.toThrow("unavailable");expect(rpc).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_INQUIRY_OUTCOMES","1");expect(await readBusinessInquiryOutcomes(actor,input.workspaceId,"2026-10-01","2026-10-08",rpc)).toMatchObject({answered:2});expect(rpc).toHaveBeenCalledWith("business_inquiry_outcomes",expect.objectContaining({p_user_id:actor.userId,p_workspace_id:input.workspaceId}));
  });
  it("monthly report uses its existing RPC with flag off and exact inquiries RPC with flag on",async()=>{
    const rpc=vi.fn(async()=>({data:{},error:null})); await readBusinessOutcomeMonth(actor,input.workspaceId,"2026-10",rpc);expect(rpc).toHaveBeenLastCalledWith("business_outcome_month",expect.any(Object));vi.stubEnv("STRELVA_INQUIRY_OUTCOMES","1");await readBusinessOutcomeMonth(actor,input.workspaceId,"2026-10",rpc);expect(rpc).toHaveBeenLastCalledWith("business_outcome_month_inquiries",expect.any(Object));
  });
});
