import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ agency: null as string | null, area: true, scopeFails: false, holders: vi.fn(), holder: vi.fn(), lifecycle: vi.fn(), rpc: vi.fn(), query: vi.fn() }));
vi.mock("@/platform/connections/server", async () => {
  const { providerEligibility } = await import("@/platform/connections/eligibility");
  const { readProviderAccess } = await import("@/platform/connections/access");
  return {connectionEligibilityFor: async (_actor: unknown, input: {provider:"google_business_profile";businessWorkspaceId:string}) => {
    if (f.scopeFails) throw new Error("scope unavailable");
    return providerEligibility({access:readProviderAccess(input.provider),businessWorkspaceId:input.businessWorkspaceId,actingAgencyWorkspaceId:f.agency,agencyHoldsArea:async()=>f.area});
  }};
});
vi.mock("@/platform/connections/holders",()=>({recordConnectionHolder:f.holder,readConnectionHolders:f.holders}));
vi.mock("@/products/publishing/server",()=>({publishingEnabledForWorkspace:async()=>true}));
vi.mock("@/products/google-listing/native/server",()=>({nativeGoogleLifecycle:f.lifecycle}));
vi.mock("@/platform/account-bindings/store",()=>({googleBindingsEnabled:()=>true,bindingEncryptionReady:()=>true,encryptForBinding:(value:string)=>`enc:${value}`}));
vi.mock("@/platform/infra/db/client",()=>({getSupabase:()=>({rpc:f.rpc,from:f.query})}));
import { assertGoogleConnectionEligible, assertGoogleBindingEligible, guardGoogleClient } from "@/products/google-listing/connection-policy";
import { beginNativeGoogleOAuth, finishNativeGoogleOAuth } from "@/products/google-listing/native/oauth";
import { googleBusinessProfileConnectionSource } from "@/products/google-listing/connection-source";
import { googleCalendarConnectionSource } from "@/products/scheduling/calendar/connection-source";
import type { GoogleListingClient } from "@/products/google-listing/client";
const business="20000000-0000-4000-8000-000000000001",agency="20000000-0000-4000-8000-000000000002",other="20000000-0000-4000-8000-000000000003",binding="30000000-0000-4000-8000-000000000001";
const actor={userId:"10000000-0000-4000-8000-000000000001",verifiedEmail:"staff@north.example"};
const target={workspaceId:business,googlePrincipalEmail:"agency@north.example",accountId:"accounts/north",locationId:"harbor",agencyWorkspaceId:agency};
beforeEach(()=>{vi.clearAllMocks();f.agency=null;f.area=true;f.scopeFails=false;vi.stubEnv("STRELVA_CONNECTION_ACCESS_GOOGLE_BUSINESS_PROFILE","");vi.stubEnv("STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE","");vi.stubEnv("STRELVA_GOOGLE_OWNER_CONNECT","1");vi.stubEnv("OAUTH_STATE_SECRET","fixture-private-secret");vi.stubEnv("NEXT_PUBLIC_APP_URL","https://app.example.test");vi.stubEnv("GOOGLE_CLIENT_ID","fixture");vi.stubEnv("GOOGLE_CLIENT_SECRET","fixture");f.rpc.mockResolvedValue({data:{status:"connected",bindingId:binding,workspaceId:business,accountId:target.accountId,locationId:target.locationId},error:null});});
afterEach(()=>vi.unstubAllEnvs());
function approveAgency(){vi.stubEnv("STRELVA_CONNECTION_ACCESS_GOOGLE_BUSINESS_PROFILE",`agency:${agency}`);vi.stubEnv("STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE","approved");f.agency=agency;}
describe("Google Connections policy at provider boundaries",()=>{
 it("defaults unavailable and never starts OAuth or calls Google",async()=>{
  await expect(beginNativeGoogleOAuth(actor,target,"https://app.example.test")).rejects.toThrow(/coming soon/);
  expect(f.rpc).not.toHaveBeenCalled();expect(f.lifecycle).not.toHaveBeenCalled();
 });
 it("treats every agency equally; refuses owner, sibling, missing area, pending and unreadable authority",async()=>{
  approveAgency();await expect(assertGoogleConnectionEligible(actor,business)).resolves.toBeUndefined();
  f.agency=other;await expect(assertGoogleConnectionEligible(actor,business)).rejects.toThrow(/coming soon/);
  f.agency=null;await expect(assertGoogleConnectionEligible(actor,business)).rejects.toThrow(/coming soon/);
  f.agency=agency;f.area=false;await expect(assertGoogleConnectionEligible(actor,business)).rejects.toThrow(/area/);
  f.area=true;vi.stubEnv("STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE","pending");await expect(assertGoogleConnectionEligible(actor,business)).rejects.toThrow(/approval/);
  f.scopeFails=true;await expect(assertGoogleConnectionEligible(actor,business)).rejects.toThrow();
 });
 it("platform approval admits a business owner but unknown or malformed config never does",async()=>{
  vi.stubEnv("STRELVA_CONNECTION_ACCESS_GOOGLE_BUSINESS_PROFILE","platform");vi.stubEnv("STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE","approved");
  await expect(assertGoogleConnectionEligible(actor,business)).resolves.toBeUndefined();
  vi.stubEnv("STRELVA_CONNECTION_ACCESS_GOOGLE_BUSINESS_PROFILE","agency:not-a-uuid");await expect(assertGoogleConnectionEligible(actor,business)).rejects.toThrow(/coming soon/);
 });
 it("refuses unknown holders and a token from another provider project",async()=>{
  approveAgency();f.holders.mockResolvedValue(new Map());await expect(assertGoogleBindingEligible(actor,business,binding)).rejects.toThrow(/Reconnect/);
  f.holders.mockResolvedValue(new Map([[`google_business_profile:${binding}`,{accountHolder:{kind:"agency",workspaceId:agency},accessThrough:{kind:"agency",workspaceId:agency}}]]));await expect(assertGoogleBindingEligible(actor,business,binding)).resolves.toBeUndefined();
  vi.stubEnv("STRELVA_CONNECTION_ACCESS_GOOGLE_BUSINESS_PROFILE","platform");await expect(assertGoogleBindingEligible(actor,business,binding)).rejects.toThrow(/Reconnect/);
 });
 it("cannot infer the acting agency for background work",async()=>{approveAgency();await expect(assertGoogleConnectionEligible(null,business)).rejects.toThrow(/coming soon/);});
 it("rechecks access on every provider read/write, including a retained client",async()=>{
  approveAgency();const getLocation=vi.fn().mockResolvedValue({ok:true,data:{}}),updateReply=vi.fn();
  const client=guardGoogleClient({getLocation,updateReply} as unknown as GoogleListingClient,()=>assertGoogleConnectionEligible(actor,business));
  await client.getLocation({accountId:"accounts/north",locationId:"harbor"},[]);expect(getLocation).toHaveBeenCalledOnce();
  f.area=false;await expect(client.getLocation({accountId:"accounts/north",locationId:"harbor"},[])).rejects.toThrow();await expect(client.updateReply({accountId:"accounts/north",locationId:"harbor"},"review","reply")).rejects.toThrow();expect(getLocation).toHaveBeenCalledOnce();expect(updateReply).not.toHaveBeenCalled();
 });
 it("agency consent stores both holders as the agency without owner lifecycle or contact",async()=>{
  approveAgency();const started=await beginNativeGoogleOAuth(actor,target,"https://app.example.test"),state=new URL(started.url).searchParams.get("state")!;
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({access_token:"fixture-access",refresh_token:"fixture-refresh",scope:"openid https://www.googleapis.com/auth/business.manage",expires_in:3600})).mockResolvedValueOnce(Response.json({sub:"agency-subject",email:target.googlePrincipalEmail,email_verified:true})).mockResolvedValueOnce(Response.json({locations:[{name:"locations/harbor"}]}));
  await finishNativeGoogleOAuth(actor,state,started.nonce,"code","https://app.example.test",fetcher);
  expect(f.rpc.mock.calls.map(call=>call[1].p_action)).toEqual(["begin_oauth","consume_oauth","finish_oauth"]);expect(f.lifecycle).not.toHaveBeenCalled();
  expect(f.holder).toHaveBeenCalledWith(expect.objectContaining({ref:`google_business_profile:${binding}`,workspaceId:business,accountHolder:{kind:"agency",workspaceId:agency},accessThrough:{kind:"agency",workspaceId:agency},actor}));
 });
 it("rechecks callback authority before exchanging a code and preserves the existing connect flag",async()=>{
  approveAgency();const started=await beginNativeGoogleOAuth(actor,target,"https://app.example.test"),state=new URL(started.url).searchParams.get("state")!;
  const fetcher=vi.fn();f.area=false;await expect(finishNativeGoogleOAuth(actor,state,started.nonce,"code","https://app.example.test",fetcher)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
  f.area=true;vi.stubEnv("STRELVA_GOOGLE_OWNER_CONNECT","0");await expect(beginNativeGoogleOAuth(actor,target,"https://app.example.test")).rejects.toThrow();
 });
});
describe("Google connection sources",()=>{
 it("lists metadata only and keeps legacy holders unknown",async()=>{
  const selections:string[]=[];
  f.query.mockImplementation((table:string)=>{const q={select:(cols:string)=>{selections.push(cols);return q;},eq:()=>q,in:()=>Promise.resolve({data:[{binding_id:binding,title:"Harbor Dental"}],error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:table==="workspace_calendar_connections"?[{id:binding,status:"revoked",calendar_name:"Bookings",created_at:"2026-10-14T12:00:00Z"}]:[{id:binding,status:"connected",created_at:"2026-10-14T12:00:00Z"}],error:null}).then(resolve)};return q;});
  const access={provider:"google_business_profile" as const,through:{kind:"platform" as const},approval:"approved" as const};
  expect(await googleBusinessProfileConnectionSource().list({workspaceId:business,access})).toEqual([expect.objectContaining({ref:`google_business_profile:${binding}`,accountLabel:"Harbor Dental",accountHolder:{kind:"unknown"},accessThrough:{kind:"unknown"},state:"connected"})]);
  expect(await googleCalendarConnectionSource().list({workspaceId:business,access:{...access,provider:"google_calendar"}})).toEqual([expect.objectContaining({ref:`google_calendar:${binding}`,state:"disconnected"})]);
  expect(selections.join(" ")).not.toMatch(/token|subject|\*/);expect(f.rpc).not.toHaveBeenCalled();
 });
 it("reports a failed store to the composer instead of inventing an empty healthy source",async()=>{
  const q={select:()=>q,eq:()=>q,then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:null,error:{message:"unavailable"}}).then(resolve)};f.query.mockReturnValue(q);
  await expect(googleBusinessProfileConnectionSource().list({workspaceId:business,access:{provider:"google_business_profile",through:{kind:"unknown"},approval:"none"}})).rejects.toThrow(/unavailable/);
 });
});
