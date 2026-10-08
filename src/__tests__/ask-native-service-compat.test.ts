import { beforeEach,describe,expect,it,vi } from "vitest";
const fixture=vi.hoisted(()=>({missing:"PGRST205" as string|null,grants:[] as Array<{capability_id:string}>,ordinary:vi.fn(),reads:[] as string[],confirmationCap:"ordinary",consume:vi.fn()}));
vi.mock("@/platform/infra/db/client",()=>({getSupabase:()=>({from:(table:string)=>{
 fixture.reads.push(table);
 const result=table==="tenants"?{data:{stable_id:"45600000-0000-4000-8000-000000000020"},error:null}:table==="public_booking_requests"?{data:{tenant_stable_id:"45600000-0000-4000-8000-000000000020",request_id:"request"},error:null}:table==="public_website_bookings"?{data:[{capability_id:fixture.confirmationCap}],error:null}:table==="ask_native_service_setups"?{data:fixture.missing?null:[],error:fixture.missing?{code:fixture.missing}:null}:{data:fixture.grants,error:null};
 const query={select:()=>query,eq:()=>query,limit:()=>query,maybeSingle:()=>Promise.resolve(result),then:(resolve:(value:typeof result)=>unknown)=>Promise.resolve(result).then(resolve)};return query;
},rpc:async()=>({data:null,error:{code:"PGRST202"}})})}));
vi.mock("@/products/scheduling/public-booking-server",()=>({resolvePublishedPublicBooking:fixture.ordinary,createPublicWebsiteBookingService:vi.fn()}));
import { assertAskServiceTenantSource,readPublicAskServiceSetup,resolvePublicBookingWithAskSetup,guardAskServicePublicOperations,guardAskServiceConfirmation } from "@/products/scheduling/ask-service-public-server";
const cap="ask-service-"+"a".repeat(32);
const nativeId="45600000-0000-4000-8000-000000000077";
beforeEach(()=>{fixture.missing="PGRST205";fixture.grants=[];fixture.reads=[];fixture.ordinary.mockReset();fixture.confirmationCap="ordinary";fixture.consume.mockReset();});
describe("Ask successor transport compatibility",()=>{
 it("preserves ordinary native services on faithful PostgREST missing-table responses only when no accepted setup grant exists",async()=>{
  await expect(assertAskServiceTenantSource("fixture",nativeId,nativeId)).resolves.toBeUndefined();
  expect(fixture.reads).toContain("public_website_booking_grants");
  fixture.grants=[{capability_id:cap}];
  await expect(assertAskServiceTenantSource("fixture",nativeId,nativeId)).rejects.toThrow("unavailable");
 });
 it.each(["PGRST205","42P01","XX000"])("fails closed for reserved capabilities on %s",async code=>{
  fixture.missing=code;
  await expect(readPublicAskServiceSetup("fixture",cap)).rejects.toThrow();
  await expect(resolvePublicBookingWithAskSetup({tenantId:"fixture",capabilityId:cap})).rejects.toThrow();
  expect(fixture.ordinary).not.toHaveBeenCalled();
 });
 it("never falls back to an ordinary grant or mutates an admission when a reserved capability lacks its receipt",async()=>{
  fixture.missing=null;
  await expect(resolvePublicBookingWithAskSetup({tenantId:"fixture",capabilityId:cap})).rejects.toThrow("no accepted setup receipt");
  const reserve=vi.fn();const service=guardAskServicePublicOperations({reserve} as unknown as Parameters<typeof guardAskServicePublicOperations>[0]);
  await expect(service.reserve({tenantId:"fixture",capabilityId:cap} as Parameters<typeof service.reserve>[0])).rejects.toThrow("no accepted setup receipt");
  expect(reserve).not.toHaveBeenCalled();expect(fixture.ordinary).not.toHaveBeenCalled();
 });
 it("preserves ordinary tokens but refuses new setup tokens before consume on faithful missing RPC cache",async()=>{
  const token="a".repeat(43);
  await expect(guardAskServiceConfirmation(token)).resolves.toBeUndefined();
  const service=guardAskServicePublicOperations({confirm:fixture.consume} as unknown as Parameters<typeof guardAskServicePublicOperations>[0]);
  fixture.confirmationCap=cap;
  await expect(service.confirm(token)).rejects.toThrow("unavailable");
  expect(fixture.consume).not.toHaveBeenCalled();
 });
 it("does not add any setup query to ordinary capability resolution or unprojected UUID legacy services",async()=>{
  await resolvePublicBookingWithAskSetup({tenantId:"fixture",capabilityId:"ordinary"});
  await assertAskServiceTenantSource("fixture",nativeId);
  expect(fixture.ordinary).toHaveBeenCalledOnce();expect(fixture.reads).toEqual([]);
 });
});
