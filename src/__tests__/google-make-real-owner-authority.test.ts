import { beforeEach, expect, it, vi } from "vitest";
const ports=vi.hoisted(()=>({getEventRaw:vi.fn(),resolveEventAction:vi.fn()}));
const access=vi.hoisted(()=>vi.fn());
vi.mock("@/platform/infra/tenant-publishing",()=>({tenantPublishingPorts:async()=>ports}));
vi.mock("@/platform/business-record/service",()=>({readBusinessRecord:access}));
vi.mock("@/products/publishing/server",()=>({readPublishingSnapshot:async()=>({bindings:[{id:"binding",status:"connected",originTenantId:null,locations:[{locationId:"location"}]}]})}));
vi.mock("@/platform/infra/db/client",()=>({getSupabase:()=>({rpc:async()=>({data:null,error:null})})}));
vi.mock("@/products/google-listing/workspace",()=>({googleTargetAllowed:async()=>true,undoWorkspaceGoogleChange:vi.fn(),tenantListingContext:vi.fn()}));
vi.mock("@/products/google-listing/controls",()=>({readListingControl:async()=>({paused:false,accessPending:false})}));
import { googleMakeRealDraftDigest,googleMakeRealPorts } from "@/products/google-listing/make-real";
const workspaceId="ab000000-0000-4000-8000-000000000010";
const actor={userId:"actual-owner",verifiedEmail:"owner-a@example.test"};
const metadata={kind:"workspace_google_listing_draft",workspaceId,locationId:"location",draft:{action:"hours",hours:null}};
const request={tenantId:`workspace-${workspaceId}`,eventId:"event",locationId:"location",draftDigest:googleMakeRealDraftDigest(metadata)};
beforeEach(()=>{vi.clearAllMocks();access.mockResolvedValue({access:"owner"});ports.getEventRaw.mockResolvedValue({tenantId:request.tenantId,status:"pending",metadata});ports.resolveEventAction.mockResolvedValue({changed:true});});
it("passes the actual interactive owner's identity to the claimed executor",async()=>{
 await googleMakeRealPorts.approve(actor,workspaceId,request);
 expect(ports.resolveEventAction).toHaveBeenCalledWith(request.tenantId,"event","approved","actual-owner");
});
it("retains the owner boundary instead of treating a provider reader as owner",async()=>{
 access.mockResolvedValue({access:"provider_read"});
 await expect(googleMakeRealPorts.approve(actor,workspaceId,request)).rejects.toThrow(/owner authority/);
 expect(ports.resolveEventAction).not.toHaveBeenCalled();
});
