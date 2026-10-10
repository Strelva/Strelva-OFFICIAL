import { afterEach, describe, expect, it, vi } from "vitest";
import { createInquiryFormAdapter } from "@/platform/make-real/live-adapters";
import type { DeclaredEffect } from "@/platform/possibilities/contracts";
const mocks=vi.hoisted(()=>({ db: null as unknown }));
vi.mock("@/platform/infra/db/client",()=>({getSupabase:()=>mocks.db}));
import { createInMemoryInquiryRepository, getInquiryRepository, __private } from "@/products/inquiries/repository";
const input={tenantId:"fixture-site",businessId:"business-1",requestId:"request-1",capabilityId:"capability-1",changeId:"change-1",
 action:"make_live" as const,version:2,idempotencyKey:"exact-approved-key",actorId:"current-owner"};
const request={tenantId:input.tenantId,businessId:input.businessId,requestId:input.requestId,capabilityId:input.capabilityId,changeId:input.changeId,version:input.version};
const effect:DeclaredEffect={id:"publication",kind:"publish",channel:"inquiry_form",system:{systemId:"11111111-1111-4111-8111-111111111111"},description:"Native inquiry",request,after:[],publish:{section:"contact",data:{}}};
afterEach(()=>{vi.unstubAllEnvs();mocks.db=null;});
async function acceptedRepository(){
 const repository=createInMemoryInquiryRepository(),claim=await repository.claimPublication(input);
 if(!claim.acquired)throw new Error("Expected native test claim winner");
 const accepted=await repository.markPublicationAccepted({tenantId:input.tenantId,claimId:claim.claim.id,claimToken:claim.claimToken,acceptanceId:"native-acceptance"});
 return {repository,accepted};
}
describe("exact read-only native recovery",()=>{
 it("reads an accepted claim with admissionOFF, never queues or executes, and never creates a missing/foreign key",async()=>{
  vi.stubEnv("STRELVA_INQUIRIES_RELEASE","0");vi.stubEnv("STRELVA_MAKE_REAL_LIVE","0");
  const {repository,accepted}=await acceptedRepository();
  const queue=vi.fn(async()=>{throw new Error("Recovery must not queue");}),execute=vi.fn(async()=>{throw new Error("Recovery must not execute");});
  const create=vi.spyOn(repository,"claimPublication"),lookup=vi.spyOn(repository,"findPublicationClaim");
  const adapter=createInquiryFormAdapter({queue,execute,claim:(tenant,id)=>repository.getPublicationClaim(tenant,id),find:args=>repository.findPublicationClaim(args)},
   {actor:{userId:input.actorId,verifiedEmail:"owned@example.test"},enabled:async()=>false});
  await expect(adapter.find({businessId:input.businessId,effect,idempotencyKey:input.idempotencyKey})).resolves.toEqual({found:true,providerRef:`${input.tenantId}|${accepted.id}`});
  await expect(adapter.find({businessId:input.businessId,effect,idempotencyKey:"missing-key"})).resolves.toEqual({found:false});
  await expect(adapter.find({businessId:input.businessId,effect:{...effect,request:{...request,tenantId:"foreign-site"}},idempotencyKey:input.idempotencyKey})).resolves.toEqual({found:false});
  expect(lookup).toHaveBeenCalledWith(input);expect(create).not.toHaveBeenCalled();expect(queue).not.toHaveBeenCalled();expect(execute).not.toHaveBeenCalled();
  expect(await repository.getPublicationClaim(input.tenantId,accepted.id)).toEqual(accepted);
  expect(await repository.findPublicationClaim({...input,idempotencyKey:"missing-key"})).toBeNull();
 });
 it("refuses every mismatched command/actor and keeps accepted data unchanged",async()=>{
  const {repository,accepted}=await acceptedRepository();
  for(const mismatch of [{businessId:"foreign-business"},{requestId:"foreign-request"},{capabilityId:"foreign-capability"},{changeId:"foreign-change"},
   {action:"undo" as const},{version:3},{actorId:"foreign-owner"},{actorId:null}]){
   await expect(repository.findPublicationClaim({...input,...mismatch})).rejects.toThrow("different publication command");
   expect(await repository.getPublicationClaim(input.tenantId,accepted.id)).toEqual(accepted);
  }
 });
 it("older internal ports fail closed without queue fallback",async()=>{
  const queue=vi.fn(async()=>{throw new Error("No mutation fallback");});
  const adapter=createInquiryFormAdapter({queue,execute:async()=>({accepted:false,verified:false}),claim:async()=>null},
   {actor:{userId:input.actorId,verifiedEmail:"owned@example.test"},enabled:async()=>false});
  await expect(adapter.find({businessId:input.businessId,effect,idempotencyKey:input.idempotencyKey})).resolves.toBeNull();expect(queue).not.toHaveBeenCalled();
 });
 it("actual PostgreSQL adapter issues only exact tenant/keySELECT and verifies full digest/actor",async()=>{
  const filters:Array<[string,string]>=[];
  const row={id:"native-claim",tenant_id:input.tenantId,tenant_stable_id:null,business_id:input.businessId,request_id:input.requestId,
   capability_id:input.capabilityId,change_id:input.changeId,action:input.action,version:input.version,idempotency_key:input.idempotencyKey,
   command_digest:__private.digest(input),status:"accepted",acceptance_id:"native-acceptance",provider_receipt:null,failure_reason:null,
   actor_id:input.actorId,governance_event_id:"event",created_at:"2026-10-09T00:00:00.000Z",accepted_at:"2026-10-09T00:00:01.000Z",updated_at:"2026-10-09T00:00:01.000Z"};
  let data:typeof row|null=row;
  const query={eq:(key:string,value:string)=>{filters.push([key,value]);return query;},maybeSingle:async()=>({data,error:null})};
  const select=vi.fn(()=>query),from=vi.fn(()=>({select}));mocks.db={from};
  const repository=getInquiryRepository();
  expect(await repository.findPublicationClaim(input)).toMatchObject({id:row.id,status:"accepted"});
  expect(from).toHaveBeenCalledWith("inquiry_publication_claims");expect(select).toHaveBeenCalledWith("*");
  expect(filters).toEqual([["tenant_id",input.tenantId],["idempotency_key",input.idempotencyKey]]);
  await expect(repository.findPublicationClaim({...input,actorId:"foreign"})).rejects.toThrow("different publication command");
  data=null;expect(await repository.findPublicationClaim({...input,idempotencyKey:"missing"})).toBeNull();
 });
});
