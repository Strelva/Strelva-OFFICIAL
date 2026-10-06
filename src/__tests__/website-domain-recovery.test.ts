import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { TenantConfig } from "@/lib/types";
const state = vi.hoisted(()=>({ tenant:null as TenantConfig|null, updates:0, failUpdate:0, providerExists:false, unavailable:false, lostResponse:false, postStatus:200, posts:0 }));
vi.mock("@/platform/infra/redis",()=>({getRedis:()=>null}));
vi.mock("@/lib/tenants",()=>({
 getTenantConfig:async()=>state.tenant,getAllTenants:async()=>state.tenant?[state.tenant]:[],isActiveTenant:()=>true,invalidateDomainMapCache:vi.fn(),
 updateTenant:async(_id:string,changes:Partial<TenantConfig>)=>{state.updates++;if(state.updates===state.failUpdate)throw new Error("Local claim storage unavailable");state.tenant={...state.tenant!,...changes};return state.tenant;},
}));
import { changeHostedDomain } from "@/products/websites/rebuild-domains";
beforeEach(()=>{
 Object.assign(state,{tenant:{id:"example",stableId:"11111111-1111-4111-8111-111111111111",subdomain:"example",siteName:"Example",ownerName:"Owner",industry:"wellness",active:true,createdAt:"2026-10-01",template:"wellness",subscriptionStatus:"active"},updates:0,failUpdate:0,providerExists:false,unavailable:false,lostResponse:false,postStatus:200,posts:0});
 vi.stubEnv("VERCEL_API_TOKEN","synthetic-provider-token");vi.stubEnv("VERCEL_PROJECT_ID","synthetic-project");
 vi.stubGlobal("fetch",vi.fn(async(url:string|URL|Request,options?:RequestInit)=>{
  const href=String(url);
  if(options?.method==="POST") { state.posts++;expect(state.tenant?.domainClaims?.[0]?.registrationAttempt).toBe("unknown");if(state.postStatus!==200)return Response.json({error:{message:"Registration rejected"}}, {status:state.postStatus});state.providerExists=true;if(state.lostResponse)throw new Error("Provider response lost after acceptance");return Response.json({name:"examplebusiness.com",verified:true}); }
  if(state.unavailable)return Response.json({}, {status:503});
  if(href.includes("/v9/projects/"))return state.providerExists?Response.json({name:"examplebusiness.com",verified:true,verification:[]}):Response.json({}, {status:404});
  if(href.includes("/v6/domains/"))return Response.json({misconfigured:false,recommendedIPv4:[{rank:1,value:["203.0.113.10"]}],acceptedChallenges:["dns-01"]});
  throw new Error(`Unexpected synthetic provider request: ${href}`);
 }));
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe("hosted domain accepted-write recovery",()=>{
 it("rechecks owner authority after provider reads and before the registration",async()=>{
  const authorizeWrite=vi.fn().mockRejectedValue(new Error("Owner authority revoked"));
  await expect(changeHostedDomain("example",{domain:"examplebusiness.com",action:"attach"},{authorizeWrite})).rejects.toThrow("revoked");expect(state.posts).toBe(0);expect(state.updates).toBe(0);
 });
 it("does not submit after ownership is revoked while recording the registration intent",async()=>{
  const authorizeWrite=vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new Error("Owner authority revoked"));
  await expect(changeHostedDomain("example",{domain:"examplebusiness.com",action:"attach"},{authorizeWrite})).rejects.toThrow("revoked");expect(state.posts).toBe(0);expect(state.tenant?.domainClaims?.[0]?.status).toBe("pending");
 });
 it("keeps a durable inspectable intent if provider accepts but the final local claim write fails",async()=>{
  state.failUpdate=3;
  await expect(changeHostedDomain("example",{domain:"examplebusiness.com",action:"attach"})).rejects.toThrow("claim storage");
  expect(state.posts).toBe(1);expect(state.tenant?.domainClaims?.[0]?.status).toBe("pending");
  const recovered=await changeHostedDomain("example",{domain:"examplebusiness.com",action:"attach"});
  expect(state.posts).toBe(1);expect(recovered.domain?.status).toBe("verified");expect(recovered.domain?.records).toContainEqual({type:"A",name:"examplebusiness.com",value:"203.0.113.10"});
 });
 it("records intent before a provider request and inspects an unknown transport outcome without resubmitting",async()=>{
  state.lostResponse=true;
  await expect(changeHostedDomain("example",{domain:"examplebusiness.com",action:"attach"})).rejects.toThrow("response lost");
  expect(state.tenant?.customDomains).toEqual(["examplebusiness.com"]);
  expect((await changeHostedDomain("example",{domain:"examplebusiness.com",action:"attach"})).domain?.status).toBe("verified");expect(state.posts).toBe(1);
 });
 it("does not register a domain if the intent cannot be saved",async()=>{
  state.failUpdate=1;
  await expect(changeHostedDomain("example",{domain:"examplebusiness.com",action:"attach"})).rejects.toThrow("claim storage");expect(state.posts).toBe(0);expect(state.tenant?.domainClaims).toBeUndefined();
 });
 it("repairs an already accepted provider binding using reads without submitting a registration",async()=>{
  state.providerExists=true;
  const recovered=await changeHostedDomain("example",{domain:"examplebusiness.com",action:"attach"});expect(state.posts).toBe(0);expect(recovered.domain?.status).toBe("verified");
 });
 it("retries a definite registration rejection after a fresh provider lookup",async()=>{
  state.postStatus=400;
  const rejected=await changeHostedDomain("example",{domain:"examplebusiness.com",action:"attach"});
  expect(rejected.domain?.status).toBe("error");expect(state.posts).toBe(1);expect(state.tenant?.domainClaims?.[0]?.registrationAttempt).toBe("rejected");
  state.postStatus=200;
  const accepted=await changeHostedDomain("example",{domain:"examplebusiness.com",action:"attach"});
  expect(accepted.domain?.status).toBe("verified");expect(state.posts).toBe(2);expect(state.tenant?.domainClaims?.[0]?.registrationAttempt).toBe("confirmed");expect(state.tenant?.customDomains).toEqual(["examplebusiness.com"]);
 });
 it("retries a saved not-submitted intent after current owner authority is restored",async()=>{
  const authorizeWrite=vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new Error("Owner authority revoked"));
  await expect(changeHostedDomain("example",{domain:"examplebusiness.com",action:"attach"},{authorizeWrite})).rejects.toThrow("revoked");
  expect(state.posts).toBe(0);expect(state.tenant?.domainClaims?.[0]?.registrationAttempt).toBe("not_submitted");
  authorizeWrite.mockResolvedValue(undefined);
  const accepted=await changeHostedDomain("example",{domain:"examplebusiness.com",action:"attach"},{authorizeWrite});
  expect(accepted.domain?.status).toBe("verified");expect(state.posts).toBe(1);expect(authorizeWrite).toHaveBeenCalledTimes(7);
 });
 it.each([408,409,429,500,503])("keeps an ambiguous %s registration outcome non-retryable even when later inspection is 404",async status=>{
  state.postStatus=status;
  await changeHostedDomain("example",{domain:"examplebusiness.com",action:"attach"});
  expect(state.tenant?.domainClaims?.[0]?.registrationAttempt).toBe("unknown");expect(state.posts).toBe(1);expect(state.providerExists).toBe(false);
  state.postStatus=200;
  await changeHostedDomain("example",{domain:"examplebusiness.com",action:"attach"});
  expect(state.posts).toBe(1);expect(state.tenant?.domainClaims?.[0]?.registrationAttempt).toBe("unknown");
 });
 it("does not resubmit when authority is revoked after the unknown boundary was saved",async()=>{
  const authorizeWrite=vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValue(new Error("Owner authority revoked"));
  await expect(changeHostedDomain("example",{domain:"examplebusiness.com",action:"attach"},{authorizeWrite})).rejects.toThrow("revoked");
  expect(state.posts).toBe(0);expect(state.tenant?.domainClaims?.[0]?.registrationAttempt).toBe("unknown");
  authorizeWrite.mockResolvedValue(undefined);
  await changeHostedDomain("example",{domain:"examplebusiness.com",action:"attach"},{authorizeWrite});expect(state.posts).toBe(0);
 });
 it("fails closed when provider reads cannot establish whether registration already succeeded",async()=>{
  state.unavailable=true;
  await expect(changeHostedDomain("example",{domain:"examplebusiness.com",action:"attach"})).rejects.toThrow("could not be checked");expect(state.posts).toBe(0);expect(state.updates).toBe(0);
 });
});
