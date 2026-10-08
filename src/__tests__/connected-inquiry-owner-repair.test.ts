import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { connectedOwnerRepairEmailGates,repairConnectedInquiryOwnerNotice,type ConnectedOwnerRepairDependencies } from "@/products/connected-sites/inquiry-owner-repair";
import { reconcileConnectedInquiryOwnerNotice } from "@/products/connected-sites/inquiry-owner-notice";
const rowId="ca500000-0000-4000-8000-000000000020",repairId="ca500000-0000-4000-8000-000000000030",workspaceId="ca500000-0000-4000-8000-000000000010";
const actor={userId:"ca500000-0000-4000-8000-000000000001",verifiedEmail:"review-op@example.test"};
const override=vi.hoisted(()=>vi.fn());
vi.mock("@/platform/infra/email/client-override",()=>({getClientEmailOverride:override}));
const claim={acquired:true,status:"sending",repairId,recipient:"corrected@example.test",tenantId:"fixture",subject:"New inquiry",workspaceId,siteHost:"fixture.example",name:"Dana",email:"dana@example.test",message:"Private party?"};
function deps(patch:Partial<ConnectedOwnerRepairDependencies>={}):ConnectedOwnerRepairDependencies {return {rpc:vi.fn(async name=>name.startsWith("claim")?claim:true),gates:vi.fn(async()=>true),send:vi.fn(async()=>({status:"accepted" as const,providerMessageId:"repair-provider",acceptedAt:"2026-10-07T12:00:00Z"})),...patch};}
beforeEach(()=>{override.mockReset();override.mockResolvedValue(null);vi.stubEnv("STRELVA_INQUIRY_RECORDS","1");vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES","1");vi.stubEnv("DUAL_WRITE_PG","1");});
afterEach(()=>vi.unstubAllEnvs());
describe("connected corrected-owner notice repair",()=>{
 it("does no I/O with either flag or dual write disabled",async()=>{
   for(const flag of ["STRELVA_INQUIRY_RECORDS","STRELVA_INQUIRY_OWNER_NOTICES","DUAL_WRITE_PG"]){vi.stubEnv(flag,"0");const d=deps();expect((await repairConnectedInquiryOwnerNotice(actor,rowId,d)).status).toBe("disabled");expect(d.rpc).not.toHaveBeenCalled();expect(d.send).not.toHaveBeenCalled();vi.stubEnv(flag,"1");}
 });
 it("sends exactly the claimed corrected recipient with a separate immutable purpose",async()=>{
   const d=deps();expect((await repairConnectedInquiryOwnerNotice(actor,rowId,d)).status).toBe("accepted");
   expect(d.rpc).toHaveBeenNthCalledWith(1,"claim_connected_inquiry_owner_notice_repair",{p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_lead_row_id:rowId});
   expect(d.rpc).toHaveBeenNthCalledWith(2,"verify_connected_inquiry_owner_notice_repair",{p_repair_id:repairId});
   expect(d.send).toHaveBeenCalledOnce();expect(d.send).toHaveBeenCalledWith(expect.objectContaining({to:claim.recipient,tenantId:"fixture",idempotencyKey:`connected-inquiry-repair:${repairId}`,tags:{strelva_connected_notice_id:rowId,strelva_connected_notice_repair_id:repairId,strelva_workspace_id:workspaceId}}));
 });
 it("never sends an unchanged, already claimed, accepted, in-flight or unknown purpose",async()=>{
   for(const status of ["bounced","accepted","sending","unknown"]){const d=deps({rpc:vi.fn(async()=>({acquired:false,status,reason:"correct_owner_recipient_before_resending"}))});await repairConnectedInquiryOwnerNotice(actor,rowId,d);expect(d.send).not.toHaveBeenCalled();expect(d.rpc).toHaveBeenCalledTimes(1);}
 });
 it("closed or failed gates and a changed recipient suppress without provider work",async()=>{
   for(const d of [deps({gates:async()=>false}),deps({gates:async()=>{throw new Error("gates offline");}}),deps({rpc:vi.fn(async name=>name.startsWith("claim")?claim:name.startsWith("verify")?false:true)})]){
     expect((await repairConnectedInquiryOwnerNotice(actor,rowId,d)).status).toBe("suppressed");expect(d.send).not.toHaveBeenCalled();expect(d.rpc).toHaveBeenLastCalledWith("finish_connected_inquiry_owner_notice_repair",expect.objectContaining({p_status:"suppressed"}));
   }
 });
 it("requires both global email gates and permits no tenant override to arm them",async()=>{
   for(const [email,customer,tenant] of [["false","true","on"],["true","false","on"],["true","true","off"]]) {
     vi.stubEnv("EMAIL_SENDING_ENABLED",email);vi.stubEnv("CUSTOMER_EMAIL_ENABLED",customer);override.mockResolvedValue(tenant);
     const d=deps({gates:connectedOwnerRepairEmailGates});expect((await repairConnectedInquiryOwnerNotice(actor,rowId,d)).status).toBe("suppressed");expect(d.send).not.toHaveBeenCalled();
   }
   vi.stubEnv("EMAIL_SENDING_ENABLED","true");vi.stubEnv("CUSTOMER_EMAIL_ENABLED","true");override.mockResolvedValue(null);expect(await connectedOwnerRepairEmailGates("fixture")).toBe(true);
 });
 it("keeps ambiguous acceptance closed and reports accepted even if receipt checkpoint fails",async()=>{
   const unknown=deps({send:async()=>{throw new Error("provider timeout");}});expect((await repairConnectedInquiryOwnerNotice(actor,rowId,unknown)).status).toBe("unknown");expect(unknown.rpc).toHaveBeenLastCalledWith("finish_connected_inquiry_owner_notice_repair",expect.objectContaining({p_status:"unknown"}));
   const accepted=deps({rpc:vi.fn(async name=>{if(name.startsWith("claim"))return claim;if(name.startsWith("verify"))return true;throw new Error("checkpoint down");})});expect((await repairConnectedInquiryOwnerNotice(actor,rowId,accepted)).status).toBe("accepted");expect(accepted.send).toHaveBeenCalledOnce();
 });
 it("refuses malformed claims before sending",async()=>{
   const d=deps({rpc:vi.fn(async()=>({...claim,recipient:"invalid"}))});await expect(repairConnectedInquiryOwnerNotice(actor,rowId,d)).rejects.toThrow();expect(d.send).not.toHaveBeenCalled();
 });
 it("correlates the exact repair attempt in the existing signed webhook host",async()=>{
   const event={type:"email.bounced",created_at:"2026-10-07T12:01:00Z",data:{email_id:"repair-provider",created_at:"2026-10-07T12:00:00Z",to:["corrected@example.test"],subject:"New inquiry",tags:{strelva_connected_notice_id:rowId,strelva_connected_notice_repair_id:repairId,strelva_workspace_id:workspaceId}}};
   const rpc=vi.fn(async()=>({status:"recorded"}));expect((await reconcileConnectedInquiryOwnerNotice({event,eventId:"repair-bounce"},rpc)).status).toBe("recorded");expect(rpc).toHaveBeenCalledWith("record_connected_inquiry_owner_notice_repair_event",expect.objectContaining({p_repair_id:repairId,p_lead_row_id:rowId,p_status:"bounced"}));
   expect((await reconcileConnectedInquiryOwnerNotice({event:{...event,data:{...event.data,tags:{...event.data.tags,strelva_connected_notice_repair_id:"bad"}}},eventId:"bad"},rpc)).status).toBe("unmatched");
 });
});
