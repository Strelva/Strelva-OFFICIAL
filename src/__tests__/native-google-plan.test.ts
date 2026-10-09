import { describe, expect, it } from "vitest";
import { possibilitySchema } from "@/platform/possibilities/contracts";
import { accountBindingWithSecretsSchema } from "@/platform/account-bindings/contracts";
import { planFingerprint } from "@/platform/make-real/approvals";
import { assertNativeGooglePlan, nativeGoogleGrantGeneration, type NativeGooglePlan } from "@/products/google-listing/native/contracts";
const id="10000000-0000-4000-8000-000000000001",bindingId="10000000-0000-4000-8000-000000000002",at="2026-10-09T00:00:00.000Z";
const binding=accountBindingWithSecretsSchema.parse({id:bindingId,workspaceId:id,provider:"google",subject:"authorized-google-user",originTenantId:null,originTenantStableId:null,scopes:["https://www.googleapis.com/auth/business.manage"],tokenExpiresAt:null,status:"connected",lastCheckedAt:null,lastError:null,migratedFrom:"oauth",createdAt:at,updatedAt:at,locations:[{accountId:"accounts/exact",locationId:"exact",title:null,isPrimary:true}],refreshTokenCiphertext:"enc:fixture",accessTokenCiphertext:"enc:fixture"});
const grant={bindingId,accountId:"accounts/exact",grantGeneration:nativeGoogleGrantGeneration(binding)};
const request={tenantId:`workspace-${id}`,locationId:"exact",eventId:"exact",draftDigest:"a".repeat(64),nativeGrant:grant};
const proposal=possibilitySchema.parse({version:1,id:"proposal-exact",businessId:id,title:"Exact plan",intent:"One Google change",status:"ready",revision:1,candidateRevision:1,propagation:"new_outputs_only",changes:[],introduces:[],connections:[],effects:[{id:"google",kind:"publish",channel:"google_listing",system:{introducedKey:"listing"},description:"Exact Google effect",request,after:[]}],checks:[{id:"readback",description:"Matched actual provider"}],createdBy:id,createdAt:at,updatedAt:at,history:[]});
const scope:NativeGooglePlan={workspaceId:id,possibilityId:proposal.id,candidateRevision:1,planFingerprint:planFingerprint(proposal),effectId:"google",request,grant};
describe("native Google full approval and grant binding",()=>{
 it("accepts actual native NULL origin and rejects scope/account/place/grant changes",()=>{
  expect(()=>assertNativeGooglePlan(scope,proposal,binding)).not.toThrow();
  for(const change of [{originTenantId:"legacy"},{subject:null},{status:"revoked" as const},{refreshTokenCiphertext:"rotated"},{locations:[{...binding.locations[0]!,accountId:"accounts/other"}]},{scopes:null}])expect(()=>assertNativeGooglePlan(scope,proposal,{...binding,...change})).toThrow();
 });
 it("rejects whole-plan changes, introductions, connections, revisions and extra effects",()=>{
  for(const change of [{candidateRevision:2},{changes:[{baseline:{businessId:id,systemId:"other",revisionId:"revision",number:1},candidate:{summary:"Unapproved",content:{x:1}}}]},{introduces:[{key:"extra",name:"Unapproved",purpose:"Unapproved",candidate:{summary:"Unapproved",content:{x:1}},extractedFrom:[],conflicts:[]}]},{connections:[{id:"extra",from:{introducedKey:"listing"},to:{introducedKey:"extra"},kind:"read" as const,purpose:"Unapproved"}]},{effects:[...proposal.effects,{...proposal.effects[0]!,id:"extra"}]}])expect(()=>assertNativeGooglePlan(scope,{...proposal,...change},binding)).toThrow();
 });
});
