import { describe,it,expect,vi } from "vitest";
import { createGoogleListingAdapter,type GoogleMakeRealPorts,type GoogleMakeRealState } from "@/platform/make-real/google-adapter";
import type { DeclaredEffect } from "@/platform/possibilities/contracts";
const businessId="business";
const effect:DeclaredEffect={system:{systemId:"system"},description:"Publish Google draft",after:[],id:"effect",kind:"publish",channel:"google_listing",request:{tenantId:"acme",locationId:"location",eventId:"event",draftDigest:"a".repeat(64)}};
const input={businessId,effect,idempotencyKey:"activation:key"};
function fixture(){
 let state:GoogleMakeRealState={ready:true,receipt:null};
 const ports:GoogleMakeRealPorts={inspect:vi.fn(async()=>state),approve:vi.fn(async()=>{state={ready:false,receipt:{id:"receipt",status:"posted",readback:"matched",undo:true}};return {changed:true};}),verify:vi.fn(async()=>({ok:state.receipt?.readback==="matched",detail:"readback"})),undo:vi.fn(async()=>({status:"posted"}))};
 const adapter=createGoogleListingAdapter(ports,{actor:{userId:"owner",verifiedEmail:"owner@example.test"},enabled:async()=>true});
 return {ports,adapter,set:(next:GoogleMakeRealState)=>{state=next;}};
}
describe("governed native Google Make real",()=>{
 it("uses the claimed publishing owner and finds an accepted receipt after restart without another write",async()=>{
  const {adapter,ports}=fixture();
  const result=await adapter.perform(input);expect(result.status).toBe("accepted");
  if(result.status!=="accepted")throw Error("expected acceptance");
  expect(await adapter.readBack({businessId,providerRef:result.providerRef})).toMatchObject({ok:true});
  expect(await adapter.find(input)).toMatchObject({found:true,providerRef:result.providerRef});
  await adapter.perform(input);expect(ports.approve).toHaveBeenCalledTimes(1);
  expect(await adapter.compensate!({businessId,providerRef:result.providerRef,idempotencyKey:"undo"})).toMatchObject({ok:true});
 });
 it("keeps provider approval gated",async()=>{
  const {adapter,ports,set}=fixture();set({ready:false,reason:"API approval pending",receipt:null});
  expect(await adapter.ready!(input)).toEqual({ok:false,reason:"API approval pending"});
  expect(await adapter.perform(input)).toEqual({status:"rejected",reason:"API approval pending"});
  expect(ports.approve).not.toHaveBeenCalled();
 });
 it("never treats a missing or pending receipt as proof a crashed write did not land",async()=>{
  const {adapter,ports,set}=fixture();
  expect(await adapter.find(input)).toBeNull();
  ports.approve=vi.fn(async()=>{set({ready:false,receipt:{id:"receipt",status:"posting",readback:null,undo:false}});return {changed:false,reason:"google_write_unconfirmed"};});
  await expect(adapter.perform(input)).rejects.toThrow(/unconfirmed/);
  expect(await adapter.find(input)).toBeNull();
 });
 it("rechecks revoked current owner authority on recovery and undo",async()=>{
  const {adapter,ports}=fixture();const result=await adapter.perform(input);
  if(result.status!=="accepted")throw Error("expected acceptance");
  ports.inspect=vi.fn(async()=>{throw Error("revoked");});
  await expect(adapter.find(input)).rejects.toThrow("revoked");
  await expect(adapter.compensate!({businessId,providerRef:result.providerRef,idempotencyKey:"undo"})).rejects.toThrow("revoked");
  expect(ports.undo).not.toHaveBeenCalled();
 });
 it("records held/unverified changes as accepted effects but fails readback",async()=>{
  const {adapter,set}=fixture();set({ready:false,receipt:{id:"receipt",status:"held_by_google",readback:"held_by_google",undo:true}});
  const result=await adapter.perform(input);if(result.status!=="accepted")throw Error("expected acceptance");
  expect(await adapter.readBack({businessId,providerRef:result.providerRef})).toMatchObject({ok:false});
 });
});
