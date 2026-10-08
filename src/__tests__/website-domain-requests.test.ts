import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebsiteDomainRequestService, createWebsiteDomainRequestStore, websiteDomainEmailAllowed, type WebsiteDomainRequest } from "@/products/websites/domain-requests";
import { websiteDomainAdapter, websiteDomainItem } from "@/platform/needs-you/sources/website-domain";
import { createNeedsYouService } from "@/platform/needs-you/service";
import { needsYouMemoryStore } from "./support/needs-you-memory";
import { WebsiteDomainEffectUnconfirmedError } from "@/platform/needs-you/sources/website-domain-store";
const override = vi.hoisted(() => vi.fn());
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: override }));
const WS = "aaaaaaaa-0000-4000-8000-000000000001";
const WORK = "aaaaaaaa-0000-4000-8000-000000000002";
const REQUEST = "aaaaaaaa-0000-4000-8000-000000000003";
const OWNER = {userId:"aaaaaaaa-0000-4000-8000-000000000004",verifiedEmail:"owner@example.test"};
const now = Date.parse("2026-10-10T11:00:00Z");
const row = (): WebsiteDomainRequest => ({id:REQUEST,workspaceId:WS,workId:WORK,tenantId:"fictional",publishedRevision:1,publishedHash:"a".repeat(64),hostname:"fictional.example.test",records:[{type:"A",name:"fictional.example.test",value:"203.0.113.10"}],revisionHash:"b".repeat(64),createdAt:new Date(now).toISOString(),expiresAt:new Date(now+14*86400000).toISOString(),current:true,decisionId:null,result:null,receiptEmail:null});
beforeEach(()=>{override.mockResolvedValue("inherit");});
afterEach(()=>vi.unstubAllEnvs());
function ports() {
  const request = row();
  const store = {list:vi.fn().mockResolvedValue([request]),prepare:vi.fn(),approve:vi.fn().mockImplementation(async(r:WebsiteDomainRequest,id:string)=>({...r,decisionId:id})),authorize:vi.fn().mockResolvedValue(request),record:vi.fn().mockImplementation(async(r:WebsiteDomainRequest,result:WebsiteDomainRequest["result"])=>({...r,result}))};
  const domain = {hostname:request.hostname,status:"pending",checkedAt:new Date(now).toISOString(),records:request.records};
  const change = vi.fn().mockResolvedValue({domain,domains:[domain],registrationAttempt:"confirmed"});
  const read = vi.fn().mockResolvedValue({domain,domains:[domain]});
  const enabled = vi.fn().mockResolvedValue(true);
  return {request,store,change,read,enabled};
}
describe("website domain owner proposals",()=>{
  it("contains exact DNS records and remains owner-only",()=>{
    expect(websiteDomainItem(row(),now)).toMatchObject({kind:"system.go_live",route:"owner_decides",adminMayDecide:false,sourceLifecycle:"website_domain",detail:"A fictional.example.test → 203.0.113.10"});
    expect(websiteDomainItem({...row(),systemId:REQUEST},now)?.systemId).toBe(REQUEST);
    expect(websiteDomainItem({...row(),current:false},now)).toBeNull();
    expect(websiteDomainItem({...row(),expiresAt:new Date(now).toISOString()},now)).toBeNull();
  });
  it("supports an accountless signed owner decision using the existing decision store",async()=>{
    const memory = needsYouMemoryStore({clock:{now},roles:{[OWNER.userId]:"owner"}});
    const approve = vi.fn().mockResolvedValue({...row(),decisionId:REQUEST,result:{hostname:row().hostname,status:"verified",routing:"verified",checkedAt:new Date(now).toISOString(),records:row().records}});
    const adapter = websiteDomainAdapter({list:async()=>[row()],approve,now:()=>now});
    const service = createNeedsYouService({store:memory.store,adapters:[adapter],sendEmail:vi.fn(),appOrigin:"https://app.example.test",now:()=>now});
    const item=(await service.list(OWNER,WS)).items[0]!;
    const result=await service.decide({workspaceId:WS,itemId:item.id,revision:item.revisionHash,decision:"approve",by:{kind:"owner_link",recipient:"owner@example.test"}});
    expect(result.status).toBe("done");expect(approve).toHaveBeenCalledWith(row(),item.id);
    expect((await service.decide({workspaceId:WS,itemId:item.id,revision:item.revisionHash,decision:"approve",by:{kind:"owner_link",recipient:"owner@example.test"}})).status).toBe("already_handled");expect(approve).toHaveBeenCalledTimes(1);
  });
  it("rejects changed publications before claiming or performing the provider write",async()=>{
    const memory=needsYouMemoryStore({clock:{now},roles:{[OWNER.userId]:"owner"}});let current=row();const approve=vi.fn();
    const adapter=websiteDomainAdapter({list:async()=>[current],approve,now:()=>now});
    const service=createNeedsYouService({store:memory.store,adapters:[adapter],sendEmail:vi.fn(),appOrigin:"https://app.example.test",now:()=>now});
    const item=(await service.list(OWNER,WS)).items[0]!;current={...current,current:false};
    expect((await service.decide({workspaceId:WS,itemId:item.id,revision:item.revisionHash,decision:"approve",by:{kind:"owner_link",recipient:"owner@example.test"}})).status).toBe("changed");expect(approve).not.toHaveBeenCalled();
  });
  it("Not yet and expiry never attach domains",async()=>{
    const approve=vi.fn();const adapter=websiteDomainAdapter({list:async()=>[row()],approve,now:()=>now});
    const memory=needsYouMemoryStore({clock:{now},roles:{[OWNER.userId]:"owner"}});
    const service=createNeedsYouService({store:memory.store,adapters:[adapter],sendEmail:vi.fn(),appOrigin:"https://app.example.test",now:()=>now});
    const item=(await service.list(OWNER,WS)).items[0]!;
    expect((await service.decide({workspaceId:WS,itemId:item.id,revision:item.revisionHash,decision:"not_yet",by:{kind:"session",actor:OWNER}})).status).toBe("done");expect(approve).not.toHaveBeenCalled();
  });
  it("flags off performs no approval, authorization or provider call",async()=>{
    const p=ports();p.enabled.mockResolvedValue(false);
    await expect(createWebsiteDomainRequestService(p).approve(p.request,REQUEST)).rejects.toThrow("not enabled");expect(p.store.approve).not.toHaveBeenCalled();expect(p.change).not.toHaveBeenCalled();
  });
  it("rechecks exact domain authority at the provider boundary and records DNS pending honestly",async()=>{
    const p=ports();p.change.mockImplementation(async(_tenant,_input,options)=>{await options?.authorizeWrite?.();return {domain:{hostname:p.request.hostname,status:"pending",checkedAt:new Date(now).toISOString(),records:p.request.records},domains:[{hostname:p.request.hostname,status:"pending",checkedAt:new Date(now).toISOString(),records:p.request.records}]};});
    expect((await createWebsiteDomainRequestService(p).approve(p.request,REQUEST)).result?.status).toBe("pending");expect(p.store.authorize).toHaveBeenCalledTimes(2);expect(p.store.record).toHaveBeenCalledTimes(1);
  });
  it("fails closed on revoked owner authority and does not turn unknown acceptance into a retry",async()=>{
    const p=ports();p.store.authorize.mockRejectedValue(new Error("revoked"));await expect(createWebsiteDomainRequestService(p).approve(p.request,REQUEST)).rejects.toThrow("revoked");expect(p.change).not.toHaveBeenCalled();
    p.store.authorize.mockResolvedValue(p.request);p.change.mockRejectedValue(new Error("lost response after acceptance"));await expect(createWebsiteDomainRequestService(p).approve(p.request,REQUEST)).rejects.toThrow("lost response");
    await createWebsiteDomainRequestService(p).reconcile({...p.request,decisionId:REQUEST});expect(p.change).toHaveBeenCalledTimes(1);expect(p.read).toHaveBeenCalledTimes(1);
  });
  it("reports successful attachment with unverified DNS as done_unverified",async()=>{
    const p=ports();const adapter=websiteDomainAdapter({list:async()=>[p.request],approve:createWebsiteDomainRequestService(p).approve,now:()=>now});
    const memory=needsYouMemoryStore({clock:{now},roles:{[OWNER.userId]:"owner"}});const service=createNeedsYouService({store:memory.store,adapters:[adapter],sendEmail:vi.fn(),appOrigin:"https://app.example.test",now:()=>now});
    const item=(await service.list(OWNER,WS)).items[0]!;expect((await service.decide({workspaceId:WS,itemId:item.id,revision:item.revisionHash,decision:"approve",by:{kind:"owner_link",recipient:"owner@example.test"}})).status).toBe("done_unverified");
  });
  it("keeps the accepted domain receipt when public routing cannot be checked",async()=>{
    const p=ports();
    p.change.mockResolvedValue({domain:null,domains:[{hostname:p.request.hostname,status:"verified",checkedAt:new Date(now).toISOString(),records:p.request.records}]});
    const checkRouting=vi.fn().mockRejectedValue(new Error("read-back transport down"));
    const saved=await createWebsiteDomainRequestService({...p,checkRouting}).approve(p.request,REQUEST);
    expect(saved.result).toMatchObject({status:"verified",routing:"unverified"});
    expect(p.change).toHaveBeenCalledOnce();expect(p.store.record).toHaveBeenCalledOnce();
  });
  it.each(["confirmed","unknown"] as const)("records %s attachment when the subsequent provider read fails and never attaches during reconciliation",async registrationAttempt=>{
    const p=ports();p.change.mockRejectedValue(new WebsiteDomainEffectUnconfirmedError(registrationAttempt));
    const saved=await createWebsiteDomainRequestService(p).approve(p.request,REQUEST);
    expect(saved.result).toMatchObject({registrationAttempt,status:"pending",routing:"unverified"});
    expect(saved.result?.error).toContain(registrationAttempt==="confirmed"?"provider accepted":"could not confirm whether");
    await createWebsiteDomainRequestService(p).reconcile({...saved,decisionId:REQUEST});
    expect(p.change).toHaveBeenCalledOnce();expect(p.read).toHaveBeenCalledOnce();
  });
  it.each(["confirmed","unknown"] as const)("finishes the owner decision as unverified after %s attachment and failed receipt storage",async registrationAttempt=>{
    const p=ports();
    p.change.mockRejectedValue(new WebsiteDomainEffectUnconfirmedError(registrationAttempt));p.store.record.mockRejectedValue(new Error("Receipt storage down"));
    const adapter=websiteDomainAdapter({list:async()=>[p.request],approve:createWebsiteDomainRequestService(p).approve,now:()=>now});
    const memory=needsYouMemoryStore({clock:{now},roles:{[OWNER.userId]:"owner"}});
    const service=createNeedsYouService({store:memory.store,adapters:[adapter],sendEmail:vi.fn(),appOrigin:"https://app.example.test",now:()=>now});
    const item=(await service.list(OWNER,WS)).items[0]!;
    const input={workspaceId:WS,itemId:item.id,revision:item.revisionHash,decision:"approve" as const,by:{kind:"owner_link" as const,recipient:"owner@example.test"}};
    const result=await service.decide(input);
    expect(result.status).toBe("done_unverified");expect(result.item?.outcomeReason).toContain("owner receipt could not be saved");
    expect(result.item?.outcomeReason).toContain(registrationAttempt==="confirmed"?"provider accepted":"could not confirm whether");
    expect((await service.decide(input)).status).toBe("already_handled");expect(p.change).toHaveBeenCalledOnce();
  });
  it("does not report an accepted successful attachment as failed when receipt storage is unavailable",async()=>{
    const p=ports();p.store.record.mockRejectedValue(new Error("Receipt storage down"));
    await expect(createWebsiteDomainRequestService(p).approve(p.request,REQUEST)).rejects.toMatchObject({registrationAttempt:"confirmed",receiptUnavailable:true});
    expect(p.change).toHaveBeenCalledOnce();
  });
  it.each(["not_submitted","rejected"] as const)("reports %s attachment as failed instead of claiming an outside change",async registrationAttempt=>{
    const p=ports();p.change.mockResolvedValue({domain:null,domains:[],registrationAttempt});
    const adapter=websiteDomainAdapter({list:async()=>[p.request],approve:createWebsiteDomainRequestService(p).approve,now:()=>now});
    const memory=needsYouMemoryStore({clock:{now},roles:{[OWNER.userId]:"owner"}});
    const service=createNeedsYouService({store:memory.store,adapters:[adapter],sendEmail:vi.fn(),appOrigin:"https://app.example.test",now:()=>now});
    const item=(await service.list(OWNER,WS)).items[0]!;
    expect((await service.decide({workspaceId:WS,itemId:item.id,revision:item.revisionHash,decision:"approve",by:{kind:"session",actor:OWNER}})).status).toBe("failed");
    expect(p.store.record).not.toHaveBeenCalled();expect(p.change).toHaveBeenCalledOnce();
  });
  it("domain emails need their separate opt-in plus both global gates and the tenant override",async()=>{
    vi.stubEnv("STRELVA_WEBSITE_DOMAIN_EMAIL_ENABLED","1");vi.stubEnv("EMAIL_SENDING_ENABLED","true");vi.stubEnv("CUSTOMER_EMAIL_ENABLED","true");expect(await websiteDomainEmailAllowed("fictional")).toBe(true);
    override.mockResolvedValue("off");expect(await websiteDomainEmailAllowed("fictional")).toBe(false);override.mockResolvedValue("on");
    vi.stubEnv("EMAIL_SENDING_ENABLED","false");expect(await websiteDomainEmailAllowed("fictional")).toBe(false);vi.stubEnv("EMAIL_SENDING_ENABLED","true");vi.stubEnv("CUSTOMER_EMAIL_ENABLED","false");expect(await websiteDomainEmailAllowed("fictional")).toBe(false);vi.stubEnv("CUSTOMER_EMAIL_ENABLED","true");vi.stubEnv("STRELVA_WEBSITE_DOMAIN_EMAIL_ENABLED","");expect(await websiteDomainEmailAllowed("fictional")).toBe(false);
  });
  it("maps RPC refusals to a conflict without fabricating an approval",async()=>{
    const rpc=vi.fn().mockResolvedValue({data:null,error:{message:"website_domain_owner_approval_required"}});
    await expect(createWebsiteDomainRequestStore({rpc}).approve(row(),REQUEST)).rejects.toThrow("approval no longer holds");
  });
});
