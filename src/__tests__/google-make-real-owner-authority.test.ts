import { beforeEach, expect, it, vi } from "vitest";
const ports=vi.hoisted(()=>({getEventRaw:vi.fn(),resolveEventAction:vi.fn()}));
const access=vi.hoisted(()=>vi.fn());
const rpc=vi.hoisted(()=>vi.fn());
vi.mock("@/platform/infra/tenant-publishing",()=>({tenantPublishingPorts:async()=>ports}));
vi.mock("@/platform/business-record/service",()=>({readBusinessRecord:access}));
vi.mock("@/products/publishing/server",()=>({readPublishingSnapshot:async()=>({bindings:[{id:"binding",status:"connected",originTenantId:null,locations:[{locationId:"location"}]}]})}));
vi.mock("@/platform/infra/db/client",()=>({getSupabase:()=>({rpc})}));
vi.mock("@/products/google-listing/workspace",()=>({googleTargetAllowed:async()=>true,undoWorkspaceGoogleChange:vi.fn(),tenantListingContext:vi.fn()}));
vi.mock("@/products/google-listing/controls",()=>({readListingControl:async()=>({paused:false,accessPending:false})}));
import { googleMakeRealDraftDigest,googleMakeRealPorts } from "@/products/google-listing/make-real";
const workspaceId="ab000000-0000-4000-8000-000000000010";
const actor={userId:"actual-owner",verifiedEmail:"owner-a@example.test"};
const metadata={kind:"workspace_google_listing_draft",workspaceId,locationId:"location",draft:{action:"hours",hours:null}};
const request={tenantId:`workspace-${workspaceId}`,eventId:"event",locationId:"location",draftDigest:googleMakeRealDraftDigest(metadata)};
beforeEach(()=>{vi.clearAllMocks();rpc.mockResolvedValue({data:null,error:null});access.mockResolvedValue({access:"owner"});ports.getEventRaw.mockResolvedValue({tenantId:request.tenantId,status:"pending",metadata});ports.resolveEventAction.mockResolvedValue({changed:true});});
it("passes the actual interactive owner's identity to the claimed executor",async()=>{
 await googleMakeRealPorts.approve(actor,workspaceId,request);
 expect(ports.resolveEventAction).toHaveBeenCalledWith(request.tenantId,"event","approved","actual-owner");
});
it("retains the owner boundary instead of treating a provider reader as owner",async()=>{
 access.mockResolvedValue({access:"provider_read"});
 await expect(googleMakeRealPorts.approve(actor,workspaceId,request)).rejects.toThrow(/owner authority/);
 expect(ports.resolveEventAction).not.toHaveBeenCalled();
});

const serviceActor={userId:"ab000000-0000-4000-8000-000000000020",verifiedEmail:"provider@example.test"};
const context={session:{kind:"strelva_system" as const,label:"Strelva (system)" as const,sessionId:"ab000000-0000-4000-8000-000000000021",workspaceId,purpose:"make_real_link" as const,onBehalf:{role:"admin" as const},actor:serviceActor},approvalId:"ab000000-0000-4000-8000-000000000022",possibilityId:"ab000000-0000-4000-8000-000000000023"};
it("uses a logged service identity only after checking the exact owner-approved Google plan",async()=>{
 access.mockResolvedValue({access:"provider_read"});
 rpc.mockImplementation(async(name:string)=>name==="check_google_make_real_service_authority"?{data:{...serviceActor,bindingId:"ab000000-0000-4000-8000-000000000024",possibilityId:context.possibilityId},error:null}:{data:null,error:null});
 await googleMakeRealPorts.forService!(context).approve(serviceActor,workspaceId,request);
 expect(rpc).toHaveBeenCalledWith("check_google_make_real_service_authority",expect.objectContaining({p_workspace_id:workspaceId,p_session_id:context.session.sessionId,p_decision_id:context.approvalId,p_request:request,p_possibility_id:context.possibilityId}));
 expect(ports.resolveEventAction).toHaveBeenCalledWith(request.tenantId,"event","approved",`make-real-service:${context.session.sessionId}:${context.approvalId}`);
});
it.each(["recipient changed","provider revoked","approval stale","session expired"])("refuses a service run when SQL rejects current authority: %s",async(reason)=>{
 rpc.mockResolvedValue({data:null,error:{message:reason}});
 await expect(googleMakeRealPorts.forService!(context).approve(serviceActor,workspaceId,request)).rejects.toThrow(/authority ended/);
 expect(ports.resolveEventAction).not.toHaveBeenCalled();
});
it("does not let a bound service session impersonate another member",async()=>{
 rpc.mockResolvedValue({data:{...serviceActor,bindingId:"ab000000-0000-4000-8000-000000000024",possibilityId:context.possibilityId},error:null});
 await expect(googleMakeRealPorts.forService!(context).approve(actor,workspaceId,request)).rejects.toThrow(/identity changed/);
 expect(ports.resolveEventAction).not.toHaveBeenCalled();
});
