import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
const lifecycle=vi.hoisted(()=>vi.fn());
vi.mock("@/products/publishing/server",()=>({publishingEnabledForWorkspace:async()=>true}));
vi.mock("@/products/google-listing/native/server",()=>({nativeGoogleLifecycle:lifecycle}));
vi.mock("@/platform/account-bindings/store",()=>({googleBindingsEnabled:()=>true,bindingEncryptionReady:()=>true,encryptForBinding:(value:string)=>`enc:${value}`}));
import { beginNativeGoogleOAuth,finishNativeGoogleOAuth,verifyNativeGoogleOAuth } from "@/products/google-listing/native/oauth";
const actor={userId:"10000000-0000-4000-8000-000000000001",verifiedEmail:"owner@example.test"},target={workspaceId:actor.userId,googlePrincipalEmail:"google@example.test",accountId:"accounts/exact",locationId:"exact"};
beforeEach(()=>{vi.stubEnv("OAUTH_STATE_SECRET","fixture-private-secret");vi.stubEnv("NEXT_PUBLIC_APP_URL","https://app.example.test");vi.stubEnv("GOOGLE_CLIENT_ID","fixture");vi.stubEnv("GOOGLE_CLIENT_SECRET","fixture");lifecycle.mockReset().mockResolvedValue({status:"connected",bindingId:actor.userId,workspaceId:target.workspaceId,accountId:target.accountId,locationId:target.locationId});});afterEach(()=>vi.unstubAllEnvs());
describe("signed native Google account/place consent",()=>{
 it("binds real owner, nonce, exact account/place and expiry; refuses before provider calls",async()=>{
  const started=await beginNativeGoogleOAuth(actor,target,"https://app.example.test");const url=new URL(started.url),state=url.searchParams.get("state")!;
  expect(verifyNativeGoogleOAuth(state,started.nonce,actor)).toMatchObject(target);
  for(const [badState,badNonce,badActor] of [[state+"x",started.nonce,actor],[state,"wrong",actor],[state,started.nonce,{...actor,userId:"other"}]] as const)expect(()=>verifyNativeGoogleOAuth(badState,badNonce,badActor)).toThrow();
  const fetcher=vi.fn();await expect(finishNativeGoogleOAuth(actor,state,"wrong","code","https://app.example.test",fetcher)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
  expect(()=>verifyNativeGoogleOAuth(state,started.nonce,actor,Date.now()+700000)).toThrow();
 });
 it("consumes signed state once and confirms selected account/place before encrypted native commit",async()=>{
  const started=await beginNativeGoogleOAuth(actor,target,"https://app.example.test"),state=new URL(started.url).searchParams.get("state")!;
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({access_token:"fixture-access",refresh_token:"fixture-refresh",scope:"openid https://www.googleapis.com/auth/business.manage",expires_in:3600}))).mockResolvedValueOnce(new Response(JSON.stringify({sub:"exact-user",email:"google@example.test",email_verified:true}))).mockResolvedValueOnce(new Response(JSON.stringify({locations:[{name:"locations/exact"}]})));
  await finishNativeGoogleOAuth(actor,state,started.nonce,"code","https://app.example.test",fetcher);
  expect(lifecycle.mock.calls.map(call=>call[2])).toEqual(["begin_oauth","consume_oauth","finish_oauth"]);
  expect(String(fetcher.mock.calls[2]![0])).toContain("accounts/exact/locations");
  expect(lifecycle.mock.calls[2]![3]).toMatchObject({subject:"exact-user",accessTokenCiphertext:"enc:fixture-access",refreshTokenCiphertext:"enc:fixture-refresh"});
  lifecycle.mockRejectedValueOnce(new Error("consumed"));const again=vi.fn();await expect(finishNativeGoogleOAuth(actor,state,started.nonce,"code","https://app.example.test",again)).rejects.toThrow();expect(again).not.toHaveBeenCalled();
 });
 it("refuses a different verified Google principal before place reads or native token commit",async()=>{
  const started=await beginNativeGoogleOAuth(actor,target,"https://app.example.test"),state=new URL(started.url).searchParams.get("state")!;
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({access_token:"fixture-access",refresh_token:"fixture-refresh",scope:"openid https://www.googleapis.com/auth/business.manage",expires_in:3600}))).mockResolvedValueOnce(new Response(JSON.stringify({sub:"other-user",email:"other@example.test",email_verified:true})));
  await expect(finishNativeGoogleOAuth(actor,state,started.nonce,"code","https://app.example.test",fetcher)).rejects.toThrow("named account principal");expect(fetcher).toHaveBeenCalledTimes(2);expect(lifecycle.mock.calls.map(call=>call[2])).toEqual(["begin_oauth","consume_oauth","fail_oauth"]);
 });
 it("does not persist a token for a different selected place",async()=>{
  const started=await beginNativeGoogleOAuth(actor,target,"https://app.example.test"),state=new URL(started.url).searchParams.get("state")!;
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({access_token:"fixture-access",refresh_token:"fixture-refresh",scope:"openid https://www.googleapis.com/auth/business.manage",expires_in:3600}))).mockResolvedValueOnce(new Response(JSON.stringify({sub:"exact-user",email:"google@example.test",email_verified:true}))).mockResolvedValueOnce(new Response(JSON.stringify({locations:[{name:"locations/other"}]})));
  await expect(finishNativeGoogleOAuth(actor,state,started.nonce,"code","https://app.example.test",fetcher)).rejects.toThrow("exact selected");expect(lifecycle.mock.calls.map(call=>call[2])).not.toContain("finish_oauth");
 });
});
